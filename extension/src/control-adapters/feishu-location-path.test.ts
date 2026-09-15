// @vitest-environment jsdom
import { beforeEach, expect, it, vi } from "vitest";
import { inspectFeishuSelectorSearchInPage } from "./feishu-selector-search-driver.js";
import { feishuLocationTarget, feishuLocationReadback } from "../feishu-location-value.js";
beforeEach(()=>{
  vi.restoreAllMocks();
  vi.spyOn(HTMLElement.prototype,'getBoundingClientRect').mockImplementation(function(this:HTMLElement){const top=this.matches('.ud__select__dropdown')?140:100;return {left:20,top,right:620,bottom:top+40,width:600,height:40,x:20,y:top,toJSON(){}};});
  HTMLElement.prototype.scrollIntoView=vi.fn();
  Object.defineProperty(document,'elementFromPoint',{configurable:true,value:()=>document.querySelector('[data-hit]')});
});
function fixture(rows:Array<[number,string]>,target:string){
  document.body.innerHTML=`<div class="ud-formily-item"><div class="ud-formily-item-label-content">任意标题</div><div class="ud__select"><div class="ud__select__selector ud__select__selector-open"><input id="q" class="ud__select__selector__search__input" type="search" role="combobox"></div></div></div><div class="ud__select__dropdown citySelectWrapper__sample"><div class="ud__treeSelect__overlay">${rows.map(([depth,label])=>`<div class="ud__tree__node">${'<span class="ud__tree__node__indent"></span>'.repeat(depth)}<button>展开</button><div class="ud__tree__node__label" ${label===target?'data-hit':''}>${label}</div></div>`).join('')}</div></div>`;
  const input=document.querySelector<HTMLInputElement>('#q')!;input.value=target;input.focus();
}
it.each([[[0,'中国大陆'],[1,'广东']],[[0,'中国大陆'],[1,'广东'],[2,'广州']],[[0,'中国大陆'],[1,'广东'],[2,'广州'],[3,'天河区']]])('allows selectable ancestors and the known depth: %j',(...rows)=>{
  const typed=rows as Array<[number,string]>, path=typed.map(r=>r[1]),target=path.at(-1)!;
  fixture(typed,target);
  expect(inspectFeishuSelectorSearchInPage('#q','任意标题',target,false,'observe',true,path)).toMatchObject({status:'ready',popupKind:'formily_location_tree'});
});
it('rejects an incorrect parent path even when the target text appears only once',()=>{
  fixture([[0,'韩国'],[1,'京畿道'],[2,'广州']],'广州');
  expect(inspectFeishuSelectorSearchInPage('#q','任意标题','广州',false,'observe',true,['中国大陆','广东','广州']).status).toBe('option_unavailable');
});
it('does not invent a virtualized ancestor or call an unknown tree a location',()=>{
  fixture([[2,'广州']],'广州');
  expect(inspectFeishuSelectorSearchInPage('#q','任意标题','广州',false,'observe',true,['中国大陆','广东','广州']).status).toBe('option_unavailable');
  document.querySelector('.ud__select__dropdown')!.classList.remove('citySelectWrapper__sample');
  expect(inspectFeishuSelectorSearchInPage('#q','任意标题','广州',false,'observe',true,null,true).status).toBe('unsupported_popup_structure');
});
it('keeps path precision and reads a single selected tag without requiring a district',()=>{
  expect(feishuLocationTarget('中国大陆/广东省/广州市')).toEqual({path:['中国大陆','广东','广州'],query:'广州'});
  expect(feishuLocationReadback('["广州"]','["中国大陆/广东省/广州市"]',true)).toBe(true);
  expect(feishuLocationReadback('["广州","深圳"]','["中国大陆/广东省/广州市"]',true)).toBe(false);
  expect(feishuLocationTarget('中国大陆//广州')).toBeNull();
});

it("matches an autonomous-region path and distinguishes a foreign same-name city",()=>{
  const target=feishuLocationTarget('中国大陆/广西壮族自治区/南宁市')!;
  fixture([[0,'中国大陆'],[1,'广西'],[2,'南宁']],'南宁');
  expect(inspectFeishuSelectorSearchInPage('#q','任意标题',target.query,false,'observe',true,target.path).status).toBe('ready');
  fixture([[0,'中国大陆'],[1,'广东'],[2,'广州'],[0,'韩国'],[1,'京畿道'],[2,'广州市']],'广州市');
  document.querySelector<HTMLInputElement>('#q')!.value='广州';
  expect(inspectFeishuSelectorSearchInPage('#q','任意标题','广州',false,'observe',true,['韩国','京畿道','广州']).status).toBe('ready');
});
