// @vitest-environment jsdom
// @vitest-environment-options {"url":"https://xiaopeng.jobs.feishu.cn/apply"}
import {afterEach,describe,it,expect,vi} from 'vitest';
import './bridge-content.js';
afterEach(()=>vi.unstubAllGlobals());
describe('招聘网站不能控制本地插件',()=>{
 it.each(['RECRUITING_AI_PLUGIN_INFO','RECRUITING_AI_DEVICE_CONTEXT','RECRUITING_DEVICE_BOOTSTRAP','RECRUITING_AUTO_APPLY_WAKE','RECRUITING_AI_ACCOUNT_LOGOUT','RECRUITING_AI_BRIDGE_COMMAND'])('静默拒绝 %s，不暴露设备信息',type=>{
  const sendMessage=vi.fn();vi.stubGlobal('chrome',{runtime:{sendMessage,lastError:null}});
  const post=vi.spyOn(window,'postMessage');
  window.dispatchEvent(new MessageEvent('message',{source:window,origin:window.location.origin,data:{type,requestId:'untrusted'}}));
  expect(sendMessage).not.toHaveBeenCalled();expect(post).not.toHaveBeenCalled();expect(document.documentElement.dataset.recruitingAiBridge).toBeUndefined();post.mockRestore();
 });
});
