import {readFileSync} from "node:fs";
import ts from "typescript";
import {describe,expect,it} from "vitest";
import {RecruitingError,toPublicError} from "../../src/errors.js";
import {autoApplyJobResultSchema} from "../../src/gateway/auto-apply-contract.js";
import type {FinalSubmitExecutionResult} from "./page-adapter.js";
import {submissionFailureEvidence,unconfirmedPreviewDiagnostic} from "./submission-failure-evidence.js";
import {siteRejectedUploadError} from "./site-upload-rejection.js";

const source=readFileSync(process.env.SUBMISSION_EVIDENCE_SOURCE ?? "extension/src/background.ts","utf8");
const ast=ts.createSourceFile("background.ts",source,ts.ScriptTarget.ES2023,true);
let failureBranch:ts.IfStatement|undefined;
function visit(node:ts.Node){
  if(ts.isIfStatement(node)&&node.expression.getText(ast)==='!submitResult?.executed || submitResult.observedResult !== "submitted_success"')failureBranch=node;
  node.forEachChild(visit);
}
visit(ast);if(!failureBranch)throw new Error("Missing production submission-failure boundary");
const branch=ts.transpileModule(`function classify(submitResult){${failureBranch.getText(ast)}}`,{compilerOptions:{target:ts.ScriptTarget.ES2023}}).outputText;
const classify=Function("RecruitingError","submissionFailureEvidence",`${branch};return classify`)(RecruitingError,submissionFailureEvidence);
const diagnosticNode=ast.statements.find(n=>ts.isFunctionDeclaration(n)&&n.name?.text==='autoApplyDiagnostic')!;
const diagnosticCode=ts.transpileModule(diagnosticNode.getText(ast),{compilerOptions:{target:ts.ScriptTarget.ES2023}}).outputText;
const diagnostic=Function("requiredControlUnconfirmedLabels","unconfirmedPreviewDiagnostic",`${diagnosticCode};return autoApplyDiagnostic`)(()=>[],unconfirmedPreviewDiagnostic);

// Exact stage markers retained in the 2026-09-06 Trunk failure receipt.
const previewTrace=["cdp_preview_pointer_events:1:mousedown:trusted:inside|mouseup:trusted:inside|click:trusted:inside",
  "cdp_preview_activated:pointer:预览并提交","preview_activation_not_observed:same_url:attempts_1"];
function result(overrides:Partial<FinalSubmitExecutionResult>={}):FinalSubmitExecutionResult{
  return {executed:true,actionId:null,actionText:"预览并提交",observedResult:"network_or_navigation_unknown",
    pageUrlAfterClick:"https://app.mokahr.com/social-recruitment/trunk/39504#/job/example/apply",
    error:"已发送预览按钮可信指针，但未观察到预览、最终确认或成功回执；结果未确认，不会再次提交",trace:previewTrace,...overrides};
}
function failure(input:FinalSubmitExecutionResult|undefined){
  try{classify(input);}catch(error){return toPublicError(error);}
  throw new Error('Expected a submission failure');
}
describe('production submission-failure receipt',()=>{
  it('preserves the actual preview failure, stage and duplicate-submit restriction through the existing Gateway contract',()=>{
    const input=result();const error=failure(input);
    expect(error.message).toBe(input.error);expect(error.retryable).toBe(false);
    expect(error.details).toMatchObject({schemaVersion:'submission-failure-evidence.v1',submissionPhase:'preview_unconfirmed',
      message:input.error,failures:[input.error],submitExecuted:true,submitTrace:previewTrace});
    const info=diagnostic('submission_outcome_unknown',error.details);
    expect(info).toMatchObject({code:'submission_outcome_unknown',stage:'submit',retryable:false,recommendedAction:'inspect_evidence'});
    expect(info.userMessage).toContain('未确认进入最终提交步骤');
    const receipt=autoApplyJobResultSchema.parse({schemaVersion:'auto-apply-job-result.v1',batchId:'8e1fa056-0c6c-4bc2-a626-def68348af91',batchJobId:'8d78daf9-b903-4ce9-a999-7ee2dd1e2987',jobId:'job',occurredAt:'2026-09-06T18:47:49.960Z',
      status:'failed',reasonCode:'submission_outcome_unknown',evidence:{redacted:true,diagnostic:info,failureDetails:error.details}});
    expect(receipt.evidence?.failureDetails).toEqual(error.details);
  });
  it('keeps direct-submit uncertainty distinct from a failed preview',()=>{
    const error=failure(result({actionText:'提交申请',trace:['cdp_preview_activated:pointer:提交申请'],error:'直接提交后未观察到明确回执'}));
    expect(error.message).toBe('直接提交后未观察到明确回执');expect(error.details?.submissionPhase).toBe('submission_unconfirmed');
    expect(diagnostic('submission_outcome_unknown',error.details).stage).toBe('success_verification');
  });
  it('does not label an already dispatched final confirmation as preview-only',()=>{
    const error=failure(result({trace:[...previewTrace,'cdp_confirmation_activated:pointer:确认提交']}));
    expect(error.details?.submissionPhase).toBe('submission_unconfirmed');
  });
  it('keeps the real no-click evidence when the action was not executed',()=>{
    const error=failure(result({executed:false,error:'目标位置未确认，未执行点击',trace:[]}));
    expect(error.code).toBe('PREVIEW_SUBMIT_NOT_OPENED');
    expect(error.details).toMatchObject({submitExecuted:false,submissionPhase:'not_executed',failures:['目标位置未确认，未执行点击']});
  });
  it('retains the confirmation error and trace instead of discarding its evidence',()=>{
    const error=failure(result({error:'校验基线读取后无法确认二次提交按钮的实时点击位置，未执行二次点击',trace:['cdp_preview_activated:pointer:预览并提交']}));
    expect(error.details?.failures).toEqual([error.message]);expect(error.details?.submitTrace).toHaveLength(1);
    expect(error.retryable).toBe(false);
    expect(error.userAction).not.toContain('使用更新后的插件重试');
  });
  it('does not guess a preview stage from an old error message without stage evidence',()=>{
    const error=failure(result({trace:undefined}));expect(error.details?.submissionPhase).toBe('submission_unconfirmed');
    expect(unconfirmedPreviewDiagnostic({submissionPhase:'preview_unconfirmed'})).toBeNull();
  });
  it('leaves a successful result out of failure generation',()=>{
    expect(()=>classify(result({observedResult:'submitted_success',error:null,trace:['success_observed']}))).not.toThrow();
  });
  it('returns the concrete upload rejection through the existing Gateway receipt without a text answer or retry',()=>{
    const error=siteRejectedUploadError([{fieldId:'resume',selector:'#resumeKey',label:'简历',type:'file',
      required:true,currentValue:'private-file.pdf',options:[],validationMessage:'招聘网站未接受简历上传，请检查上传控件'}]);
    const details=toPublicError(error).details;
    const info=diagnostic('site_validation_blocked',details);
    expect(info).toMatchObject({code:'site_validation_blocked',stage:'submit',category:'site_validation',retryable:false});
    expect(info.userMessage).toContain('招聘网站未接受文件上传（简历）');
    const receipt=autoApplyJobResultSchema.parse({schemaVersion:'auto-apply-job-result.v1',batchId:'8e1fa056-0c6c-4bc2-a626-def68348af91',batchJobId:'8d78daf9-b903-4ce9-a999-7ee2dd1e2987',jobId:'job',occurredAt:'2026-09-07T02:40:00Z',
      status:'failed',reasonCode:'site_validation_blocked',evidence:{redacted:true,diagnostic:info,failureDetails:details}});
    expect(receipt.evidence?.failureDetails).toEqual(details);
    expect(JSON.stringify(receipt)).not.toContain('private-file.pdf');
    expect(receipt.evidence?.failureDetails).not.toHaveProperty('requiredFieldRequests');
  });
  it.each(['captcha_required','missing_information','site_application_limit_reached','control_interaction_failed'])(
    'does not overwrite %s with preview diagnostics',code=>{
      expect(diagnostic(code,submissionFailureEvidence(result()))).toEqual(diagnostic(code));
    });
});
