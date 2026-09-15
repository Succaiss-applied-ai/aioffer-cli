import { randomUUID } from "node:crypto";
import { mkdtemp, readFile, rm, truncate, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { PgGatewayDatabase } from "./postgres-database.js";
import { migrateJsonGatewayState } from "./migrate-json-state.js";

const databaseUrl = process.env.RECRUITING_GATEWAY_MIGRATION_TEST_DATABASE_URL;
const tenantId = "migration-fixture-tenant";
const userId = "migration-fixture-user";
const deviceId = "migration-fixture-device";
const timestamp = "2025-09-10T00:00:00.000Z";
const authHash = "a".repeat(64);
const fixtureIdentity = { tenantId, userId, deviceId };

function command(commandId: string, future = false) {
  const createdAt = future ? new Date().toISOString() : timestamp;
  const expiresAt = future ? new Date(Date.now() + 3_600_000).toISOString() : "2025-09-10T00:30:00.000Z";
  return {
    commandId, runId: `run-${commandId}`, tenantId, userId, targetDeviceId: deviceId,
    status: "claimed", createdAt, claimedBy: deviceId, claimedAt: createdAt,
    leaseExpiresAt: expiresAt, executionExpiresAt: expiresAt, completedAt: null,
    retainedUnknownField: { stable: true },
    command: {
      schemaVersion:"ai-plugin-command.v1", commandId, tenantId,userId,conversationId:"fixture-conversation",
      issuedAt:createdAt, expiresAt,type:"browser.execute_batch_auto_apply_job",idempotencyKey:commandId,
      requiresUserGesture:false,payload:{batchId:"fixture-batch",batchJobId:"fixture-job",job:{jobId:"job-id"}},
      safety:{allowFinalSubmit:false,allowConsentClick:false,allowCaptchaHandling:false}
    }
  };
}

function sources() {
  const batch = {
    schemaVersion:"auto-apply-batch.v1",batchId:"fixture-batch",...fixtureIdentity,idempotencyKey:"fixture-idempotency",
    status:"completed_with_errors",revision:2,createdAt:timestamp,updatedAt:timestamp,
    candidate:{privateFixture:"candidate-payload-must-not-appear-in-report"},
    jobs:[{batchJobId:"fixture-job",jobId:"job-id",status:"failed",commandId:null,reasonCode:"command_delivery_timeout"}],
    retainedUnknownField:{original:true}
  };
  const run = {
    schemaVersion:"application-run.v1",runId:"00000000-0000-4000-8000-000000000042",status:"queued",revision:1,
    createdAt:timestamp,updatedAt:timestamp,confirmation:null,events:[],retainedUnknownField:{legacy:true},
    request:{...fixtureIdentity,schemaVersion:"application-run-request.v1",conversationId:"fixture",idempotencyKey:"fixture-run-key",
      job:{jobId:"fixture",companyName:"fixture",title:"fixture",city:"北京",applicationUrl:"https://example.com/jobs/fixture"},
      candidate:{profileRef:"fixture",snapshotVersion:"1",profile:{schemaVersion:"candidate-profile.v1",basic:{},preferences:{},educations:[],workExperiences:[],projects:[],research:[],awards:[],skills:[],additional:{}}},
      assets:[],executionPolicy:{mode:"manual_copy",allowAutoFill:false,allowSiteResumeParser:true,allowFinalSubmit:false}}
  };
  return {
    "auto-apply-batches.json":{schemaVersion:"auto-apply-batch-store.v1",batches:[batch]},
    "device-commands.json":{schemaVersion:"device-command-store.v1",commands:[command("fixture-expired-command")]},
    "paired-devices.json":{schemaVersion:"paired-device-store.v1",devices:[{schemaVersion:"paired-device.v1",...fixtureIdentity,deviceName:"fixture",pluginInstalled:true,pluginVersion:"1.0.1",runtimeVersion:null,registeredAt:timestamp,lastSeenAt:timestamp,capabilities:[]}]},
    "device-auth.json":{schemaVersion:"device-auth-store.v1",sessions:[],bootstrapSessions:[],credentials:[{schemaVersion:"device-credential.v1",credentialId:"fixture-credential",...fixtureIdentity,tokenHash:authHash,createdAt:timestamp,revokedAt:null}]},
    "application-runs.json":{schemaVersion:"application-gateway-run-store.v1",runs:[run],executorStates:{"00000000-0000-4000-8000-000000000042":{tabId:42,preserved:true}}}
  };
}

const tables = ["batches","commands","devices","pairing_sessions","bootstrap_sessions","credentials","runs","executor_states","owner_fences","callback_outbox","json_migration_checkpoints","vision_sessions"];
let directory: string;

async function writeSources(data = sources()) {
  for (const [name,value] of Object.entries(data)) await writeFile(join(directory,name),JSON.stringify(value),{mode:0o600});
}

beforeEach(async () => { directory = await mkdtemp(join(tmpdir(),"gateway-migration-fixture-")); });
afterEach(async () => { vi.restoreAllMocks(); await rm(directory,{recursive:true,force:true}); });

describe("JSON gateway migration validation", () => {
  it("dry-runs without accessing PostgreSQL and reports no candidate or authentication data", async () => {
    await writeSources();
    const database = { query:vi.fn(),migrate:vi.fn(),transaction:vi.fn() } as unknown as PgGatewayDatabase;
    const report = await migrateJsonGatewayState(database,directory,{apply:false});
    expect(report).toMatchObject({mode:"dry_run",verified:false,changedCommandIds:["fixture-expired-command"]});
    expect(report.tables.batches?.count).toBe(1);
    expect(report.tables.credentials?.count).toBe(1);
    expect(JSON.stringify(report)).not.toContain("candidate-payload-must-not-appear-in-report");
    expect(JSON.stringify(report)).not.toContain(authHash);
    expect(database.migrate).not.toHaveBeenCalled();
    expect(database.query).not.toHaveBeenCalled();
    expect(database.transaction).not.toHaveBeenCalled();
  });

  it("rejects an empty or wrong source directory instead of marking an empty migration complete", async () => {
    await expect(migrateJsonGatewayState({} as PgGatewayDatabase,directory,{apply:false})).rejects.toThrow("Required migration source is missing");
    await expect(migrateJsonGatewayState({} as PgGatewayDatabase,directory,{apply:true})).rejects.toThrow("Required migration source is missing");
  });

  it("allows an explicitly empty gateway with all four core source schemas present", async () => {
    await writeFile(join(directory,"auto-apply-batches.json"),JSON.stringify({schemaVersion:"auto-apply-batch-store.v1",batches:[]}));
    await writeFile(join(directory,"device-commands.json"),JSON.stringify({schemaVersion:"device-command-store.v1",commands:[]}));
    await writeFile(join(directory,"paired-devices.json"),JSON.stringify({schemaVersion:"paired-device-store.v1",devices:[]}));
    await writeFile(join(directory,"device-auth.json"),JSON.stringify({schemaVersion:"device-auth-store.v1",sessions:[],credentials:[]}));
    const report=await migrateJsonGatewayState({} as PgGatewayDatabase,directory,{apply:false});
    expect(Object.values(report.tables).every((table)=>table.count===0)).toBe(true);
    expect(report.sources["application-runs.json"].present).toBe(false);
  });

  it("requires the auth source when paired devices exist", async () => {
    await writeSources();
    await rm(join(directory,"device-auth.json"));
    await expect(migrateJsonGatewayState({} as PgGatewayDatabase,directory,{apply:false})).rejects.toThrow("device-auth.json");
  });

  it("refuses duplicate unexpired claimed automatic commands instead of choosing an attempt", async () => {
    const data=sources();data["device-commands.json"].commands=[command("first",true),command("second",true)];
    await writeSources(data);
    await expect(migrateJsonGatewayState({} as PgGatewayDatabase,directory,{apply:false})).rejects.toThrow("unexpired claimed");
  });

  it("checks file size before parsing and rejects unsupported schemas", async () => {
    await writeFile(join(directory,"device-commands.json"),"{}");
    await truncate(join(directory,"device-commands.json"),256*1024*1024+1);
    await expect(migrateJsonGatewayState({} as PgGatewayDatabase,directory,{apply:false})).rejects.toThrow("size limit");
    await writeFile(join(directory,"device-commands.json"),JSON.stringify({schemaVersion:"unexpected",commands:[]}));
    await expect(migrateJsonGatewayState({} as PgGatewayDatabase,directory,{apply:false})).rejects.toThrow("Unsupported schema");
  });
});

describe.skipIf(!databaseUrl)("JSON gateway migration with PostgreSQL", () => {
  let database: PgGatewayDatabase;
  beforeAll(async () => {
    if (!new URL(databaseUrl!).pathname.startsWith("/recruiting_gateway_test_migration_")) throw new Error("Migration tests require their own dedicated database");
    database=new PgGatewayDatabase(databaseUrl!,{maxConnections:2});await database.migrate();
  }, 30_000);
  beforeEach(async () => { await database.query(`TRUNCATE ${tables.map((name)=>`recruiting_gateway.${name}`).join(",")}`); });
  afterAll(async () => { if(database){await database.query(`TRUNCATE ${tables.map((name)=>`recruiting_gateway.${name}`).join(",")}`);await database.close();} });

  it("imports every record losslessly, verifies hashes, and makes repeated application idempotent", async () => {
    const original=sources();await writeSources(original);
    const before=await readFile(join(directory,"device-commands.json"),"utf8");
    const report=await migrateJsonGatewayState(database,directory,{apply:true});
    expect(report).toMatchObject({mode:"applied",verified:true,changedCommandIds:["fixture-expired-command"]});
    expect(report.tables.commands?.count).toBe(1);
    const stored=(await database.query("SELECT data FROM recruiting_gateway.batches")).rows[0]?.data;
    expect(stored).toEqual(original["auto-apply-batches.json"].batches[0]);
    expect((await database.query("SELECT data FROM recruiting_gateway.runs")).rows[0]?.data).toEqual(original["application-runs.json"].runs[0]);
    expect((await database.query("SELECT data FROM recruiting_gateway.credentials")).rows[0]?.data.tokenHash).toBe(authHash);
    expect((await database.query("SELECT data FROM recruiting_gateway.commands")).rows[0]?.data).toMatchObject({status:"expired",retainedUnknownField:{stable:true}});
    expect((await database.query("SELECT data FROM recruiting_gateway.executor_states")).rows[0]?.data).toEqual({tabId:42,preserved:true});
    expect(await readFile(join(directory,"device-commands.json"),"utf8")).toBe(before);
    expect(await migrateJsonGatewayState(database,directory,{apply:true})).toEqual({...report,mode:"already_migrated"});
  }, 30_000);

  it("refuses a different source when target already contains gateway data", async () => {
    await writeSources();await migrateJsonGatewayState(database,directory,{apply:true});
    const changed=sources();changed["auto-apply-batches.json"].batches[0]!.retainedUnknownField.original=false;
    await writeSources(changed);
    await expect(migrateJsonGatewayState(database,directory,{apply:true})).rejects.toThrow("not empty");
    expect((await database.query("SELECT count(*) FROM recruiting_gateway.batches")).rows[0]?.count).toBe("1");
  }, 30_000);

  it("rolls back all inserted tables and checkpoint on an injected database failure", async () => {
    await writeSources();
    const query=database.query.bind(database);
    vi.spyOn(database,"query").mockImplementation(async (sql,params) => {
      if(sql.startsWith("INSERT INTO recruiting_gateway.commands")) throw new Error("injected command write failure");
      return query(sql,params);
    });
    await expect(migrateJsonGatewayState(database,directory,{apply:true})).rejects.toThrow("injected command write failure");
    vi.restoreAllMocks();
    expect((await database.query("SELECT count(*) FROM recruiting_gateway.batches")).rows[0]?.count).toBe("0");
    expect((await database.query("SELECT count(*) FROM recruiting_gateway.json_migration_checkpoints")).rows[0]?.count).toBe("0");
  }, 30_000);

  it("detects a still-running source writer and rolls back instead of accepting a mixed snapshot", async () => {
    await writeSources();const query=database.query.bind(database);let changed=false;
    vi.spyOn(database,"query").mockImplementation(async (sql,params) => {
      const result=await query(sql,params);
      if(!changed&&sql.startsWith("INSERT INTO recruiting_gateway.commands")){
        changed=true;const source=sources()["auto-apply-batches.json"];
        await writeFile(join(directory,"auto-apply-batches.json"),JSON.stringify({...source,writerChanged:randomUUID()}));
      }
      return result;
    });
    await expect(migrateJsonGatewayState(database,directory,{apply:true})).rejects.toThrow("changed during import");
    vi.restoreAllMocks();
    expect((await database.query("SELECT count(*) FROM recruiting_gateway.batches")).rows[0]?.count).toBe("0");
  }, 30_000);

  it("rejects a same-count row whose content hash differs and rolls back the import", async () => {
    await writeSources();const query=database.query.bind(database);
    vi.spyOn(database,"query").mockImplementation(async (sql,params) => {
      const result=await query(sql,params);
      if(sql.startsWith("SELECT data AS data FROM recruiting_gateway.batches")) {
        return {...result,rows:result.rows.map((row)=>({...row,data:{...row.data,status:"running"}}))};
      }
      return result;
    });
    await expect(migrateJsonGatewayState(database,directory,{apply:true})).rejects.toThrow("row verification failed");
    vi.restoreAllMocks();
    expect((await database.query("SELECT count(*) FROM recruiting_gateway.batches")).rows[0]?.count).toBe("0");
  }, 30_000);


  it("restores undelivered terminal callbacks into the outbox without replaying delivered callbacks", async () => {
    const source=sources();const original=source["auto-apply-batches.json"].batches[0]!;
    const callback={url:"https://example.com/callback",secretRef:"fixture-secret-reference"};
    const failed=Object.assign(original,{callback,callbackDelivery:{status:"failed",eventId:"auto-apply-batch:fixture-batch:completed",attempts:3,lastAttemptAt:timestamp,deliveredAt:null,lastError:"callback_http_503"}});
    const delivered={...failed,batchId:"already-delivered",idempotencyKey:"delivered-key",callbackDelivery:{...failed.callbackDelivery,status:"delivered",deliveredAt:timestamp}};
    const pending={...failed,batchId:"pending-callback",idempotencyKey:"pending-key",callbackDelivery:{...failed.callbackDelivery,status:"pending",attempts:0}};
    source["auto-apply-batches.json"].batches.push(delivered,pending);
    await writeSources(source);
    const report=await migrateJsonGatewayState(database,directory,{apply:true});
    expect(report.tables.callback_outbox?.count).toBe(2);
    const rows=(await database.query("SELECT batch_id,status,attempts,data FROM recruiting_gateway.callback_outbox ORDER BY batch_id")).rows;
    expect(rows).toHaveLength(2);
    expect(rows.find((row)=>row.batch_id==="fixture-batch")).toMatchObject({status:"pending",attempts:0,data:failed});
    expect(rows.some((row)=>row.batch_id==="already-delivered")).toBe(false);
    expect((await database.query("SELECT data FROM recruiting_gateway.batches WHERE batch_id=$1",[failed.batchId])).rows[0]?.data).toEqual(failed);
  }, 30_000);

});
