// @vitest-environment jsdom
import {afterEach, beforeEach, describe, expect, it, vi} from "vitest";
import {resolveApplicationUserAction} from "./page-adapter.js";

// Component names come from the SDK loaded by the public Moka form. These
// fixtures verify its structural boundary, not a replay of the lost Meshy tab.
const challenge = (message = "Slide to complete the puzzle") => `<div class="yidun">
  <div class="yidun_panel"><img class="yidun_bgimg"><span class="yidun_slide_indicator">${message}</span></div>
  <div class="yidun_control"><div class="yidun_slider"></div></div></div>`;
beforeEach(() => {
  document.body.innerHTML = "";
  Object.defineProperty(HTMLElement.prototype,"innerText",{configurable:true,get(){return this.textContent??"";}});
  vi.spyOn(HTMLElement.prototype,"getBoundingClientRect").mockImplementation(function(this:HTMLElement){
    const y=this.dataset.offscreen ? 10000 : 20;
    return {x:20,y,top:y,left:20,right:220,bottom:y+40,width:200,height:40,toJSON(){}};
  });
});
afterEach(()=>{vi.restoreAllMocks();});
describe("visible SDK challenge handoff",()=>{
  it.each(["Slide to complete the puzzle","Drag the slider","", "向右拖动滑块"])("hands %s to the existing manual CAPTCHA state",message=>{
    document.body.innerHTML=challenge(message);
    expect(resolveApplicationUserAction()).toMatchObject({type:"captcha",message:expect.stringContaining("原投递页面")});
  });
  it.each(["display:none","visibility:hidden","opacity:0"])("ignores a challenge under a hidden ancestor (%s)",style=>{
    document.body.innerHTML=`<div style="${style}">${challenge()}</div>`;
    expect(resolveApplicationUserAction()).toBeNull();
  });
  it.each(["yidun_panel","yidun_slider"])("requires the owned %s component",className=>{
    document.body.innerHTML=challenge();document.querySelector(`.${className}`)!.remove();
    expect(resolveApplicationUserAction()).toBeNull();
  });
  it("ignores completed, disabled and offscreen preloaded challenges",()=>{
    document.body.innerHTML=challenge();const root=document.querySelector<HTMLElement>('.yidun')!;
    root.classList.add('yidun--success');expect(resolveApplicationUserAction()).toBeNull();
    root.classList.remove('yidun--success');root.dataset.offscreen='true';expect(resolveApplicationUserAction()).toBeNull();
    delete root.dataset.offscreen;document.querySelector('.yidun_slider')!.setAttribute('aria-disabled','true');
    expect(resolveApplicationUserAction()).toBeNull();
  });
  it("does not combine parts from separate SDK roots",()=>{
    document.body.innerHTML='<div class="yidun"><div class="yidun_panel"><div class="yidun_slide_indicator"></div></div><div class="yidun"><div class="yidun_slider"></div></div></div>';
    expect(resolveApplicationUserAction()).toBeNull();
  });
  it("does not classify security job text, a generic slider, or the loaded SDK alone",()=>{
    document.body.innerHTML='<h1>Security verification engineer</h1><div role="slider">Slide to verify</div><script src="https://cstaticdun-v6.126.net/load.min.js"></script>';
    expect(resolveApplicationUserAction()).toBeNull();
  });
  it("preserves the existing SMS login state and Chinese challenge state",()=>{
    document.body.innerHTML='<form><h1>手机号登录</h1><input placeholder="手机号码"><input placeholder="验证码"><button>获取验证码</button><button>登录</button></form>'+challenge();
    expect(resolveApplicationUserAction()).toMatchObject({type:"login"});
    document.body.innerHTML='<div role="dialog">请完成安全验证</div>';
    expect(resolveApplicationUserAction()).toMatchObject({type:"captcha"});
  });
});
