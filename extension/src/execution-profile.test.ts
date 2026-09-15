import {afterEach,describe,it,expect,vi} from 'vitest';
import {readExecutionProfile,executionProfileOrigin} from './execution-profile.js';
import {rememberAutoApplyProductOrigin,type AutoApplyRuntimeCredential} from './auto-apply-client.js';
const credential:AutoApplyRuntimeCredential={schemaVersion:'auto-apply-runtime-credential.v1',gatewayBaseUrl:'http://127.0.0.1:19876/automation',tenantId:'local',userId:'local-user',deviceId:'device',deviceToken:'test-only',pairedAt:'2026-09-15T00:00:00Z',productOrigin:'http://127.0.0.1:19876',productClientInstanceId:'client-instance-local-0001'};
const task={batchId:'batch',jobId:'job'};
const profile={schemaVersion:'candidate-application-profile.v1',revision:'a'.repeat(64),sequence:1,facts:[],overrides:[{semanticKey:'candidate.gender',value:'女'}]};
afterEach(()=>vi.unstubAllGlobals());
describe('不可变本地资料快照',()=>{
 it('读取确认快照，无网络调用，不修改原对象',async()=>{const network=vi.fn();vi.stubGlobal('fetch',network);const result=await readExecutionProfile(credential,{applicationProfile:profile},task);expect(result).toMatchObject(profile);expect(network).not.toHaveBeenCalled();expect(result).not.toBe(profile);});
 it.each(['https://aioffer.succaiss.com/profile','https://evil.example/profile','http://localhost:9999/profile','http://127.0.0.1:19876/profile'])('任何远程资料地址都被拒绝：%s',async url=>{const network=vi.fn();vi.stubGlobal('fetch',network);await expect(readExecutionProfile(credential,{applicationProfile:profile,applicationProfileUrl:url},task)).rejects.toThrow();expect(network).not.toHaveBeenCalled();});
 it.each(['https://aioffer-test.succaiss.com','http://localhost:9999','https://evil.example','http://user:password@localhost:19876'])('拒绝非法产品来源：%s',url=>expect(()=>executionProfileOrigin(url)).toThrow());
 it('不会使用非法快照',async()=>{await expect(readExecutionProfile(credential,{applicationProfile:{facts:'bad'}},task)).rejects.toThrow();});
 it('中断后不再读取资料',async()=>{const controller=new AbortController();controller.abort();await expect(readExecutionProfile(credential,{applicationProfile:profile},task,controller.signal)).rejects.toThrow();});
 it('岗位专属答案不能进入其他岗位',async()=>{const fact={schemaVersion:'candidate-application-profile-fact.v1',semanticKey:'field:basic.gender',fieldBinding:{jobId:'other',stableFieldKey:'basic.gender',sectionKey:'basic',groupIndex:null},stableFieldKeys:['basic.gender'],label:'性别',normalizedLabel:'性别',observedSites:[],value:'女',source:'user_confirmed',confirmedAt:'2026-09-15T00:00:00Z',updatedAt:'2026-09-15T00:00:00Z'};expect((await readExecutionProfile(credential,{applicationProfile:{...profile,facts:[fact]}},task)).facts).toEqual([]);});
 it('只记住当前绑定设备的本机来源',async()=>{const set=vi.fn();vi.stubGlobal('chrome',{storage:{local:{get:async()=>({autoApplyRuntimeCredential:{...credential,productOrigin:undefined}}),set}}});await expect(rememberAutoApplyProductOrigin(credential.productOrigin,'other',credential.productClientInstanceId)).rejects.toThrow();expect(set).not.toHaveBeenCalled();await rememberAutoApplyProductOrigin(credential.productOrigin,'device',credential.productClientInstanceId);expect(set).toHaveBeenCalledWith({autoApplyRuntimeCredential:credential});});
});
