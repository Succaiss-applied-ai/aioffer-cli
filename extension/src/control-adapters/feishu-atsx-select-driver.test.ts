// @vitest-environment jsdom
// @vitest-environment-options {"url":"https://li.jobs.feishu.cn/index/resume/7680859366392252713/apply"}
import {beforeEach,describe,it,expect,vi} from "vitest";
import {inspectFeishuAtsxChoiceInPage,executeFeishuAtsxChoice,type FeishuAtsxChoiceProbe} from "./feishu-atsx-select-driver.js";
import {resolveControlAdapter} from "./registry.js";
import {observeApplicationPageWithFieldDialects} from "../form-dialects/application-field-dialects.js";
import {evidenceForField} from "./field-routing.js";

beforeEach(()=>{
  vi.restoreAllMocks();document.body.innerHTML="";
  Object.defineProperty(HTMLElement.prototype,"innerText",{configurable:true,get(){return this.textContent??"";}});
  vi.spyOn(HTMLElement.prototype,"getBoundingClientRect").mockImplementation(function(this:HTMLElement){
    const top=this.matches("label")?60:this.matches(".atsx-select-dropdown")?144:100;
    return {x:20,y:top,left:20,top,right:620,bottom:top+40,width:600,height:40,toJSON(){}};
  });
  Object.defineProperty(document,"elementFromPoint",{configurable:true,value:vi.fn((_x,y)=>y===80?document.querySelector("label"):document.querySelector("#control"))});
});
function install(tree=false){
  document.body.innerHTML=`<main class="resumeEditForm-wrapper"><form><div class="atsx-form-item" data-cy="city"><div class="atsx-form-item-label"><label>意向城市</label></div><div class="atsx-select"><div id="control" class="atsx-select-selection atsx-select-selection--single" role="combobox" aria-controls="menu" aria-expanded="true"><input id="query"></div></div></div><button>提交简历</button></form><div class="atsx-select-dropdown">${tree?'<div class="atsx-select-tree-wrapper"><ul role="tree"><li role="treeitem"><span class="atsx-tree-switcher-noop"></span><span class="atsx-tree-node-content-wrapper"><span class="atsx-clamp-content" data-cy-value="北京">北京</span></span></li></ul></div>':'<div id="menu"><ul role="listbox"><li role="option"><span class="atsx-clamp-content" data-cy-value="北京">北京</span></li></ul></div>'}</div></main>`;
  document.querySelector<HTMLInputElement>("#query")!.focus();
}
describe("owned ATSX popup classification",()=>{
  it("does not infer a flat Driver from a closed trigger",()=>{
    install();document.querySelector(".atsx-select-dropdown")!.remove();
    const page=observeApplicationPageWithFieldDialects(),field=page.fields[0]!;
    expect(resolveControlAdapter(evidenceForField(page,field)).code).toBe("unresolved.custom.v1");
    for(const [kind,code] of [["atsx_flat","feishu.atsx-flat-select.trusted-pointer.v1"],["atsx_city_tree","feishu.atsx-city-tree.trusted-pointer.v1"]] as const)
      expect(resolveControlAdapter(evidenceForField(page,{...field,observedControlKind:kind})).code).toBe(code);
  });
  it("uses the exact ARIA target for flat leaves",()=>{
    install();expect(inspectFeishuAtsxChoiceInPage("#control","意向城市","")).toMatchObject({status:"ready",kind:"atsx_flat",options:["北京"]});
    document.querySelector("#menu")!.id="foreign";
    expect(inspectFeishuAtsxChoiceInPage("#control","意向城市","").status).toBe("popup_owner_unproven");
  });
  it("requires attempt ownership, the same form portal, focus and anchor for a tree without an ARIA target",()=>{
    install(true);
    expect(inspectFeishuAtsxChoiceInPage("#control","意向城市","").status).toBe("popup_owner_unproven");
    expect(inspectFeishuAtsxChoiceInPage("#control","意向城市","","observe",true)).toMatchObject({status:"ready",kind:"atsx_city_tree",options:["北京"]});
    document.body.append(document.querySelector(".atsx-select-dropdown")!);
    expect(inspectFeishuAtsxChoiceInPage("#control","意向城市","","observe",true).status).toBe("popup_owner_unproven");
  });
  it("rejects nested trees, duplicate ARIA targets and wrong field labels",()=>{
    install(true);document.querySelector("[role='treeitem']")!.insertAdjacentHTML("beforeend","<ul><li role='treeitem'>子项</li></ul>");
    expect(inspectFeishuAtsxChoiceInPage("#control","意向城市","","observe",true).status).toBe("unsupported_tree_depth");
    install();document.body.insertAdjacentHTML("beforeend",'<div id="menu"></div>');
    expect(inspectFeishuAtsxChoiceInPage("#control","意向城市","").status).toBe("popup_owner_unproven");
    expect(inspectFeishuAtsxChoiceInPage("#control","学历","").status).toBe("field_identity_mismatch");
  });
});

function runner(options:{shape?:"atsx_flat"|"atsx_city_tree";selected?:string;delay?:number;badReadback?:boolean}={}){
  let open=false,selected=options.selected??"",polls=0;
  const events:string[]=[];
  const io={
    prepareSurface:vi.fn(async()=>{}),wait:vi.fn(async()=>{}),
    click:vi.fn(async(p:{x:number;y:number})=>{if(p.x===1){open=true;events.push("open");}else if(p.x===2){open=false;events.push("close");}else{open=false;selected=options.badReadback?"上海":"北京";events.push("select");}}),
    inspect:vi.fn(async(value:string):Promise<FeishuAtsxChoiceProbe>=>{
      if(open)polls++;
      const loaded=open&&polls>(options.delay??0);
      return {status:!open?"popup_closed":!loaded?"popup_loading_or_unsupported":value&&value!=="北京"?"option_unavailable":"ready",kind:loaded?options.shape??"atsx_flat":null,
        actual:selected,options:loaded?["北京"]:[],popupCount:open?1:0,validationCleared:!!selected,controlPoint:{x:1,y:1},closePoint:{x:2,y:2},optionPoint:loaded&&value==="北京"?{x:3,y:3}:null};
    })
  };return {io,events};
}
describe("one locked ATSX sequence",()=>{
  it("discovers delayed options without selecting an answer",async()=>{
    const {io,events}=runner({delay:3});const result=await executeFeishuAtsxChoice(io,{value:"",discover:true});
    expect(result).toMatchObject({success:true,kind:"atsx_flat",actual:"",options:["北京"],ledger:{open:1,select:0,close:1,retry:0}});
    expect(events).toEqual(["open","close"]);
  });
  it("selects once and verifies the committed value",async()=>{
    const {io,events}=runner();expect(await executeFeishuAtsxChoice(io,{value:"北京",kind:"atsx_flat"})).toMatchObject({success:true,actual:"北京",validationCleared:true,popupClosed:true});
    expect(events).toEqual(["open","select"]);
  });
  it("does not switch variant or retry an unavailable option or failed readback",async()=>{
    const mismatch=runner({shape:"atsx_city_tree"});expect(await executeFeishuAtsxChoice(mismatch.io,{value:"北京",kind:"atsx_flat"})).toMatchObject({success:false,status:"control_route_changed",ledger:{select:0}});
    const missing=runner();expect(await executeFeishuAtsxChoice(missing.io,{value:"上海",kind:"atsx_flat"})).toMatchObject({success:false,status:"option_unavailable",ledger:{select:0}});
    const wrong=runner({badReadback:true});expect(await executeFeishuAtsxChoice(wrong.io,{value:"北京",kind:"atsx_flat"})).toMatchObject({success:false,status:"readback_mismatch",ledger:{open:1,select:1,retry:0}});
  });
  it("keeps preexisting values and does not overwrite conflicting answers",async()=>{
    const same=runner({selected:"北京"});expect(await executeFeishuAtsxChoice(same.io,{value:"北京",kind:"atsx_flat"})).toMatchObject({success:true,ledger:{open:0,select:0}});
    const conflict=runner({selected:"上海"});expect(await executeFeishuAtsxChoice(conflict.io,{value:"北京",kind:"atsx_flat"})).toMatchObject({success:false,status:"existing_value_conflict",ledger:{open:0,select:0}});
  });
});
