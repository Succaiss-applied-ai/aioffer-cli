import type { FillInstruction, FillResult } from "../page-adapter.js";
import { observeApplicationPageWithFieldDialects } from "../form-dialects/application-field-dialects.js";
import { bindObservedInstruction, controlRoutingFailure, evidenceForField } from "./field-routing.js";
import { resolveControlAdapter } from "./registry.js";

/** Prototype for the evidenced ATS/Formily native-file widget. The upload
 * library resets its keyed input on change; only its committed file card is
 * the completion signal. Never resend the file while polling for that card. */
export async function executeFeishuResumeUpload(
  instruction: FillInstruction,
  options: { timeoutMs?: number; pollIntervalMs?: number } = {}
): Promise<FillResult> {
  const normalize = (value: unknown) => String(value ?? "").replace(/\s+/g, " ").trim();
  const started = Date.now();
  let writes = 0;
  let observations = 0;
  const page = observeApplicationPageWithFieldDialects();
  const field = bindObservedInstruction(page, instruction);
  const route = field ? resolveControlAdapter(evidenceForField(page, field, instruction)) : null;
  const code = route?.code;
  const failure = (reason: string, detail: string, stage = "readback", actual = ""): FillResult => ({
    ...controlRoutingFailure(instruction, field, reason, detail, route ?? undefined),
    actual, driverStage: stage,
    driverDiagnostics: { writes, observations, waitedMs: Date.now() - started, failureCode: reason }
  });
  if (!field || !route || !["feishu.formily-resume-upload.v1", "feishu.atsx-resume-upload.v1", "feishu.formily-portfolio-upload.v1"].includes(code ?? "") || (instruction.applicationUrl && page.url !== instruction.applicationUrl) ||
    (instruction.controlAdapter && instruction.controlAdapter.registrationId !== route.diagnostic.registrationId)) {
    return failure("control_target_missing", "页面、附件身份或登记类型不一致，未上传", "detect");
  }
  const expected = normalize(instruction.file?.name);
  const portfolio = code === "feishu.formily-portfolio-upload.v1";
  if ((portfolio && instruction.file?.purpose !== "portfolio") || (!portfolio && instruction.file?.purpose && instruction.file.purpose !== "resume")) {
    return failure("file_purpose_mismatch", "附件用途与本字段不一致，未上传", "detect");
  }
  if (!instruction.file || !expected || normalize(instruction.value) !== expected) {
    return failure("control_value_invalid", "附件内容或文件名缺失、不一致，未上传", "detect");
  }
  const visible = (element: HTMLElement) => {
    const rect = element.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return false;
    for (let el: HTMLElement | null = element; el; el = el.parentElement) {
      const style = getComputedStyle(el);
      if (style.display === "none" || style.visibility === "hidden" || style.opacity === "0" ||
        el.matches("[hidden],[aria-hidden='true']")) return false;
    }
    return true;
  };
  const inspect = () => {
    observations += 1;
    const current = observeApplicationPageWithFieldDialects();
    const target = bindObservedInstruction(current, instruction);
    if (current.url !== page.url || !target ||
      resolveControlAdapter(evidenceForField(current, target, instruction)).code !== code) return null;
    const inputs = document.querySelectorAll(target.selector);
    const input = inputs.length === 1 ? inputs[0] : null;
    if (!(input instanceof HTMLInputElement) || input.type !== "file" || input.disabled || input.readOnly ||
      input.closest("[aria-disabled='true'],[inert]")) return null;
    const root = portfolio ? input.closest<HTMLElement>(".ud-formily-item[data-form-field-id='attachment'][data-form-field-name='attachment']") : code === "feishu.atsx-resume-upload.v1"
      ? input.closest<HTMLElement>(".uploadResume-section")
      : input.closest<HTMLElement>(".ud-formily-item[data-form-field-id='attachment_resume'][data-form-field-name='attachment_resume']");
    if (code === "feishu.atsx-resume-upload.v1" && (!root || input.closest(".ud-formily-item") ||
      !/^(?:附件简历|简历附件)$/u.test(normalize(root.querySelector(".createFormSection-title .createFormSection-text")?.textContent)))) return null;
    const upload = portfolio ? input.closest<HTMLElement>(".atsx-upload-drag") : input.closest<HTMLElement>("[data-test='uploadResume'].uploadResume");
    const button = input.parentElement;
    if (!root || !upload || !root.contains(upload) || !visible(upload) ||
      !button?.matches(".atsx-upload.atsx-upload-btn[role='button']") || !upload.contains(button) ||
      root.querySelectorAll("input[type='file']").length !== 1 || upload.querySelectorAll(".uploadFile").length !== 1) return null;
    const widget = upload.querySelector<HTMLElement>(".uploadFile")!;
    const errors = [...widget.querySelectorAll<HTMLElement>(".uploadFile-errorText,.uploadFile-errorWrapper")]
      .filter(visible).map(el => normalize(el.innerText)).filter(Boolean);
    const siteError = widget.classList.contains("uploadFile-hasError") || errors.length > 0;
    const cards = [...widget.querySelectorAll<HTMLElement>(".uploadFile-preview .uploadFile-loadedWrapper .uploadFile-loadedFilename[title]")]
      .filter(visible);
    if (cards.length > 1) return null;
    const card = cards[0];
    const filename = card && normalize(card.innerText) === normalize(card.title) ? normalize(card.title) : "";
    return { input, filename, siteError, error: errors[0] ?? "招聘网站拒绝了附件上传" };
  };
  const before = inspect();
  if (!before) return failure("control_target_missing", "附件控件结构不唯一或不可操作，未上传", "detect");
  const success = (preexisting: boolean): FillResult => ({
    fieldId: instruction.fieldId, success: true, expected, actual: expected, error: null,
    driverStage: "readback", controlAdapter: route.diagnostic,
    driverDiagnostics: { writes, observations, waitedMs: Date.now() - started, preexisting }
  });
  if (before.filename === expected && !before.siteError) return success(true);
  try {
    const binary = atob(instruction.file.base64);
    const bytes = Uint8Array.from(binary, char => char.charCodeAt(0));
    const transfer = new DataTransfer();
    transfer.items.add(new File([bytes], instruction.file.name, { type: instruction.file.type }));
    before.input.files = transfer.files;
    writes += 1;
    before.input.dispatchEvent(new Event("input", { bubbles: true, composed: true }));
    if (!before.input.isConnected) return failure("control_target_missing", "input 事件后附件控件发生变化，未再次上传", "interaction");
    before.input.dispatchEvent(new Event("change", { bubbles: true, composed: true }));
  } catch (error) {
    return failure("file_upload_execution_failed", error instanceof Error ? error.message : "附件写入失败", "interaction");
  }
  const timeout = Math.max(0, Math.min(60_000, options.timeoutMs ?? 30_000));
  const poll = Math.max(10, Math.min(1_000, options.pollIntervalMs ?? 250));
  let stableReads = 0;
  do {
    // Let the change event rebuild the native input before the first read.
    await new Promise(resolve => setTimeout(resolve, observations === 1 ? 0 : poll));
    const state = inspect();
    if (!state) return failure("control_target_missing", "等待上传时附件身份或控件结构发生变化，未再次上传");
    if (state.siteError) return failure("file_upload_rejected", state.error, "readback", state.filename);
    stableReads = state.filename === expected ? stableReads + 1 : 0;
    if (stableReads >= 2) return success(false);
  } while (Date.now() - started < timeout);
  return failure("file_upload_receipt_timeout", "附件已交给招聘网站，但等待完成文件卡片超时，未再次上传");
}
