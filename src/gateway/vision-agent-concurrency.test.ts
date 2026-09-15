
import { afterEach, describe, expect, it, vi } from "vitest";
import { VisionAgent, type VisionSession, type VisionSessionStore } from "./vision-agent.js";

const identity = { tenantId:"tenant",userId:"user",deviceId:"device" };
const configuration = { baseUrl:"https://model.example/v1",model:"fixture-model",apiKey:"test-only" };
const response = () => new Response(JSON.stringify({choices:[{message:{content:JSON.stringify({
  next:"no_action",confidence:1,actions:[],warnings:[],evidenceRefs:[]
})}}]}), {status:200,headers:{"content-type":"application/json"}});
afterEach(() => vi.unstubAllGlobals());

describe("VisionAgent durable sessions and actual execution limits", () => {
  it("does not acknowledge a session before its store has committed", async () => {
    let release!:()=>void;
    let stored:VisionSession|null=null;
    const store:VisionSessionStore={
      save:async(session)=>{ await new Promise<void>((resolve)=>{release=resolve;});stored=session; },
      get:async()=>stored
    };
    const agent = new VisionAgent({sessionStore:store});
    let acknowledged=false;
    const creation=agent.createSession(identity).then((session)=>{acknowledged=true;return session;});
    await Promise.resolve();
    expect(acknowledged).toBe(false);
    expect(stored).toBeNull();
    release();
    const session=await creation;
    expect(stored).toEqual(session);
    expect(acknowledged).toBe(true);
  });

  it("holds eight slots until the actual model promises settle and rejects excess work with retryable 503", async () => {
    const pending:Array<(value:Response)=>void>=[];
    const fetchMock=vi.fn(()=>new Promise<Response>((resolve)=>{pending.push(resolve);}));
    vi.stubGlobal("fetch",fetchMock);
    const agent=new VisionAgent(configuration);
    const session=await agent.createSession(identity);
    const plans=Array.from({length:8},()=>agent.plan(session.sessionId,{},identity));
    expect(fetchMock).toHaveBeenCalledTimes(8);
    await expect(agent.plan(session.sessionId,{},identity)).rejects.toMatchObject({
      code:"GATEWAY_BUSY",status:503,retryable:true
    });
    expect(fetchMock).toHaveBeenCalledTimes(8);
    pending.splice(0).forEach((resolve)=>resolve(response()));
    expect((await Promise.all(plans)).every((plan)=>plan.configured)).toBe(true);
    fetchMock.mockImplementation(async()=>response());
    expect((await agent.plan(session.sessionId,{},identity)).configured).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(9);
  });

  it("releases the execution slot after a model failure while preserving the existing fallback", async () => {
    const fetchMock=vi.fn(async()=>new Response("denied",{status:403}));
    vi.stubGlobal("fetch",fetchMock);
    const agent=new VisionAgent({...configuration,maxConcurrentPlans:1});
    const session=await agent.createSession(identity);
    expect((await agent.plan(session.sessionId,{},identity)).next).toBe("manual_copy");
    fetchMock.mockImplementation(async()=>response());
    expect((await agent.plan(session.sessionId,{},identity)).configured).toBe(true);
  });

  it("keeps memory sessions compatible while enforcing owner, device, provider and expiry", async () => {
    let now=new Date();
    const agent=new VisionAgent({now:()=>now,sessionTtlMs:60_000});
    const session=await agent.createSession(identity);
    expect((await agent.plan(session.sessionId,{},identity)).sessionId).toBe(session.sessionId);
    for(const mismatch of [{tenantId:"other"},{userId:"other"},{deviceId:"other"}]){
      await expect(agent.plan(session.sessionId,{}, {...identity,...mismatch})).rejects.toThrow("不属于当前设备");
    }
    await expect(agent.plan(session.sessionId,{providerCode:"other"},identity)).rejects.toThrow("不支持");
    now=new Date(now.getTime()+60_000);
    await expect(agent.plan(session.sessionId,{},identity)).rejects.toThrow("已过期");
  });
});
