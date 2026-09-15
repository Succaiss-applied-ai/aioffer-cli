// @vitest-environment jsdom
import {afterEach,beforeEach,describe,it,expect,vi} from "vitest";
import {inspectMokaSharedSelectInPage} from "./moka-shared-select-driver.js";
import {inspectMokaRecruitingSourceTargetInPage} from "./moka-recruiting-source-driver.js";

// Actual NVIDIA/FunPlus shape: an owned clipped Select-scrollable list, not a
// globally discovered popup. Geometry models 2026-09-09's offscreen leaf.
let scroll: HTMLElement, leaf: HTMLElement;
let overlay=false;
const box=(top:number,height=20)=>({x:20,y:top,left:20,right:220,top,bottom:top+height,width:200,height,toJSON(){}});
beforeEach(()=>{
  Object.defineProperty(HTMLElement.prototype,"innerText",{configurable:true,get(){return this.textContent??"";}});
  document.body.innerHTML=`<div class="apply-field-test"><div class="title-test">来源渠道</div><div class="sd-Dropdown-container-test">
    <label class="sd-Select-container-test"><span class="sd-Input-display-value-test"></span><input id="source" class="sd-Input-input-test"></label>
    <div class="sd-Dropdown-dropdown-test"><div class="sd-Select-scrollable-test" style="overflow-y:auto"><div class="sd-Menu-container-test">
      <div class="sd-Menu-content-item-test"><div class="option-label-test">主动搜索</div></div>
    </div></div></div></div></div>`;
  scroll=document.querySelector('.sd-Select-scrollable-test')!;leaf=document.querySelector('.option-label-test')!;overlay=false;
  Object.defineProperty(scroll,'scrollHeight',{configurable:true,value:720});Object.defineProperty(scroll,'clientHeight',{configurable:true,value:272});
  scroll.scrollBy=vi.fn((options:any)=>{scroll.scrollTop=Math.max(0,Math.min(448,scroll.scrollTop+options.top));});
  vi.spyOn(HTMLElement.prototype,'getBoundingClientRect').mockImplementation(function(){
    const e=this as HTMLElement;
    if(e===leaf)return box(910-scroll.scrollTop);
    if(e===scroll)return box(362,272);
    if(e.matches('[class*=Dropdown-dropdown]'))return box(354,288);
    return box(320);
  });
  document.elementFromPoint=vi.fn((_x,y)=>!overlay&&y>=362&&y<634?leaf:document.querySelector('.sd-Select-container-test'));
});
afterEach(()=>vi.restoreAllMocks());

describe.each([
  ['shared',inspectMokaSharedSelectInPage],['source',inspectMokaRecruitingSourceTargetInPage]
] as const)('%s Moka menu scroll',(_name,inspect)=>{
  it('keeps observation read-only, scrolls only the owned clipped menu, and then hits the same leaf',()=>{
    expect(inspect('#source','主动搜索')).toMatchObject({status:'control_not_clickable',popupCount:1,matchingLeafCount:1});
    expect(scroll.scrollBy).not.toHaveBeenCalled();
    expect(inspect('#source','主动搜索','prepare_select')).toMatchObject({status:'ready',scrolled:true,matchingLeafCount:1});
    expect(scroll.scrollBy).toHaveBeenCalledTimes(1);
    expect(inspect('#source','主动搜索')).toMatchObject({status:'ready',scrolled:false});
    expect(scroll.scrollBy).toHaveBeenCalledTimes(1);
  });
  it('does not scroll for missing or ambiguous options',()=>{
    expect(inspect('#source','不存在','prepare_select').status).toBe('leaf_missing');
    leaf.parentElement!.insertAdjacentHTML('afterend',leaf.parentElement!.outerHTML);
    expect(inspect('#source','主动搜索','prepare_select').status).toBe('leaf_ambiguous');
    expect(scroll.scrollBy).not.toHaveBeenCalled();
  });
  it('does not scroll a visible option behind an unrelated overlay',()=>{
    scroll.scrollTop=400;overlay=true;
    expect(inspect('#source','主动搜索','prepare_select')).toMatchObject({status:'control_not_clickable',scrolled:false});
    expect(scroll.scrollBy).not.toHaveBeenCalled();
  });
  it('does not borrow another scroll container',()=>{
    scroll.className='unrelated-scrollable';
    expect(inspect('#source','主动搜索','prepare_select')).toMatchObject({status:'control_not_clickable',scrolled:false});
    expect(scroll.scrollBy).not.toHaveBeenCalled();
  });
});
