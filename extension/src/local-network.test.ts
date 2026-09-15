import {describe,it,expect} from 'vitest';
import {assertLocalTransport} from './local-network.js';
describe('扩展网络出口',()=>{
 it.each(['http://127.0.0.1:19876/files/a','http://localhost:19876/automation'])('允许本地 %s',url=>expect(()=>assertLocalTransport(url)).not.toThrow());
 it.each(['https://cloud.succaiss.com','https://api.openai.com','https://example.com','http://localhost:19877','http://u:p@localhost:19876','file:///etc/passwd'])('禁止后台直连 %s',url=>expect(()=>assertLocalTransport(url)).toThrow());
});
