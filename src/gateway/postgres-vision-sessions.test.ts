
import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { PgGatewayDatabase, createPostgresGatewayRepositories } from "./postgres-storage.js";
import { VisionAgent } from "./vision-agent.js";

const databaseUrl=process.env.RECRUITING_GATEWAY_TEST_DATABASE_URL;
const identity={tenantId:"pg-vision-test-"+randomUUID(),userId:randomUUID(),deviceId:randomUUID()};
describe.skipIf(!databaseUrl)("PostgreSQL shared vision sessions and safe diagnostics",()=>{
  let first:PgGatewayDatabase;
  let second:PgGatewayDatabase;
  beforeAll(async()=>{
    if(!new URL(databaseUrl!).pathname.startsWith("/recruiting_gateway_test_"))throw new Error("Dedicated PG test database required");
    first=new PgGatewayDatabase(databaseUrl!,{maxConnections:2});
    second=new PgGatewayDatabase(databaseUrl!,{maxConnections:2});
    await Promise.all([first.migrate(),second.migrate()]);
  },30_000);
  afterAll(async()=>{
    if(!first)return;
    await first.query("DELETE FROM recruiting_gateway.vision_sessions WHERE tenant_id=$1",[identity.tenantId]);
    await Promise.all([first.close(),second.close()]);
  },30_000);

  it("continues a session on another replica and after the original agent restarts",async()=>{
    const one=new VisionAgent({sessionStore:createPostgresGatewayRepositories(first).visionSessions});
    const two=new VisionAgent({sessionStore:createPostgresGatewayRepositories(second).visionSessions});
    const session=await one.createSession(identity);
    expect((await two.plan(session.sessionId,{},identity)).sessionId).toBe(session.sessionId);
    const restarted=new VisionAgent({sessionStore:createPostgresGatewayRepositories(second).visionSessions});
    expect((await restarted.plan(session.sessionId,{},identity)).sessionId).toBe(session.sessionId);
    for(const mismatch of [{tenantId:"other"},{userId:"other"},{deviceId:"other"}]){
      await expect(restarted.plan(session.sessionId,{}, {...identity,...mismatch})).rejects.toThrow("不属于当前设备");
    }
    const changedProvider=new VisionAgent({providerCode:"other",sessionStore:createPostgresGatewayRepositories(second).visionSessions});
    await expect(changedProvider.plan(session.sessionId,{providerCode:"other"},identity)).rejects.toThrow("不支持");
    const expired=new VisionAgent({now:()=>new Date(Date.parse(session.expiresAt!)+1),sessionStore:createPostgresGatewayRepositories(second).visionSessions});
    await expect(expired.plan(session.sessionId,{},identity)).rejects.toThrow("已过期");
  },30_000);

  it("counts a storage failure once across query and transaction and logs only a safe SQLSTATE",async()=>{
    const logs=vi.spyOn(console,"error").mockImplementation(()=>undefined);
    const prior=first.storageErrorCounts()["22P02"]??0;
    const secretMarker="private-fixture-never-log";
    try{
      await expect(first.transaction("diagnostic-test",async()=>{
        await first.query("SELECT $1::integer",[secretMarker]);
      })).rejects.toMatchObject({code:"22P02"});
      expect(first.storageErrorCounts()["22P02"]).toBe(prior+1);
      expect(logs.mock.calls).toEqual([["[GatewayStorage]","query","22P02"]]);
      expect(JSON.stringify(logs.mock.calls)).not.toContain(secretMarker);
      expect(JSON.stringify(logs.mock.calls)).not.toContain("SELECT");
      await expect(first.transaction("business-error",async()=>{throw new Error(secretMarker);})).rejects.toThrow(secretMarker);
      expect(logs).toHaveBeenCalledTimes(1);
    }finally{logs.mockRestore();}
  },30_000);
  it("classifies pool and connection failures without leaking error messages or counting them twice",async()=>{
    const logs=vi.spyOn(console,"error").mockImplementation(()=>undefined);
    const connect=vi.spyOn(first.pool,"connect");
    const marker="private-connection-reference-never-log";
    try{
      connect.mockRejectedValueOnce(Object.assign(new Error(marker),{code:"ECONNREFUSED"}));
      await expect(first.transaction("connect-failure",async()=>undefined)).rejects.toThrow(marker);
      connect.mockRejectedValueOnce(new Error(marker));
      await expect(first.query("SELECT 1")).rejects.toThrow(marker);
      expect(logs.mock.calls).toEqual([
        ["[GatewayStorage]","connect","CONNECTION_ERROR"],
        ["[GatewayStorage]","connect","POOL_CONNECT_TIMEOUT"]
      ]);
      expect(first.storageErrorCounts().CONNECTION_ERROR).toBe(1);
      expect(first.storageErrorCounts().POOL_CONNECT_TIMEOUT).toBe(1);
      expect(JSON.stringify(logs.mock.calls)).not.toContain(marker);
    }finally{connect.mockRestore();logs.mockRestore();}
  },30_000);

});
