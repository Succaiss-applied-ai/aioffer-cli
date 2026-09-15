/** 扩展后台仅与本地服务交换数据。招聘网站由用户浏览器正常打开。 */
export function assertLocalTransport(input: string | URL | Request): void {
  const url=new URL(typeof input==='string'?input:input instanceof URL?input.href:input.url);
  const ownAsset=url.protocol==='chrome-extension:' && typeof chrome!=='undefined' && url.hostname===chrome.runtime.id;
  if (!ownAsset && !(url.protocol==='http:' && ['localhost','127.0.0.1'].includes(url.hostname) && url.port==='19876')) {
    throw new Error('本地插件禁止连接远端服务，请通过本机 aioffer-cli 配置模型和资料');
  }
  if(url.username||url.password)throw new Error('本地传输地址不能包含账号密码');
}
export function installLocalTransportGuard() {
  const original=globalThis.fetch.bind(globalThis);
  globalThis.fetch=(input,init)=>{assertLocalTransport(input);return original(input,{...init,redirect:'error'});};
}
