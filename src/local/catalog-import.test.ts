import { it, expect } from "vitest";
import { mkdtemp, mkdir, writeFile, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { gzipSync, gunzipSync } from "node:zlib";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
const run = promisify(execFile);
const script = resolve("scripts/import-production-catalog.ts");
const runner = resolve("node_modules/tsx/dist/cli.mjs");
it("完整导入保留旧 ID、登录证据，关闭缺席岗位；摘要不泄漏原始账号资料，重复导入稳定", async () => {
  const dir = await mkdtemp(join(tmpdir(), "aioffer-catalog-"));
  try {
    await mkdir(join(dir,"data"));
    const base = {companyName:"合成企业",title:"工程师",locations:[],applicationUrl:"https://example.com/job",description:"公开说明",channel:"social",salary:"",tags:[],verifiedAt:null};
    await writeFile(join(dir,"data/jobs.json.gz"),gzipSync(JSON.stringify({total:2,exportedAt:"2026-09-15",items:[{...base,jobId:"old-id"},{...base,jobId:"closed-id",applicationUrl:"https://example.com/closed"}]})));
    const input = {queriedAt:"2026-09-16T00:00:00Z",filter:{"publication.visibility":"PUBLIC","publication.lifecycle":"ACTIVE","summary.capabilities.applicationAllowed":true},counts:{required:1},jobs:[{jobId:"new-source-id",companyName:"合成企业",title:"工程师",applicationUrl:base.applicationUrl,loginRequirement:{status:"required",scope:"job",verificationMethod:"manual_apply_flow",verifiedAt:"2026-09-15T00:00:00Z",evidenceUrl:"https://example.com/evidence"},ownerUserId:"PRIVATE_ACCOUNT_MUST_NOT_SHIP"}],executions:[{jobId:"new-source-id",applicationUrl:base.applicationUrl,status:"succeeded",batchUpdatedAt:"2026-09-15T00:00:00Z",answers:{name:"PRIVATE_ANSWER_MUST_NOT_SHIP"}}]};
    const path=join(dir,"input.json");await writeFile(path,JSON.stringify(input));
    await run(process.execPath,[runner,script,path],{cwd:dir});
    const first=await readFile(join(dir,"data/jobs.json.gz"));
    const decoded=gunzipSync(first).toString();const catalog=JSON.parse(decoded);
    expect(catalog.items[0]).toMatchObject({jobId:"old-id",sourceJobId:"new-source-id",availability:"active",description:"公开说明",loginRequirement:input.jobs[0]!.loginRequirement,deliveryEvidence:{successfulOn:"2026-09-15"}});
    expect(catalog.items[1].availability).toBe("unavailable");
    expect(decoded).not.toContain("PRIVATE_");
    await run(process.execPath,[runner,script,path],{cwd:dir});
    expect(await readFile(join(dir,"data/jobs.json.gz"))).toEqual(first);
    input.counts.required=2;await writeFile(path,JSON.stringify(input));
    await expect(run(process.execPath,[runner,script,path],{cwd:dir})).rejects.toThrow("拒绝部分导出");
    expect(await readFile(join(dir,"data/jobs.json.gz"))).toEqual(first);
  } finally { await rm(dir,{recursive:true,force:true}); }
});
