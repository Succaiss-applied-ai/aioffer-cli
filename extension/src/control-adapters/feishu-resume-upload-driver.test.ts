// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { observeApplicationPageWithFieldDialects } from "../form-dialects/application-field-dialects.js";
import { dispatchControlInstruction, evidenceForField } from "./field-routing.js";
import { resolveControlAdapter } from "./registry.js";
import * as registry from "./registry.js";
import { fillApplicationPage } from "./native-driver.js";
import { executeFeishuResumeUpload } from "./feishu-resume-upload-driver.js";

// Actual xTool Formily/ATS upload structure. The public input library resets
// its React key on change, before the network response commits the file card.
function fixture(variant: "formily" | "atsx" = "formily") {
  document.body.innerHTML = `<form><div class="ud-formily-item" id="formily-item-attachment_resume"
    data-form-field-id="attachment_resume" data-form-field-name="attachment_resume" data-form-field-i18n-name="简历附件">
    <div class="ud-formily-item-label"><div class="ud-formily-item-label-content"><span><label>简历附件</label></span></div><span class="ud-formily-item-colon"></span></div>
    <div class="ud-formily-item-control"><div class="ud-formily-item-control-content">
    <div class="ud-formily-item-control-content-component"><div class="uploadResume__71bbed uploadResume" data-test="uploadResume">
    <span><div class="atsx-upload atsx-upload-drag"><span class="atsx-upload atsx-upload-btn" role="button">
      <input type="file" accept=".pdf,.doc,.docx" data-cy="inputUpload" style="display:none">
      <div class="atsx-upload-drag-container"><div class="uploadFile__952ff7 uploadFile">
        <p>将你的简历拖拽至此处</p><button type="button">选择文件</button>
      </div></div></span></div></span></div></div></div></div></div><button>提交简历</button></form>`;
  if (variant === "atsx") {
    const upload = document.querySelector("[data-test='uploadResume']")!.outerHTML;
    document.body.innerHTML = `<form><section class="uploadResume-section createFormSection-require"><div class="createFormSection-title"><p class="createFormSection-text">附件简历</p></div>${upload}</section><button>提交简历</button></form>`;
  }
  const input=document.querySelector<HTMLInputElement>("input[type='file']")!;
  Object.defineProperty(input,"files",{configurable:true,writable:true,value:[]});
  const observed=observeApplicationPageWithFieldDialects();
  const field=observed.fields.find(f=>f.type==="file")!;
  const instruction={fieldId:field.fieldId,stableFieldKey:field.stableFieldKey,expectedLabel:field.label,
    selector:field.selector,type:field.type,value:"resume.pdf",applicationUrl:observed.url,
    file:{name:"resume.pdf",type:"application/pdf",base64:btoa("fixture")}};
  return {input,observed,field,instruction};
}

function card(name="resume.pdf") {
  document.querySelector(".uploadFile")!.innerHTML=`<div class="uploadFile-preview"><div class="uploadFile-loadedWrapper">
    <p class="uploadFile-loadedFilename sofiaBold" title="${name}">${name}</p>
    <div class="uploadFile-loadedUpdate">最后更新：2026-09-07</div></div></div>`;
}

beforeEach(()=>{
  vi.useFakeTimers();
  vi.stubGlobal("location",new URL("https://xtool.jobs.feishu.cn/index/resume/7648900330809985318/apply"));
  vi.stubGlobal("CSS",{escape:(value:string)=>value});
  vi.stubGlobal("DataTransfer",class {files:File[]=[];items={add:(file:File)=>this.files.push(file)};});
  Object.defineProperty(HTMLElement.prototype,"innerText",{configurable:true,get(){return this.textContent??"";}});
  vi.spyOn(HTMLElement.prototype,"getBoundingClientRect").mockReturnValue({
    x:0,y:0,left:0,top:0,right:200,bottom:30,width:200,height:30,toJSON(){}
  });
});
afterEach(()=>{vi.useRealTimers();vi.restoreAllMocks();vi.unstubAllGlobals();});

describe("one-write asynchronous resume upload",()=>{
  it.each(["youcash", "campus", "index", "900011", "a-company"])("keeps the same asynchronous Formily upload contract in scope %s", async scope=>{
    vi.stubGlobal("location",new URL(`https://is35svcbne.jobs.feishu.cn/${scope}/resume/7641043112992131347/apply`));
    const h=fixture();
    expect(resolveControlAdapter(evidenceForField(h.observed,h.field)).code).toBe("feishu.formily-resume-upload.v1");
    let writes=0;
    h.input.addEventListener("change",()=>{writes++;const next=h.input.cloneNode() as HTMLInputElement;h.input.replaceWith(next);
      setTimeout(()=>card(),100);
    });
    const result=executeFeishuResumeUpload({...h.instruction,controlAdapter:resolveControlAdapter(evidenceForField(h.observed,h.field)).diagnostic},{timeoutMs:1000,pollIntervalMs:50});
    await vi.runAllTimersAsync();
    expect(await result).toMatchObject({success:true,actual:"resume.pdf",driverDiagnostics:{writes:1}});
    expect(writes).toBe(1);
  });
  it("requires explicit portfolio purpose and never borrows a resume for the adjacent works attachment",async()=>{
    fixture();
    const root=document.querySelector<HTMLElement>("#formily-item-attachment_resume")!;
    root.id="formily-item-attachment";root.dataset.formFieldId="attachment";root.dataset.formFieldName="attachment";root.dataset.formFieldI18nName="作品附件";
    root.querySelector("label")!.textContent="作品附件";
    const upload=root.querySelector<HTMLElement>(".uploadResume")!;upload.className="";upload.removeAttribute("data-test");
    const html=root.outerHTML;
    document.body.innerHTML=`<form><section class="applyFormModuleWrapper"><div class="applyFormModuleWrapper-title"><p class="applyFormModuleWrapper-text">作品</p></div><div class="ud-formily-item" id="formily-item-works_list"><div class="apply-form-array-card__fixture"><div data-form-field-name="link"><input></div>${html}</div></div></section><button>提交简历</button></form>`;
    const page=observeApplicationPageWithFieldDialects(),field=page.fields.find(f=>f.type==="file")!;
    expect(field.stableFieldKey).toBe("portfolio[0].attachment.file");
    expect(resolveControlAdapter(evidenceForField(page,field)).code).toBe("feishu.formily-portfolio-upload.v1");
    const instruction={fieldId:field.fieldId,stableFieldKey:field.stableFieldKey,expectedLabel:field.label,selector:field.selector,type:"file",value:"work.pdf",
      file:{name:"work.pdf",type:"application/pdf",base64:btoa("portfolio fixture"),purpose:"resume" as "resume"|"portfolio"}};
    expect(await executeFeishuResumeUpload(instruction)).toMatchObject({success:false,driverFailureCode:"file_purpose_mismatch",driverDiagnostics:{writes:0}});
    instruction.file.purpose="portfolio";
    const input=document.querySelector<HTMLInputElement>("input[type=file]")!;
    Object.defineProperty(input,"files",{configurable:true,writable:true,value:[]});input.addEventListener("change",()=>setTimeout(()=>card("work.pdf"),100));
    const run=executeFeishuResumeUpload(instruction);await vi.advanceTimersByTimeAsync(700);
    expect(await run).toMatchObject({success:true,actual:"work.pdf",driverDiagnostics:{writes:1}});
  });
  it("reproduces the old native readback failure before the asynchronous upload card commits",async()=>{
    const resolve=registry.resolveControlAdapter;
    const legacyRegistry=registry.CONTROL_ADAPTER_REGISTRY.filter(r=>r.adapterCode!=="feishu.formily-resume-upload.v1");
    vi.spyOn(registry,"resolveControlAdapter").mockImplementation(evidence=>resolve(evidence,legacyRegistry));
    const {input,instruction}=fixture();
    input.addEventListener("change",()=>{
      const fresh=input.cloneNode(true) as HTMLInputElement;
      Object.defineProperty(fresh,"files",{configurable:true,writable:true,value:[]});input.replaceWith(fresh);
      setTimeout(()=>card(),400);
    });
    const run=fillApplicationPage([instruction]);
    await vi.advanceTimersByTimeAsync(1);
    expect((await run)[0]).toMatchObject({success:false,actual:"",driverStage:"readback",error:expect.stringContaining("native_control_readback_failed")});
    expect(document.querySelector(".uploadFile-loadedFilename")).toBeNull();
    await vi.advanceTimersByTimeAsync(500);
    expect(document.querySelector(".uploadFile-loadedFilename")?.textContent).toBe("resume.pdf");
  });
  it.each(["xtool","another-tenant"])("routes the actual component on %s and waits for its asynchronous card after input reconstruction",async tenant=>{
    vi.stubGlobal("location",new URL(`https://${tenant}.jobs.feishu.cn/index/resume/7648900330809985318/apply`));
    const {input,observed,field,instruction}=fixture();
    expect(resolveControlAdapter(evidenceForField(observed,field)).code).toBe("feishu.formily-resume-upload.v1");
    const change=vi.fn(()=>{
      const fresh=input.cloneNode(true) as HTMLInputElement;
      Object.defineProperty(fresh,"files",{configurable:true,writable:true,value:[]});input.replaceWith(fresh);
      setTimeout(()=>card(),400);
    });
    input.addEventListener("change",change);
    const run=dispatchControlInstruction(observed,instruction,{
      "feishu.formily-resume-upload.v1":(_field,next)=>executeFeishuResumeUpload(next,{timeoutMs:1_000,pollIntervalMs:50})
    });
    let finished=false;run.then(()=>{finished=true;});
    await vi.advanceTimersByTimeAsync(200);
    expect(finished).toBe(false);
    await vi.advanceTimersByTimeAsync(500);
    expect(await run).toMatchObject({success:true,actual:"resume.pdf",driverStage:"readback",
      controlAdapter:{registrationId:"feishu.formily-resume-upload.v1"},driverDiagnostics:{writes:1,preexisting:false}});
    expect(change).toHaveBeenCalledTimes(1);
    expect(document.querySelector<HTMLInputElement>("input[type='file']")!.files).toHaveLength(0);
  });

  it("does not confuse selected FileList, upload-modal filename or a foreign card with a completed upload",async()=>{
    const {input,instruction}=fixture();
    input.addEventListener("change",()=>{
      document.body.insertAdjacentHTML("beforeend",'<div class="atsx-modal">正在上传 resume.pdf</div><div class="uploadFile-preview"><div class="uploadFile-loadedWrapper"><p class="uploadFile-loadedFilename" title="resume.pdf">resume.pdf</p></div></div>');
    });
    const run=executeFeishuResumeUpload(instruction,{timeoutMs:150,pollIntervalMs:50});
    await vi.advanceTimersByTimeAsync(200);
    expect(await run).toMatchObject({success:false,driverFailureCode:"file_upload_receipt_timeout",driverDiagnostics:{writes:1}});
    expect(input.files?.[0]?.name).toBe("resume.pdf");
  });

  it("reports the owned website rejection and never repeats the upload",async()=>{
    const {input,instruction}=fixture();
    const change=vi.fn(()=>{setTimeout(()=>{
      const widget=document.querySelector(".uploadFile")!;widget.classList.add("uploadFile-hasError");
      widget.innerHTML='<div class="uploadFile-errorWrapper"><p class="uploadFile-errorText">文件超过允许大小</p></div>';
    },30);});
    input.addEventListener("change",change);
    const run=executeFeishuResumeUpload(instruction,{timeoutMs:1_000,pollIntervalMs:50});
    await vi.advanceTimersByTimeAsync(100);
    expect(await run).toMatchObject({success:false,driverFailureCode:"file_upload_rejected",error:expect.stringContaining("文件超过允许大小")});
    expect(change).toHaveBeenCalledTimes(1);
  });

  it.each(["wrong filename","hidden card","different title","brief card","duplicate cards"])("does not accept %s as stable exact completion",async scenario=>{
    const {input,instruction}=fixture();
    input.addEventListener("change",()=>{
      card(scenario==="wrong filename"?"old-resume.pdf":"resume.pdf");
      const name=document.querySelector<HTMLElement>(".uploadFile-loadedFilename")!;
      if(scenario==="hidden card")name.hidden=true;
      if(scenario==="different title")name.title="another.pdf";
      if(scenario==="brief card")setTimeout(()=>name.remove(),20);
      if(scenario==="duplicate cards")name.insertAdjacentHTML("afterend",name.outerHTML);
    });
    const run=executeFeishuResumeUpload(instruction,{timeoutMs:100,pollIntervalMs:50});
    await vi.advanceTimersByTimeAsync(150);
    expect(await run).toMatchObject({success:false,driverDiagnostics:{writes:1}});
  });

  it.each(["URL","field identity","disabled","multiple inputs"])("stops without another write if %s changes while waiting",async scenario=>{
    const {input,instruction}=fixture();
    input.addEventListener("change",()=>{
      if(scenario==="URL")vi.stubGlobal("location",new URL("https://xtool.jobs.feishu.cn/index/resume/999/apply"));
      if(scenario==="field identity")document.querySelector(".ud-formily-item")!.setAttribute("data-form-field-name","other_attachment");
      if(scenario==="disabled")input.disabled=true;
      if(scenario==="multiple inputs")input.insertAdjacentHTML("afterend",input.outerHTML);
    });
    const run=executeFeishuResumeUpload(instruction,{timeoutMs:100,pollIntervalMs:50});
    await vi.advanceTimersByTimeAsync(150);
    expect(await run).toMatchObject({success:false,driverFailureCode:"control_target_missing",driverDiagnostics:{writes:1}});
  });

  it("preserves an already committed same-name card without uploading again",async()=>{
    const {input,instruction}=fixture();card();
    const change=vi.fn();input.addEventListener("change",change);
    expect(await executeFeishuResumeUpload(instruction)).toMatchObject({success:true,driverDiagnostics:{writes:0,preexisting:true}});
    expect(change).not.toHaveBeenCalled();
  });

  it("does not select this Driver for a plain file input, photo field, or a similar class name",()=>{
    const {observed,field}=fixture();
    const actual=evidenceForField(observed,field);
    for(const classNames of [[],actual.classNames.map(c=>c.replaceAll("attachment_resume","person_image")),
      actual.classNames.map(c=>c.replaceAll("uploadResume","unrelated_uploadResume"))]){
      expect(resolveControlAdapter({...actual,classNames}).code).toBe("generic.native.v1");
    }
  });
});


describe("ATSX resume root uses the same bounded upload transaction",()=>{
  it.each(["hf7l9aiqzx","other-tenant"])("writes once and waits for the owned card on %s",async tenant=>{
    vi.stubGlobal("location",new URL(`https://${tenant}.jobs.feishu.cn/704852/resume/7670761356387846454/apply`));
    const {input,observed,field,instruction}=fixture("atsx");
    expect(resolveControlAdapter(evidenceForField(observed,field)).code).toBe("feishu.atsx-resume-upload.v1");
    const change=vi.fn(()=>setTimeout(()=>card(),150));input.addEventListener("change",change);
    const run=executeFeishuResumeUpload(instruction,{timeoutMs:500,pollIntervalMs:50});
    await vi.advanceTimersByTimeAsync(300);
    expect(await run).toMatchObject({success:true,actual:"resume.pdf",driverDiagnostics:{writes:1}});
    expect(change).toHaveBeenCalledOnce();
  });
  it("does not accept a foreign complete card or overwrite a portfolio root",async()=>{
    const {input,instruction}=fixture("atsx");
    input.addEventListener("change",()=>{document.querySelector(".createFormSection-text")!.textContent="作品附件";});
    const run=executeFeishuResumeUpload(instruction,{timeoutMs:100,pollIntervalMs:50});
    await vi.advanceTimersByTimeAsync(150);
    expect(await run).toMatchObject({success:false,driverFailureCode:"control_target_missing",driverDiagnostics:{writes:1}});
  });
});
