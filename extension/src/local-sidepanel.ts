document.getElementById('open')!.addEventListener('click',()=>{void chrome.tabs.create({url:'http://127.0.0.1:19876/'});});
document.getElementById('disconnect')!.addEventListener('click',()=>{
  chrome.runtime.sendMessage({type:'LOCAL_ACCOUNT_LOGOUT'},()=>{
    document.getElementById('connection')!.textContent=chrome.runtime.lastError?'断开失败，请关闭插件并检查本地服务':'连接已断开。';
  });
});
