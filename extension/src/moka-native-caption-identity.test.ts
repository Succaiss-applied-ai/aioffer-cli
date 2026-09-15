// @vitest-environment jsdom
import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
import { observeApplicationPage } from "./page-adapter.js";
import { authoritativeCandidateFactForField, enrichVisionCandidateFacts } from "./vision-form-runtime.js";
import { dispatchControlInstruction } from "./control-adapters/field-routing.js";
import { fillApplicationPage } from "./control-adapters/native-driver.js";

// DOM shape read from the independent NVIDIA page on 2026-09-07. Schools,
// personal email and the generic email caption coexist in the same section.
const fieldMarkup = (label: string, index: number) => `<div class="apply-field-Q2iJ7AtQGX string_info-UOJxKN5mtC apply-filed-padding-gvR51AnKq6">
  <div class="title-IWWQ0Xa4L7"><span><span>${label}</span></span><span class="required-asterisk-av7daEKsLS"></span></div>
  <div class="ctrl-CICMG4Fr4_"><div class="sd-Tooltip-container-2B2OE"><label class="sd-Input-container-2S_vM string_info no-adaptive-tooltip sd-Input-lg-3X8ma">
    <input id="contact-${index}" type="text" class="sd-Input-input-10L0t sd-Input-common-input-1XimE" autocomplete="new_password" placeholder="${label}" maxlength="255">
  </label></div><div><div class="describe-GCCjupJ4ID"></div></div></div></div>`;
const labels = ["学校邮箱", "个人邮箱", "微信号(以防电话邮箱无法联络到)", "邮箱"];

beforeEach(() => {
  vi.stubGlobal("CSS", { escape: (value: string) => value });
  Object.defineProperty(HTMLElement.prototype, "innerText", { configurable: true, get() { return this.textContent ?? ""; } });
  vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockReturnValue({
    x:0,y:0,left:0,top:0,right:200,bottom:30,width:200,height:30,toJSON(){}
  });
  document.body.innerHTML = `<h1>个人信息</h1><label>姓名<input placeholder="姓名"></label>
    <label>手机号<input placeholder="手机号"></label>${labels.map(fieldMarkup).join("")}<button>预览并提交</button>`;
});
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });

describe("bounded native field captions", () => {
  it("preserves established personal-email keys when a school mailbox belongs to another section", () => {
    document.body.innerHTML = `<form><section><h2>个人信息</h2>${fieldMarkup("邮箱", 0)}${fieldMarkup("个人邮箱", 1)}</section>
      <section><h2>教育经历</h2>${fieldMarkup("学校邮箱", 2)}</section><button>预览并提交</button></form>`;
    const fields = observeApplicationPage().fields;
    const personal = fields.find(field => field.selector === "#contact-1")!;
    expect(personal.stableFieldKey).toBe("basic.email.native#1");
    expect(authoritativeCandidateFactForField(personal, {
      "job.requiredField.stable:basic.email.native#1": "confirmed@example.test"
    })?.value).toBe("confirmed@example.test");
    expect(fields.find(field => field.selector === "#contact-2")?.stableFieldKey).toContain("school_email");
  });

  it.each([
    "https://app.mokahr.com/campus-recruitment/nvidia/47111#/job/example/apply",
    "https://app.mokahr.com/social-recruitment/unrelated/2#/job/example/apply"
  ])("retains distinct complete captions and executes only the intended email on %s", async url => {
    vi.stubGlobal("location", new URL(url));
    const page = observeApplicationPage();
    const observed = page.fields.filter(field => field.selector.includes("contact-"));
    expect(observed.map(field => field.domHints?.fieldLabel)).toEqual(labels);
    const target = observed.find(field => field.domHints?.fieldLabel === "邮箱")!;
    const instruction = {fieldId:target.fieldId,stableFieldKey:target.stableFieldKey,selector:target.selector,
      expectedLabel:target.label,type:target.type,value:"candidate@example.test",applicationUrl:url};
    const result = await dispatchControlInstruction(page, instruction, {
      "generic.native.v1": async (_field,next) => (await fillApplicationPage([next]))[0]!
    });
    expect(result).toMatchObject({success:true,actual:"candidate@example.test",driverStage:"readback"});
    const values = [...document.querySelectorAll<HTMLInputElement>("[id^='contact-']")].map(input => input.value);
    expect(values).toEqual(["", "", "", "candidate@example.test"]);
    expect(observeApplicationPage().fields.find(field => field.selector === target.selector)?.label).toBe(target.label);
  });

  it("does not derive a school mailbox or a WeChat handle from the candidate personal email", () => {
    const facts = {"candidate.basic.email":"candidate@example.test", "candidate.basic.phone":"13800000000"};
    const observed = observeApplicationPage().fields.filter(field => field.selector.includes("contact-"));
    expect(observed.map(field => authoritativeCandidateFactForField(field,facts)?.value ?? null)).toEqual([
      null,"candidate@example.test",null,"candidate@example.test"
    ]);
  });

  it("accepts an exact user-confirmed school email answer", () => {
    const target = observeApplicationPage().fields.find(field => field.selector === "#contact-0")!;
    expect(target.domHints?.fieldLabel).toBe("学校邮箱");
    const facts = enrichVisionCandidateFacts({}, {"candidate.basic.email":"candidate@example.test"}, {
      requiredFieldAnswers:[{fieldId:target.fieldId,stableFieldKey:target.stableFieldKey,value:"student@university.test",source:"user_confirmed"}]
    });
    expect(authoritativeCandidateFactForField(target,facts)?.value).toBe("student@university.test");
  });

  it("retains only the correctly labeled legacy personal-email answer", () => {
    const fields = observeApplicationPage().fields.filter(field => field.selector.includes("contact-"));
    const facts = enrichVisionCandidateFacts({}, {}, {}, {facts:[{
      label:"个人邮箱",stableFieldKeys:["basic.email.native#1"],value:"confirmed@example.test",source:"user_confirmed"
    }]});
    expect(fields.map(field => authoritativeCandidateFactForField(field,facts)?.value ?? null)).toEqual([
      null,"confirmed@example.test",null,null
    ]);
    const ambiguous = enrichVisionCandidateFacts({}, {}, {requiredFieldAnswers:[{
      fieldId:"old-field",stableFieldKey:"basic.email.native#0",value:"unknown-purpose@example.test",source:"user_confirmed"
    }]});
    expect(fields.map(field => authoritativeCandidateFactForField(field,ambiguous))).toEqual([null,null,null,null]);
  });

  it("rejects conflicting labeled personal-email migrations and preserves bound job ownership", () => {
    const target = observeApplicationPage().fields.find(field => field.selector === "#contact-1")!;
    const facts = [0,1].map(index => ({label:"个人邮箱",stableFieldKeys:[`basic.email.native#${index}`],
      value:`person${index}@example.test`,source:"user_confirmed"}));
    expect(() => authoritativeCandidateFactForField(target,enrichVisionCandidateFacts({}, {}, {}, {facts})))
      .toThrow("无法唯一关联");
    const bound = {...facts[0],fieldBinding:{jobId:"current",stableFieldKey:"basic.email.native#0",sectionKey:target.sectionKey,groupIndex:target.groupIndex}};
    expect(authoritativeCandidateFactForField(target,enrichVisionCandidateFacts({}, {}, {jobId:"current"}, {facts:[bound]}))?.value).toBe("person0@example.test");
    expect(authoritativeCandidateFactForField(target,enrichVisionCandidateFacts({}, {}, {jobId:"foreign"}, {facts:[bound]}))).toBeNull();
  });
});
