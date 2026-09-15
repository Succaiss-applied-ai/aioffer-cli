import { beforeEach, expect, it, vi } from "vitest";
import type { FillInstruction, PageObservation } from "../page-adapter.js";
const mocks=vi.hoisted(()=>({observe:vi.fn(),script:vi.fn(),click:vi.fn(),prepare:vi.fn(),release:vi.fn(),send:vi.fn()}));
vi.mock("./browser-dispatch.js",()=>({observeApplicationWithDialectsInTab:mocks.observe}));
vi.mock("../auto-apply-interruption.js",()=>({executeInterruptibleScript:mocks.script,sendInterruptibleDebuggerCommand:mocks.send}));
vi.mock("../trusted-pointer-driver.js",()=>({dispatchTrustedPointerClick:mocks.click,prepareFocusEmulatedTrustedPointerSurface:mocks.prepare,releaseTrustedPointerSurface:mocks.release}));
import { prepareFeishuSelectorInTab } from "./feishu-selector-discovery-runtime.js";
import { carryFeishuSelectorKinds } from "./feishu-selector-discovery.js";
const field={fieldId:"f",stableFieldKey:"basic.a.combobox",selector:"#f",label:"任意字段",type:"combobox",controlKind:"combobox",required:true,currentValue:"广州",options:[],
  fieldSource:{dialect:"feishu_formily" as const,fieldPath:"a",moduleId:"basic",instanceIndex:0},
  domHints:{tagName:"INPUT",inputType:"search",readOnly:false,classNames:["ud__select__selector__search__input","ud__select__selector","ud-formily-item"]}};
const page={url:"https://test.jobs.feishu.cn/test/resume/123/apply",documentId:"d",pageStage:"application_form",fields:[field]} as PageObservation;
const instruction={fieldId:"f",stableFieldKey:field.stableFieldKey,expectedLabel:field.label,selector:"#f",type:"combobox",value:""} as FillInstruction;
beforeEach(()=>{vi.clearAllMocks();vi.stubGlobal("chrome",{debugger:{attach:vi.fn().mockResolvedValue(undefined),detach:vi.fn().mockResolvedValue(undefined)}});mocks.observe.mockResolvedValue(page);mocks.release.mockResolvedValue(undefined);});
function probes(kind="formily_location_tree",changes=false){
 let opened=false;
 mocks.click.mockImplementation(async(_send,point)=>{opened=point.x===1;});
 mocks.script.mockImplementation(async()=>[{documentId:"d",result:{status:opened?(kind==="unknown"?"unsupported_popup_structure":"classified"):"popup_closed",
   ...(opened&&kind!=="unknown"?{popupKind:kind}:{}),inputPoint:{x:1,y:1},closePoint:{x:2,y:2},
   query:"",selected:changes&&!opened&&mocks.click.mock.calls.length?["深圳"]:["广州"],popupCount:opened?1:0}}]);
}
it.each(["formily_location_tree","formily_selector_flat"])("classifies the actual popup without querying or changing the answer: %s",async kind=>{
 probes(kind);const result=await prepareFeishuSelectorInTab(1,page,instruction);
 expect(result.failure).toBeUndefined();expect(result.page.fields[0]?.observedControlKind).toBe(kind);
 expect(result.page.fields[0]?.currentValue).toBe("广州");expect(mocks.click).toHaveBeenCalledTimes(2);
 expect(mocks.script.mock.calls.every(([call])=>call.args[2]===""&&call.args.at(-1)===true)).toBe(true);
 expect(chrome.debugger.detach).toHaveBeenCalledTimes(1);
});
it.each(["unknown","changed selection"])("does not publish an unproven type: %s",async scenario=>{
 probes(scenario==="unknown"?"unknown":"formily_location_tree",scenario==="changed selection");
 expect((await prepareFeishuSelectorInTab(1,page,instruction)).failure?.driverFailureCode).toBe("control_discovery_failed");
 expect(mocks.click).toHaveBeenCalledTimes(2);
});
it("does not interact with Moka or carry a type across a changed document",async()=>{
 const moka={...page,url:"https://app.mokahr.com/test"};
 expect(await prepareFeishuSelectorInTab(1,moka,instruction)).toEqual({page:moka});expect(mocks.click).not.toHaveBeenCalled();
 const previous={...page,fields:[{...field,observedControlKind:"formily_location_tree" as const}]};
 expect(carryFeishuSelectorKinds(previous,{...page,documentId:"new"}).fields[0]?.observedControlKind).toBeUndefined();
 expect(carryFeishuSelectorKinds(previous,page).fields[0]?.observedControlKind).toBe("formily_location_tree");
 const changed={...page,fields:[{...field,observedControlKind:"formily_selector_flat" as const}]};
 expect(carryFeishuSelectorKinds(previous,changed).fields[0]?.observedControlKind).toBe("formily_selector_flat");
});

it.each([false,true])("classification Escape requires unchanged values and confirmed closure; stuck=%s",async stuck=>{
 let open=false;
 mocks.click.mockImplementation(async()=>{open=true;});
 mocks.send.mockImplementation(async(_target,method,params)=>{if(method==="Input.dispatchKeyEvent"&&params.type==="keyUp"&&!stuck)open=false;});
 mocks.script.mockImplementation(async()=>[{documentId:"d",result:{status:open?"classified":"popup_closed",popupKind:open?"formily_selector_flat":undefined,
  inputPoint:{x:1,y:1},closePoint:null,closeWithEscape:open,query:"",selected:["广州"],popupCount:open?1:0}}]);
 const result=await prepareFeishuSelectorInTab(1,page,instruction);
 expect(Boolean(result.failure)).toBe(stuck);expect(mocks.click).toHaveBeenCalledTimes(1);
 expect(mocks.send.mock.calls.map(call=>call[2])).toEqual([
  {type:"rawKeyDown",key:"Escape",code:"Escape",windowsVirtualKeyCode:27},
  {type:"keyUp",key:"Escape",code:"Escape",windowsVirtualKeyCode:27}]);
 if(!stuck)expect(result.page.fields[0]?.currentValue).toBe("广州");
});
