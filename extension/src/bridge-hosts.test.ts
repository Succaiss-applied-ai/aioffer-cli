import {describe,it,expect} from 'vitest';
import {isAllowedBridgeUrl,isAllowedProductBridgeUrl} from './bridge-hosts.js';
describe('本地连接白名单',()=>{
 for(const allowed of [isAllowedBridgeUrl,isAllowedProductBridgeUrl]){
  it.each(['http://127.0.0.1:19876/','http://localhost:19876/jobs'])('允许 %s',url=>expect(allowed(url)).toBe(true));
  it.each(['https://aioffer.succaiss.com/jobs','https://aioffer-test.succaiss.com/jobs','https://xiaopeng.jobs.feishu.cn/apply','http://127.0.0.1:33250/','http://localhost.evil.example:19876/','chrome://extensions','not-a-url'])('拒绝 %s',url=>expect(allowed(url)).toBe(false));
 }
});
