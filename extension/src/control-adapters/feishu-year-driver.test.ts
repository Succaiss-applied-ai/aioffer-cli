// @vitest-environment jsdom
// @vitest-environment-options {"url":"https://xtool.jobs.feishu.cn/index/resume/7678562627672541486/apply"}
import {beforeEach,it,expect,vi} from "vitest";
import {executeFeishuYear,inspectFeishuYearInPage,type FeishuYearProbe} from "./feishu-year-driver.js";
import {observeApplicationPageWithFieldDialects} from "../form-dialects/application-field-dialects.js";
import {evidenceForField} from "./field-routing.js";
import {resolveControlAdapter} from "./registry.js";
beforeEach(()=>{
  vi.restoreAllMocks();document.body.innerHTML="";
  Object.defineProperty(HTMLElement.prototype,"innerText",{configurable:true,get(){return this.textContent??"";}});
  vi.spyOn(HTMLElement.prototype,"getBoundingClientRect").mockImplementation(function(this:HTMLElement){const top=this.matches(".ud__picker-dropdown")?144:100;
    return {x:20,y:top,left:20,top,right:620,bottom:top+40,width:600,height:40,toJSON(){}};});
  Object.defineProperty(document,"elementFromPoint",{configurable:true,value:()=>document.querySelector("#year")});
});
it("separates YYYY from ordinary text and month/day controls",()=>{
  document.body.innerHTML='<form><div class="ud-formily-item"><div class="ud-formily-item-label"><span class="ud-formily-item-label-content">获奖时间</span></div><div class="ud__picker"><div class="ud__picker-dateInput"><input id="year" class="ud__picker-input" placeholder="YYYY"></div></div></div><button>提交简历</button></form>';
  const page=observeApplicationPageWithFieldDialects(),field=page.fields[0]!;
  const route=resolveControlAdapter(evidenceForField(page,field));
  expect(route.code).toBe("feishu.formily-year.trusted-pointer.v1");expect(route.diagnostic.informationRequirement).toEqual({kind:"date",precision:"year"});
  expect(inspectFeishuYearInPage("#year","获奖时间","2025")).toMatchObject({status:"popup_closed"});
  document.querySelector<HTMLInputElement>("#year")!.placeholder="YYYY-MM";
  expect(inspectFeishuYearInPage("#year","获奖时间","2025").status).toBe("control_missing");
  expect(resolveControlAdapter(evidenceForField(page,{...field,domHints:{...field.domHints,placeholder:"YYYY-MM"}})).code).not.toBe(route.code);
});
function runner(config:{year?:string;blocked?:boolean;badReadback?:boolean;stuck?:boolean}={}){
  let opened=false,actual=config.year??"",first=2020;const events:string[]=[];
  const io={prepareSurface:vi.fn(async()=>{}),wait:vi.fn(async()=>{}),
    click:vi.fn(async(p:{x:number;y:number})=>{if(p.x===1){opened=true;events.push("open");}else if(p.x===2){opened=false;actual=config.badReadback?"2021":"2018";events.push("select");}else{if(!config.stuck)first-=20;events.push("previous");}}),
    inspect:vi.fn(async():Promise<FeishuYearProbe>=>({status:opened?first===2020?"navigate":"ready":"popup_closed",actual,years:opened?Array.from({length:20},(_,i)=>String(first+i)):[],popupCount:opened?1:0,validationCleared:!config.blocked,controlPoint:{x:1,y:1},yearPoint:{x:2,y:2},navigationPoint:{x:3,y:3}}))};return {io,events};
}
it("navigates by observed pages and commits one exact year without inventing month/day",async()=>{
  const r=runner();expect(await executeFeishuYear(r.io,"2018")).toMatchObject({success:true,actual:"2018",ledger:{open:1,navigate:1,select:1,retry:0}});expect(r.events).toEqual(["open","previous","select"]);
});
it("rejects no-progress navigation, wrong readback, errors and conflicting old values",async()=>{
  const invalid=runner();expect(await executeFeishuYear(invalid.io,"2018-03")).toMatchObject({success:false,status:"year_precision_required"});expect(invalid.events).toEqual([]);
  for(const config of [{stuck:true},{badReadback:true},{blocked:true},{year:"2020"}])expect((await executeFeishuYear(runner(config).io,"2018")).success).toBe(false);
  const same=runner({year:"2018"});expect(await executeFeishuYear(same.io,"2018")).toMatchObject({success:true,ledger:{open:0,select:0}});
});
