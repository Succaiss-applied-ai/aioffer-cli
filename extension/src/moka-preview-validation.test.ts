// @vitest-environment jsdom
// @vitest-environment-options {"url":"https://app.mokahr.com/campus-recruitment/yxws/168223#/job/example/apply"}
import {afterEach, describe, expect, it, vi} from "vitest";
import {reassertedSubmitValidationProbeInPage} from "./submit-validation-probe.js";

const token="preview-rejection-test";
afterEach(()=>{reassertedSubmitValidationProbeInPage(token,"cleanup");vi.restoreAllMocks();document.body.innerHTML="";});
function setup(old=false){
  const tooltip='<div class="sd-Tooltip-tooltip-live">申请表含有错误，请您查找标红字段解决</div>';
  document.body.innerHTML=`<div class="apply-form-live">
    <div class="apply-field-live"><input id="identity" value="test"><div class="sd-Input-error-live">请输入正确的证件号码</div></div>
    <div class="apply-field-live"><input id="clean" value="ok"></div>
    <div class="submitApply-live"><div class="sd-Tooltip-container-live" id="owned"><button id="submit">预览并提交</button>${old?tooltip:""}</div></div>
  </div><div class="apply-form-other"><div class="apply-field-other"><input id="foreign"><div class="sd-Input-error-live">其他字段错误</div></div></div><div id="foreign-tooltip"></div>`;
  vi.spyOn(Element.prototype,"getBoundingClientRect").mockReturnValue({width:100,height:20} as DOMRect);
  const listeners=vi.spyOn(document,"addEventListener");
  const fields=[{key:"identity",selector:"#identity",hasError:true},{key:"clean",selector:"#clean",hasError:true},
    {key:"foreign",selector:"#foreign",hasError:true}];
  reassertedSubmitValidationProbeInPage(token,"arm",fields,"预览并提交");
  const listener=listeners.mock.calls.find(([type])=>type==="click")![1] as EventListener;
  return {fields,click:(trusted=true)=>listener({target:document.querySelector("#submit"),isTrusted:trusted} as unknown as Event),
    show:(id="owned")=>document.getElementById(id)!.insertAdjacentHTML("beforeend",tooltip),
    read:()=>reassertedSubmitValidationProbeInPage(token,"read")};
}
describe("Moka preview refusal",()=>{
  it("returns only field-owned errors from this form after a fresh clicked-button refusal",()=>{
    const h=setup();h.click();h.show();expect(h.read()).toEqual(["identity"]);
    document.querySelector(".sd-Tooltip-tooltip-live")!.remove();
    expect(reassertedSubmitValidationProbeInPage(token,"read",h.fields)).toEqual(["identity"]);
  });
  it.each(["stale","foreign","synthetic","before_click"])("does not promote %s tooltip activity to a field rejection",kind=>{
    const h=setup(kind==="stale");
    if(kind==="before_click")h.show();
    h.click(kind!=="synthetic");
    if(kind!=="before_click")h.show(kind==="foreign"?"foreign-tooltip":"owned");
    expect(h.read()).toEqual([]);
  });
  it("does not resurrect a resolved field or bind a replacement from another form",()=>{
    const h=setup();h.click();h.show();
    document.querySelector(".apply-field-live .sd-Input-error-live")!.remove();
    expect(h.read()).toEqual([]);
  });
});
