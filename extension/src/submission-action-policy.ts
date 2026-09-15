/** One phrase registry for observation, trusted target resolution and preview
 * state. Patterns are JSON data: pass them explicitly when Chrome serializes a
 * function; an imported closure is not available in the page world. */
export const submissionPhrases = {
  preview: [
    "预览并提交", "预览后提交", "预览并投递", "预览后投递", "预览并确认提交",
    "Preview and submit", "Preview & submit", "Review and submit", "Review & submit"
  ],
  submit: [
    "提交简历", "投递简历", "发送简历", "立即投递", "立即申请", "提交申请",
    "提交职位申请", "提交应聘申请", "提交求职申请", "申请职位", "申请岗位",
    "投递职位", "投递岗位", "投递申请", "提交投递", "完成申请", "完成投递", "保存并提交",
    "Submit application", "Submit resume", "Submit CV", "Send application", "Send resume",
    "Apply now", "Apply for this job", "Finish application", "Complete application", "Save and submit"
  ],
  confirmation: [
    "确认提交", "确定提交", "确认投递", "确定投递", "确认申请", "最终提交",
    "继续提交", "继续投递", "继续申请", "仍要提交", "仍要投递", "仍然提交", "仍然投递",
    "确认并提交", "确认并投递", "Confirm submission", "Confirm application", "Confirm submit",
    "Confirm and submit", "Continue submission", "Continue submit", "Continue and submit",
    "Submit anyway", "Apply anyway"
  ],
  consentSubmit: ["同意并提交", "同意并投递", "Agree and submit", "Accept and submit"],
  shortSubmit: ["提交", "投递", "申请", "Submit", "Apply"],
  acknowledgement: ["确认", "确定", "Confirm", "OK", "Okay"]
} as const;

const escape = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const phrasePattern = (value: string) => /[\u3400-\u9fff]/u.test(value)
  ? [...value].map(escape).join("\\s*")
  : `\\b${escape(value).replace(/ /g, "\\s+")}\\b`;
const contains = (phrases: readonly string[]) => `(?:${phrases.map(phrasePattern).join("|")})`;
// Short verbs are whole labels (including a bilingual pair), never substrings
// of notices, history links or another action. Chinese long phrases may occur
// anywhere in the button's own bilingual text; no translation equivalence gate.
const wholeLabel = (phrases: readonly string[]) => {
  const token = contains(phrases);
  return `^\\s*${token}(?:\\s*(?:[/|·-]|[（(])?\\s*${token}\\s*[）)]?)?\\s*$`;
};

export const submissionActionPatterns = {
  preview: contains(submissionPhrases.preview),
  initial: `${contains([...submissionPhrases.preview, ...submissionPhrases.submit,
    ...submissionPhrases.confirmation, ...submissionPhrases.consentSubmit])}|${wholeLabel(submissionPhrases.shortSubmit)}`,
  confirmation: `${contains([...submissionPhrases.submit, ...submissionPhrases.confirmation,
    ...submissionPhrases.consentSubmit])}|${wholeLabel(submissionPhrases.shortSubmit)}`,
  acknowledgement: wholeLabel(submissionPhrases.acknowledgement),
  // A post-submit notice may ask to continue for any business reason. The
  // condition itself (email, dates, education, location...) is not a gate.
  continuationPrompt: [
    "(?:是否|确认|确定|继续|仍要|仍然|坚持|依然|还要)[^。！？!?]{0,100}(?:投递|提交|申请)",
    "\\b(?:confirm|continue|proceed|still|wish|want)\\b[^.!?]{0,100}\\b(?:submit|submission|apply|application)\\b",
    "\\b(?:submit|apply)\\s+anyway\\b"
  ].join("|"),
  continuationAction: contains([
    "继续提交", "继续投递", "继续申请", "仍要提交", "仍要投递", "仍然提交", "仍然投递",
    "Continue submission", "Continue submit", "Continue and submit", "Submit anyway", "Apply anyway"
  ]),
  continuationBlockedContext: [
    "验证码|必填|登录|网络|captcha|login|network",
    "\\brequired\\s+(?:fields?|information|details?|inputs?)\\b",
    "\\b(?:missing|unfilled)\\b[^.!?]{0,40}\\brequired\\b"
  ].join("|"),
  forbidden: [
    "取消|暂不|撤回|撤销|禁止|返回|上一步|下一步|保存草稿|登录|注册|验证码|上传|解析|删除|更新",
    "(?:不要|不能|无法|不可|不|勿|未)(?:再|继续|立即|确认|完成|成功)?(?:提交|投递|申请)",
    "(?:提交|投递|申请).{0,6}(?:失败|成功|记录|历史|状态|结果|说明|指南|帮助|须知|条件|规则)",
    "(?:查看|查询|检查|了解|如何).{0,12}(?:提交|投递|申请)",
    "(?:已|已经)(?:经|成功)?(?:提交|投递|申请)",
    "\\b(?:cancel(?:led|ed)?|withdraw(?:al)?|revoke|back|return|previous|next|login|log\\s+in|sign\\s+in|register|upload|parse|delete|update|draft|history|status|result|help|guide|instructions|failed|failure|success(?:ful|fully)?|submitted|applied|not|never|cannot|unable|don['’]t)\\b",
    "\\b(?:how\\s+to|view|check|track)\\b"
  ].join("|"),
  consent: "同意|授权|隐私|条款|协议|\\b(?:agree|accept|consent|privacy|authorize|terms)\\b"
};
export type SubmissionActionPatterns = typeof submissionActionPatterns;

export function isSubmissionActionText(value: string, stage: "initial" | "confirmation" = "initial",
  allowConsent = false): boolean {
  const text = value.normalize("NFKC");
  return !new RegExp(submissionActionPatterns.forbidden, "iu").test(text) &&
    (allowConsent || !new RegExp(submissionActionPatterns.consent, "iu").test(text)) &&
    (stage !== "confirmation" || !new RegExp(submissionActionPatterns.preview, "iu").test(text)) &&
    new RegExp(submissionActionPatterns[stage], "iu").test(text);
}

export function isPreviewSubmissionText(value: string): boolean {
  return isSubmissionActionText(value, "initial", true) &&
    new RegExp(submissionActionPatterns.preview, "iu").test(value.normalize("NFKC"));
}
