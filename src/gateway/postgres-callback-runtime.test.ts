
import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { PgGatewayDatabase,createPostgresGatewayRepositories } from "./postgres-storage.js";
import { PgCallbackOutboxRepository } from "./postgres-callback-outbox.js";
import { gatewayOwnerKey } from "./postgres-database.js";
import { GatewayRuntime } from "./gateway-runtime.js";
import type { AutoApplyBatch,AutoApplyCallbackDelivery } from "./auto-apply-contract.js";

const databaseUrl=process.env.RECRUITING_GATEWAY_TEST_DATABASE_URL;
const tenantId="pg-callback-runtime-"+randomUUID();
function fixture():AutoApplyBatch{
  const now=new Date().toISOString();
  return {
    tenantId,userId:randomUUID(),deviceId:randomUUID(),schemaVersion:"auto-apply-batch.v1",
    batchId:randomUUID(),idempotencyKey:randomUUID(),status:"completed",
    candidate:{packageRef:"fixture",packageVersion:"1",packageSha256:"a".repeat(64),
      applicationProfile:{schemaVersion:"candidate-application-profile.v1",revision:"b".repeat(64),facts:[]}},
    assets:[],jobs:[],confirmation:{scope:"batch",confirmedByUser:true,confirmedAt:now,displayedJobIds:[],allowAutomaticFinalSubmit:true},
    safety:{allowConsentClick:false},executionPolicy:{loginPolicy:"skip_and_report",concurrency:1,retryBeforeSubmit:1,
      captchaPolicy:"skip_and_report",missingInformationPolicy:"skip_and_report",ambiguousConsentPolicy:"skip_and_report"},
    callback:{url:"https://callback.example.test/fixture",secretRef:"fixture"},authorizationId:randomUUID(),
    authorizationExpiresAt:now,revision:1,createdAt:now,updatedAt:now
  };
}
function delivery(status:"delivered"|"failed",marker:string):AutoApplyCallbackDelivery{
  return {status,eventId:marker,attempts:1,lastAttemptAt:new Date().toISOString(),
    deliveredAt:status==="delivered"?new Date().toISOString():null,lastError:status==="failed"?marker:null};
}
describe.skipIf(!databaseUrl)("PostgreSQL callback runtime fencing",()=>{
  let first:PgGatewayDatabase;
  let second:PgGatewayDatabase;
  beforeAll(async()=>{
    if(!new URL(databaseUrl!).pathname.startsWith("/recruiting_gateway_test_"))throw new Error("Dedicated PG test database required");
    first=new PgGatewayDatabase(databaseUrl!,{maxConnections:3});
    second=new PgGatewayDatabase(databaseUrl!,{maxConnections:3});
    await Promise.all([first.migrate(),second.migrate()]);
  },30_000);
  afterAll(async()=>{
    if(!first)return;
    await first.query("DELETE FROM recruiting_gateway.callback_outbox WHERE tenant_id=$1",[tenantId]);
    await first.query("DELETE FROM recruiting_gateway.batches WHERE tenant_id=$1",[tenantId]);
    await Promise.all([first.close(),second.close()]);
  },30_000);

  it.each(["delivered","failed"] as const)("does not let a stale %s response overwrite the newer worker metadata",async(status)=>{
    const record=fixture();
    const one=createPostgresGatewayRepositories(first);
    await one.batches.save(record);
    await one.callbackOutbox.enqueue(record);
    const id=record.batchId+":1";
    await first.query("UPDATE recruiting_gateway.callback_outbox SET status='delivering',lease_token='old-worker',lease_expires_at=clock_timestamp()+interval '120 seconds',attempts=1 WHERE id=$1",[id]);
    const claim=vi.spyOn(PgCallbackOutboxRepository.prototype,"claim")
      .mockResolvedValueOnce([{id,batch:record,leaseToken:"old-worker",attempts:1}])
      .mockResolvedValueOnce([{id,batch:record,leaseToken:"new-worker",attempts:2}]);
    const oldRuntime=new GatewayRuntime(first);
    const newRuntime=new GatewayRuntime(second);
    let release!:(value:AutoApplyCallbackDelivery)=>void;
    let ready!:()=>void;
    const started=new Promise<void>((resolve)=>{ready=resolve;});
    const pending=oldRuntime["deliverCallbacks"]({validate:()=>undefined,deliver:async()=>{
      ready();return new Promise<AutoApplyCallbackDelivery>((resolve)=>{release=resolve;});
    }});
    try{
      await started;
      await second.query("UPDATE recruiting_gateway.callback_outbox SET lease_token='new-worker',lease_expires_at=clock_timestamp()+interval '120 seconds',attempts=2 WHERE id=$1",[id]);
      const accepted=delivery("delivered","new-worker-evidence");
      await newRuntime["deliverCallbacks"]({validate:()=>undefined,deliver:async()=>accepted});
      expect((await one.batches.get(record.batchId))?.callbackDelivery).toEqual(accepted);
      release(delivery(status,"old-worker-must-not-overwrite"));
      await pending;
      const final=await one.batches.get(record.batchId);
      expect(final).toEqual({...record,callbackDelivery:accepted});
      expect((await first.query("SELECT status,lease_token FROM recruiting_gateway.callback_outbox WHERE id=$1",[id])).rows[0])
        .toEqual({status:"delivered",lease_token:null});
    }finally{
      release?.(delivery(status,"cleanup"));
      await pending;
      claim.mockRestore();
      await Promise.all([oldRuntime.stop(),newRuntime.stop()]);
    }
  },30_000);

  it("checks the current clock when a lease expires after the owner transaction began",async()=>{
    const record=fixture();const repos=createPostgresGatewayRepositories(first);
    await repos.batches.save(record);await repos.callbackOutbox.enqueue(record);
    const id=record.batchId+":1";
    await first.transaction(gatewayOwnerKey(tenantId,record.userId),async()=>{
      await first.query("UPDATE recruiting_gateway.callback_outbox SET status='delivering',lease_token='expired-worker',lease_expires_at=clock_timestamp()+interval '30 milliseconds' WHERE id=$1",[id]);
      await first.query("SELECT pg_sleep(0.06)");
      expect(await repos.callbackOutbox.complete(id,"expired-worker")).toBe(false);
      expect(await repos.callbackOutbox.retry(id,"expired-worker","expired")).toBe(false);
    });
    expect((await repos.batches.get(record.batchId))?.callbackDelivery).toBeUndefined();
  },30_000);
});
