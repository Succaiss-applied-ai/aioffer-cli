import type { ResumeKnowledgeSnapshot, SearchPlan } from "../../src/domain.js";
import type { PublicRecruitingError } from "../../src/errors.js";
import type { ModelExecutionEvidence } from "../../src/model/model-tasks.js";
import type { DiscoveryRun } from "../../src/search/job-discovery.js";
import type { FillResult, PageObservation } from "./page-adapter.js";

interface ManualAssistField {
  id: string;
  label: string;
  value: string;
  valueSource: string;
  sectionId?: string;
  sectionTitle?: string;
  sectionKind?: "basic" | "education" | "work" | "project" | "award" | "skill" | "narrative" | "other";
  groupIndex?: number;
  fieldId?: string;
  stableFieldKey?: string;
  fieldKey?: string;
  type?: string;
  required?: boolean;
  options?: string[];
  observed?: boolean;
  note?: string;
}

interface ManualAssistSection {
  id: string;
  title: string;
  kind: "basic" | "education" | "work" | "project" | "award" | "skill" | "narrative" | "other";
  note?: string;
  items: ManualAssistField[];
}

interface ManualObservedField {
  fieldId: string;
  stableFieldKey?: string;
  label: string;
  type: string;
  required: boolean;
  options: string[];
  currentValue: string;
  hasValue: boolean;
  hasSuggestion: boolean;
}

interface ManualInformationRequest {
  id: string;
  label: string;
  question: string;
  reason: "ai_value_missing" | "required_form_field_unmatched";
  sectionId?: string;
  sectionTitle?: string;
  fieldId?: string;
  stableFieldKey?: string;
  type?: string;
  options: string[];
  valueSource?: string;
}

interface ManualAssistState {
  mode: "copy_paste";
  applicationUrl: string;
  job: {
    companyName?: string;
    title?: string;
    city?: string;
  } | null;
  note?: string;
  items: ManualAssistField[];
  sections?: ManualAssistSection[];
  observedFields: ManualObservedField[];
  unmatchedRequiredFields: ManualObservedField[];
  informationRequests?: ManualInformationRequest[];
  updatedAt: string;
  observedAt: string | null;
}

interface CandidateInfoPackageState {
  schemaVersion: "candidate-info-package-state.v1";
  sourceSchemaVersion: string;
  fileName: string;
  packageId: string | null;
  uploadedAt: string;
  confirmedAt: string | null;
  status: "draft" | "confirmed";
  warnings: string[];
  manualAssist: ManualAssistState;
}

interface EntitlementState {
  baseUrl: string;
  tenantId: string;
  deviceId: string;
  tokenConfigured: boolean;
  status: "inactive" | "active" | "quota_exhausted" | "offline";
  account: {
    accountId: string;
    displayName: string;
  } | null;
  plan: {
    planCode: string;
    name: string;
  } | null;
  quota: {
    feature: "llm_one_click_fill";
    total: number;
    used: number;
    remaining: number;
    resetAt: string | null;
  } | null;
  features: {
    manualCopy: boolean;
    currentPageObservation: boolean;
    llmOneClickFill: boolean;
  };
  rechargeUrl: string | null;
  activatedAt: string | null;
  expiresAt: string | null;
  lastCheckedAt: string | null;
  lastError: string | null;
}

interface ActiveApplication {
  jobId: string;
  tabId: number;
  entryMode?: "selected_job" | "current_page";
  status: "opening" | "login_required" | "observing" | "information_required" | "ready_to_fill" | "filling" | "ready_for_review" | "failed";
  observation: PageObservation | null;
  mappings: Array<{ fieldId: string; stableFieldKey?: string; semanticKey: string; confidence: number }>;
  prefillDraft?: Array<{ fieldId: string; stableFieldKey?: string; label: string; semanticKey: string; value: string; confidence: number }>;
  customAnswers: Record<string, string>;
  missing: Array<{ fieldId: string; stableFieldKey?: string; label: string; semanticKey: string | null; type: string; options: string[]; memoryKey: string | null; rememberedValue: string }>;
  readback: FillResult[];
  lastError: string | null;
  reviewConfirmedAt: string | null;
  manualAssist?: ManualAssistState;
  rpaTrace?: Array<{
    stage: "entitlement" | "upload" | "observe_actions" | "select_action" | "execute_action" | "prepare_sections" | "audit_form" | "correct_form" | "readback" | "manual_assist";
    status: "completed" | "skipped" | "failed";
    detail: string;
    at: string;
  }>;
}

interface ExtensionState {
  plan: SearchPlan | null;
  jobs: unknown[];
  selectedJobIds: string[];
  lastDiscovery: DiscoveryRun | null;
  deviceBridgeUrl: string;
  connectionStatus: "not_configured" | "offline" | "connected";
  cloudService: {
    connectionStatus: "not_configured" | "offline" | "connected";
    indexRevision: number | null;
    indexUpdatedAt: string | null;
  };
  entitlement: EntitlementState;
  modelService: {
    mode?: string;
    serviceCode?: string;
    connectionStatus: "not_configured" | "offline" | "connected";
  };
  modelExecutions: ModelExecutionEvidence[];
  candidatePackage: CandidateInfoPackageState | null;
  candidateProfile: { values: Record<string, string>; reusableAnswers: Record<string, string>; updatedAt: string | null };
  resumeKnowledge: ResumeKnowledgeSnapshot | null;
  fileAssets: {
    resume: { name: string; parser: string; parsedAt: string } | null;
    identityPhoto: { name: string } | null;
  };
  activeApplication: ActiveApplication | null;
  autoApplyRuntime: {
    connection: "unpaired" | "ready" | "offline";
    status: "idle" | "running" | "paused" | "cancelled" | "failed";
    batchId: string | null;
    jobId: string | null;
    companyName: string | null;
    title: string | null;
    updatedAt: string | null;
    lastError: string | null;
  };
}

const app = document.querySelector<HTMLElement>("#app");
if (!app) throw new Error("Missing #app");

const liveRegion = document.querySelector<HTMLElement>("#live-region");
let current: ExtensionState | null = null;
let lastError: PublicRecruitingError | null = null;
let polling = false;
let lastCopiedKey: string | null = null;
let filePickerActiveUntil = 0;
let fileUploadInProgress = false;
let errorPinnedUntil = 0;
let activationCodeDraft = "";
let activationInputActiveUntil = 0;
let missingInputActiveUntil = 0;
const missingAnswerDrafts = new Map<string, string>();
const manualSectionOpenState = new Map<string, boolean>();

function pauseRefreshForFilePicker(): void {
  filePickerActiveUntil = Date.now() + 120_000;
}

function resumeRefreshAfterFilePicker(): void {
  filePickerActiveUntil = 0;
}

function pauseRefreshForActivationInput(): void {
  activationInputActiveUntil = Date.now() + 60_000;
}

function resumeRefreshAfterActivation(): void {
  activationInputActiveUntil = 0;
}

function pauseRefreshForMissingInput(): void {
  missingInputActiveUntil = Date.now() + 120_000;
}

function resumeRefreshAfterMissingSave(): void {
  missingInputActiveUntil = 0;
}

function shouldSuspendRefresh(): boolean {
  return fileUploadInProgress ||
    Date.now() < filePickerActiveUntil ||
    Date.now() < activationInputActiveUntil ||
    Date.now() < missingInputActiveUntil;
}

function setPanelError(error: PublicRecruitingError): void {
  lastError = error;
  errorPinnedUntil = Date.now() + 8_000;
}

function escapeHtml(value: unknown): string {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function escapeAttr(value: unknown): string {
  return escapeHtml(value).replaceAll("`", "&#096;");
}

function icon(kind: "spark" | "clock" | "check" | "warn" | "copy" | "link"): string {
  const paths = {
    spark: '<path d="M12 3l1.3 3.7L17 8l-3.7 1.3L12 13l-1.3-3.7L7 8l3.7-1.3L12 3Zm-6 9 .8 2.2L9 15l-2.2.8L6 18l-.8-2.2L3 15l2.2-.8L6 12Z"/>',
    clock: '<circle cx="12" cy="12" r="8"/><path d="M12 8v5l3 2"/>',
    check: '<path d="m5 12 4 4L19 6"/>',
    warn: '<path d="M12 4 3.5 19h17L12 4Z"/><path d="M12 9v4M12 16h.01"/>',
    copy: '<rect x="9" y="9" width="10" height="10" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v1"/>',
    link: '<path d="M10 13a5 5 0 0 0 7.1 0l2-2a5 5 0 0 0-7.1-7.1l-1.1 1.1"/><path d="M14 11a5 5 0 0 0-7.1 0l-2 2a5 5 0 0 0 7.1 7.1l1.1-1.1"/>'
  };
  return `<svg aria-hidden="true" viewBox="0 0 24 24">${paths[kind]}</svg>`;
}

function formatTime(value: string | null | undefined): string {
  if (!value) return "N/A";
  try {
    return new Date(value).toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit", second: "2-digit" });
  } catch {
    return value;
  }
}

function jobSummary(manual: ManualAssistState): string {
  const parts = [
    manual.job?.companyName,
    manual.job?.title,
    manual.job?.city
  ].filter(Boolean);
  return parts.length ? parts.join(" · ") : "当前招聘页";
}

function manualMetrics(manual: ManualAssistState | undefined, observation: PageObservation | null): string {
  return `
    <div class="metrics">
	      <span><b>${observation?.fields.length ?? manual?.observedFields.length ?? 0}</b><small>页面字段</small></span>
	      <span><b>${manual?.items.length ?? 0}</b><small>可复制项</small></span>
	      <span><b>${manual?.items.filter((item) => item.observed).length ?? 0}</b><small>已匹配</small></span>
	      <span><b>${manual?.informationRequests?.length ?? manual?.unmatchedRequiredFields.length ?? 0}</b><small>待补充</small></span>
	    </div>
	  `;
}

function manualSectionsForDisplay(manual: ManualAssistState): ManualAssistSection[] {
  if (manual.sections?.length) return manual.sections;
  return [{
    id: "manual-default",
    title: "建议填写内容",
    kind: "basic",
    items: manual.items
  }];
}

function manualSectionOpenKey(manual: ManualAssistState, section: ManualAssistSection, index: number): string {
  return [
    manual.applicationUrl || "package",
    section.id || section.title || section.kind || "section",
    String(index)
  ].join("::");
}

function manualSectionIsOpen(manual: ManualAssistState, section: ManualAssistSection, index: number): boolean {
  const key = manualSectionOpenKey(manual, section, index);
  return manualSectionOpenState.has(key)
    ? manualSectionOpenState.get(key) === true
    : index === 0;
}

function manualCopyKey(item: ManualAssistField): string {
  return `${item.sectionId ?? item.sectionTitle ?? item.sectionKind ?? "manual"}::${item.id}`;
}

function manualItemStatus(item: ManualAssistField, copyEnabled: boolean): string {
  const value = String(item.value ?? "").trim();
  if (!value) return "待补充";
  const application = current?.activeApplication ?? null;
  const pageObserved = Boolean(application?.manualAssist?.observedAt || application?.observation);
  if (item.observed) return "已匹配";
  if (pageObserved) return "未匹配表单";
  return copyEnabled ? "可复制" : "待确认";
}

function looksLikeTechnicalFieldPath(value: string): boolean {
  const text = value.trim();
  if (!text) return false;
  if (/^(candidate|resume|resumeSnapshot|fieldFacts|profile|basic|preferences|education|educations|work|project|award|skill|language|narrative)[.[\]0-9A-Za-z_-]*$/i.test(text) &&
    /[.[\]]/.test(text)) return true;
  return /^[A-Za-z_$][\w$]*(?:\.\w+|\[\d+\]){2,}$/.test(text);
}

function manualItemHelperText(item: ManualAssistField, optionText: string): string {
  if (optionText) return optionText;
  const note = String(item.note ?? "").trim();
  if (note && !looksLikeTechnicalFieldPath(note)) return note;
  const sectionTitle = String(item.sectionTitle ?? "").trim();
  if (sectionTitle) return sectionTitle;
  if (item.sectionKind && item.sectionKind !== "other") return sectionKindTitle(item.sectionKind);
  return "信息包";
}

function manualItemCard(item: ManualAssistField, copyEnabled = true): string {
  const value = String(item.value ?? "");
  const canCopy = copyEnabled && value.trim().length > 0;
  const copyKey = manualCopyKey(item);
  const copied = copyKey === lastCopiedKey;
  const optionText = item.options?.length ? `页面选项：${item.options.slice(0, 6).join(" / ")}${item.options.length > 6 ? "…" : ""}` : "";
  const statusText = manualItemStatus(item, copyEnabled);
  const helperText = manualItemHelperText(item, optionText);
  return `
    <article class="copy-card ${item.observed ? "matched" : "unmatched"} ${canCopy ? "" : "missing-value"}">
	      <div class="copy-card-main">
	        <div>
	          <h3>${escapeHtml(item.label)}${item.required ? '<em>必填</em>' : ""}</h3>
	          <p>${escapeHtml(helperText)}</p>
	        </div>
	        <div class="copy-card-actions">
	          <span class="match-pill">${escapeHtml(statusText)}</span>
	          <button type="button" class="copy-button" data-copy-key="${escapeAttr(copyKey)}" aria-label="复制${escapeAttr(item.label)}" title="${copied ? "已复制" : "复制"}" ${canCopy ? "" : "disabled"}>
	            ${icon(copied ? "check" : "copy")}
	          </button>
	        </div>
	      </div>
	      <pre>${escapeHtml(value || "信息包尚未提供内容")}</pre>
	    </article>
	  `;
}

function manualItemCards(manual: ManualAssistState, copyEnabled = true): string {
  if (!manual.items.length) {
    return `
      <div class="empty-card">
        <strong>暂无可复制内容</strong>
        <p>当前信息包没有可用于填写的字段；请回到 AI 侧重新导出标准信息包。</p>
      </div>
    `;
  }
  return `<div class="section-list">${manualSectionsForDisplay(manual).map((section, index) => `
    <details class="copy-section ${escapeAttr(section.kind)}" data-manual-section-key="${escapeAttr(manualSectionOpenKey(manual, section, index))}" ${manualSectionIsOpen(manual, section, index) ? "open" : ""}>
      <summary class="copy-section-heading">
        <div>
          <h3>${escapeHtml(section.title || `填写分组 ${index + 1}`)}</h3>
          ${section.note ? `<p>${escapeHtml(section.note)}</p>` : ""}
	        </div>
        <span class="section-count">${escapeHtml(section.items.length)} 项</span>
        <span class="section-toggle-icon" aria-hidden="true">⌄</span>
	      </summary>
	      <div class="copy-list">${section.items.map((item) => manualItemCard(item, copyEnabled)).join("")}</div>
	    </details>
	  `).join("")}</div>`;
}

function requestCanBeAnsweredInPlugin(request: ManualInformationRequest): boolean {
  const type = String(request.type ?? "").toLowerCase();
  return !["file", "checkbox", "radio", "hidden", "password"].includes(type);
}

function visibleRequestOptions(request: ManualInformationRequest): string[] {
  const seen = new Set<string>();
  return (request.options ?? [])
    .map((option) => String(option ?? "").trim())
    .filter((option) =>
      option &&
      !/^(请选择|选择|select|please select|--|不限|全部)$/i.test(option) &&
      !seen.has(option) &&
      (seen.add(option), true)
    )
    .slice(0, 24);
}

function missingRequestDraftKey(request: ManualInformationRequest): string {
  return request.id ||
    request.stableFieldKey ||
    request.fieldId ||
    `${request.label}:${request.question}`;
}

function missingRequestInput(request: ManualInformationRequest): string {
  if (!requestCanBeAnsweredInPlugin(request)) {
    const action = String(request.type ?? "").toLowerCase() === "file" ? "上传文件" : "勾选/选择";
    return `<p class="missing-web-note">该项需要在招聘网页中${escapeHtml(action)}，完成后点击“我已在网页填写，重新检测”。</p>`;
  }
  const draftKey = missingRequestDraftKey(request);
  const draftValue = missingAnswerDrafts.get(draftKey) ?? "";
  const attrs = [
    `data-missing-answer-input`,
    `data-draft-key="${escapeAttr(draftKey)}"`,
    `data-request-id="${escapeAttr(request.id)}"`,
    request.fieldId ? `data-field-id="${escapeAttr(request.fieldId)}"` : "",
    request.stableFieldKey ? `data-stable-field-key="${escapeAttr(request.stableFieldKey)}"` : "",
    `data-label="${escapeAttr(request.label)}"`,
    request.type ? `data-field-type="${escapeAttr(request.type)}"` : "",
    request.options.length ? `data-options="${escapeAttr(JSON.stringify(request.options))}"` : ""
  ].filter(Boolean).join(" ");
  const options = visibleRequestOptions(request);
  if (options.length) {
    return `
      <select ${attrs}>
        <option value="">选择或在网页中手动填写</option>
        ${options.map((option) => `<option value="${escapeAttr(option)}" ${option === draftValue ? "selected" : ""}>${escapeHtml(option)}</option>`).join("")}
      </select>
    `;
  }
  const multiline = /描述|内容|职责|经历|介绍|评价|说明|优势|原因|description|summary|cover/i
    .test(`${request.label} ${request.question}`);
  if (multiline) {
    return `<textarea ${attrs} rows="3" placeholder="在这里补充该必填项，保存后可继续一键填写">${escapeHtml(draftValue)}</textarea>`;
  }
  return `<input ${attrs} type="text" value="${escapeAttr(draftValue)}" placeholder="在这里补充该必填项，保存后可继续一键填写" />`;
}

function unmatchedRequired(manual: ManualAssistState): string {
  const requests = blockingInformationRequests(manual);
  if (!requests.length) return "";
  const pluginAnswerable = requests.some(requestCanBeAnsweredInPlugin);
	  return `
	    <section class="assist-card warning-card">
	      <h2>先补充缺失信息（${requests.length} 项）</h2>
	      <p>补齐后才能继续一键填写。文字/选项可直接在插件内补充；文件、协议勾选等用户专属项可在招聘网页中自行处理。</p>
	      <div class="missing-answer-form">
        ${requests.slice(0, 12).map((request) => `
          <label class="missing-answer-row">
            <span>${escapeHtml(request.label)}</span>
            <small>${escapeHtml(request.question)}${request.options.length ? ` · ${escapeHtml(request.options.slice(0, 4).join(" / "))}` : ""}</small>
            ${missingRequestInput(request)}
          </label>
        `).join("")}
	      </div>
	      <div class="missing-actions">
	        ${pluginAnswerable ? `<button type="button" class="primary-action" data-save-missing-answers>保存插件内补充</button>` : ""}
	        <button type="button" class="ghost-action" data-inspect-application>我已在网页填写，重新检测</button>
	      </div>
    </section>
	  `;
}

function manualStatus(packageState: CandidateInfoPackageState | null, application: ActiveApplication | null): {
  tone: "idle" | "working" | "action" | "success" | "error";
  title: string;
  detail: string;
  icon: "spark" | "clock" | "check" | "warn";
} {
  if (!packageState) {
    return {
      tone: "action",
      title: "上传标准信息包",
      detail: "请上传 AI 侧导出的 .zcresume.json 信息包；插件安装后无需额外配置。",
      icon: "spark"
    };
  }
  if (packageState.status === "draft") {
    return {
      tone: packageState.warnings.length ? "action" : "working",
      title: "请确认信息包",
      detail: packageState.warnings.length
        ? `信息包可读取，但有 ${packageState.warnings.length} 个提醒；确认后才允许复制和读取表单。`
        : "确认后即可复制简历字段，或读取当前招聘页表单。",
      icon: packageState.warnings.length ? "warn" : "clock"
    };
  }
  if (!application?.manualAssist) {
    return {
      tone: "success",
      title: "信息包已就绪",
      detail: "可以直接复制字段；打开招聘申请页后点击“读取当前招聘页”可匹配必填项。",
      icon: "check"
    };
  }
  if (application.lastError || application.status === "failed") {
    return {
      tone: "error",
      title: "一键填写未完成",
      detail: application.lastError ?? "当前页面没有检测到可填写的招聘表单。",
      icon: "warn"
    };
  }
  if (application.status === "filling") {
    return {
      tone: "working",
      title: "正在一键填写",
      detail: "正在操作当前招聘表单；请先不要关闭页面或点击最终提交。",
      icon: "clock"
    };
  }
  if (application.status === "ready_for_review") {
    return {
      tone: "success",
      title: "已填好，等待你确认",
      detail: "已停在最终提交前。请核对招聘页面中的信息，确认无误后再由你手动提交。",
      icon: "check"
    };
  }
  if (application.status === "login_required") {
    return {
      tone: "action",
      title: "请先在左侧网页登录",
      detail: application.observation?.loginReason ?? "插件不会读取密码、验证码或 Cookie；登录完成后会自动重新抓取表单。",
      icon: "warn"
    };
  }
  if (application.status === "opening") {
    return {
      tone: "working",
      title: "正在读取当前招聘页",
      detail: "读取完成后会展示页面字段和可复制的填写内容。",
      icon: "clock"
    };
  }
  if (application.status === "information_required") {
    return {
      tone: "action",
      title: "有必填项需要处理",
      detail: "请查看下方缺失项。文件、隐私同意、验证码等需要用户本人处理。",
      icon: "warn"
    };
  }
  return {
    tone: "success",
    title: "可以一键填写",
    detail: "点击一键填写后，插件会自动填当前招聘表单并停在最终提交前。",
    icon: "check"
  };
}

function entitlementTone(entitlement: EntitlementState | undefined): "idle" | "working" | "action" | "success" | "error" {
  if (!entitlement || entitlement.status === "inactive") return "action";
  if (entitlement.status === "active") return "success";
  if (entitlement.status === "quota_exhausted") return "action";
  if (entitlement.status === "offline") return "error";
  return "idle";
}

function entitlementTitle(entitlement: EntitlementState | undefined): string {
  if (!entitlement || entitlement.status === "inactive") return "一键填写尚未激活";
  if (entitlement.status === "active") return "一键填写已激活";
  if (entitlement.status === "quota_exhausted") return "可用次数不足";
  return "权益状态暂不可用";
}

function entitlementDetail(entitlement: EntitlementState | undefined): string {
  if (!entitlement || entitlement.status === "inactive") return "输入平台提供的特殊码后，可以启用后续一键填写和次数统计。";
  if (entitlement.status === "offline") return entitlement.lastError || "当前网络无法刷新权益状态，已保留本地信息包辅助填写能力。";
  const quota = entitlement.quota;
  if (!quota) return entitlement.plan?.name || "权益已激活";
  return `剩余 ${quota.remaining} 次 / 共 ${quota.total} 次${entitlement.expiresAt ? ` · 有效期至 ${new Date(entitlement.expiresAt).toLocaleDateString("zh-CN")}` : ""}`;
}

function entitlementCard(entitlement: EntitlementState | undefined): string {
  const tone = entitlementTone(entitlement);
  const quota = entitlement?.quota;
  const activated = entitlement?.status === "active" || entitlement?.status === "quota_exhausted";
  return `
    <section class="assist-card entitlement-card ${escapeHtml(tone)}">
      <div class="package-head">
        <div>
          <h2>${escapeHtml(entitlementTitle(entitlement))}</h2>
          <p>${escapeHtml(entitlementDetail(entitlement))}</p>
        </div>
        <span class="pill ${escapeHtml(tone)}">${activated ? `${escapeHtml(String(quota?.remaining ?? 0))} 次` : "未激活"}</span>
      </div>
      ${activated ? `
        <div class="quota-row" aria-label="一键填写可用次数">
          <span><b>${escapeHtml(String(quota?.remaining ?? 0))}</b><small>剩余次数</small></span>
          <span><b>${escapeHtml(String(quota?.used ?? 0))}</b><small>已使用</small></span>
          <span><b>${escapeHtml(entitlement?.plan?.name ?? "体验版")}</b><small>当前权益</small></span>
        </div>
        <div class="package-actions">
          <button type="button" class="secondary-action" data-entitlement-refresh>刷新权益</button>
          <button type="button" class="ghost-action" data-entitlement-checkout>前往充值</button>
        </div>
      ` : `
        <div class="activation-form">
          <label for="activation-code">特殊码</label>
          <div>
            <input id="activation-code" type="text" inputmode="text" autocomplete="one-time-code" placeholder="输入特殊码" value="${escapeAttr(activationCodeDraft)}" data-entitlement-code>
            <button type="button" class="primary-action" data-entitlement-activate>确认激活</button>
          </div>
          <button type="button" class="ghost-action" data-entitlement-checkout>前往充值</button>
        </div>
      `}
    </section>
  `;
}

function blockingInformationRequests(manual: ManualAssistState | undefined): ManualInformationRequest[] {
  if (!manual?.informationRequests?.length) return [];
  const itemByRequestId = new Map(manual.items.map((item) => [`item:${item.id}`, item]));
  return manual.informationRequests.filter((request) => {
    if (request.reason === "required_form_field_unmatched") return true;
    const item = itemByRequestId.get(request.id);
    return item?.required === true;
  });
}

function oneClickCard(state: ExtensionState | null): string {
  const packageState = state?.candidatePackage ?? null;
  const application = state?.activeApplication ?? null;
  const manual = application?.manualAssist ?? null;
  const blockingRequests = blockingInformationRequests(manual ?? undefined);
  const packageReady = packageState?.status === "confirmed";
  const canInspect = packageReady && (!application || application.status === "login_required" || application.status === "opening");
  const canFill = packageReady && Boolean(application?.observation) &&
    !["opening", "login_required", "filling", "ready_for_review"].includes(application?.status ?? "") &&
    blockingRequests.length === 0;
  const title = application?.status === "ready_for_review"
    ? "一键填写已完成"
    : application?.status === "filling"
      ? "正在一键填写"
      : "LLM 一键填写";
  const detail = !packageReady
    ? "先上传并确认标准信息包。"
    : !application
      ? "打开招聘申请页后，先读取当前页面，再一键填写。"
      : application.status === "login_required"
        ? "当前招聘页需要登录。登录完成后点击继续检测。"
      : application.status === "ready_for_review"
          ? "请在招聘网页核对所有内容；插件不会代点最终提交。"
          : application.status === "filling"
            ? "正在填写和回读校验，请勿关闭招聘页面。"
            : blockingRequests.length
                ? `上方还有 ${blockingRequests.length} 个必填项待补充；可在插件内补充，或在网页填写后重新检测。`
                : "将自动填写当前招聘表单，完成后停在最终提交前。";
  const tone: "idle" | "working" | "action" | "success" | "error" = application?.status === "ready_for_review"
    ? "success"
    : application?.status === "filling"
      ? "working"
      : application?.status === "failed"
        ? "error"
        : canFill
          ? "success"
          : "action";
  return `
    <section class="assist-card one-click-card ${escapeHtml(tone)}">
      <div class="package-head">
        <div>
          <h2>${escapeHtml(title)}</h2>
          <p>${escapeHtml(detail)}</p>
        </div>
        <span class="pill ${escapeHtml(tone)}">无需激活</span>
      </div>
      <div class="one-click-actions">
        ${canInspect ? `
          <button type="button" class="secondary-action" data-inspect-application>
            ${application?.status === "login_required" ? "登录后继续检测" : "读取当前招聘页"}
          </button>
        ` : ""}
        <button type="button" class="primary-action one-click-primary" data-one-click-fill ${canFill ? "" : "disabled"}>
          ${application?.status === "filling" ? "填写中…" : application?.status === "ready_for_review" ? "已完成" : "一键填写并停在提交前"}
        </button>
      </div>
      <p class="safety-note">安全限制：不会填写验证码/密码，不会自动勾选隐私协议，不会点击最终提交。</p>
    </section>
  `;
}

function autoApplyRuntimeCard(runtime: ExtensionState["autoApplyRuntime"] | undefined): string {
  const connected = runtime?.connection === "ready";
  const running = runtime?.status === "running" || runtime?.status === "paused";
  const status = runtime?.status === "paused"
    ? "已暂停"
    : runtime?.status === "running" ? "正在自动投递" : connected ? "自动投递已就绪" : "等待 AI 侧连接";
  const detail = running
    ? `${runtime?.companyName ?? ""}${runtime?.title ? ` · ${runtime.title}` : ""}`
    : connected
      ? "AI 侧批次确认后，插件会自动串行处理无需登录的投递页面。"
      : "安装完成后无需输入激活码或 API Key；AI 侧首次下发任务时会自动完成绑定。";
  return `
    <section class="assist-card ${running ? "working" : connected ? "success" : "action"}">
      <div class="package-head">
        <div><h2>${escapeHtml(status)}</h2><p>${escapeHtml(detail)}</p></div>
        <span class="pill ${connected ? "success" : "action"}">${connected ? "已连接" : "未连接"}</span>
      </div>
      ${running && runtime?.batchId ? `
        <div class="package-actions">
          <button type="button" class="secondary-action" data-auto-apply-control="${runtime.status === "paused" ? "resume" : "pause"}" data-batch-id="${escapeAttr(runtime.batchId)}">${runtime.status === "paused" ? "继续" : "暂停"}</button>
          <button type="button" class="ghost-action" data-auto-apply-control="cancel" data-batch-id="${escapeAttr(runtime.batchId)}">终止</button>
        </div>
      ` : ""}
    </section>
  `;
}

function rpaStageTitle(stage: NonNullable<ActiveApplication["rpaTrace"]>[number]["stage"]): string {
  const titles = {
    entitlement: "权益校验",
    upload: "文件上传",
    observe_actions: "读取页面",
    select_action: "动作选择",
    execute_action: "站点解析",
    prepare_sections: "经历区块",
    audit_form: "表单核验",
    correct_form: "填写修正",
    readback: "最终回读",
    manual_assist: "LLM 预填"
  };
  return titles[stage] ?? stage;
}

function traceCard(application: ActiveApplication | null): string {
  const trace = application?.rpaTrace ?? [];
  if (!trace.length) return "";
  return `
    <section class="trace-card">
      <div class="trace-heading">
        <h2>一键填写记录</h2>
        <span>${escapeHtml(formatTime(trace.at(-1)?.at ?? null))}</span>
      </div>
      <ul class="trace-list">
        ${trace.slice(-8).map((item) => `
          <li class="${escapeAttr(item.status)}">
            <span>${item.status === "completed" ? "✓" : item.status === "failed" ? "!" : "–"}</span>
            <div>
              <strong>${escapeHtml(rpaStageTitle(item.stage))}</strong>
              <small>${escapeHtml(item.detail)}</small>
            </div>
          </li>
        `).join("")}
      </ul>
    </section>
  `;
}

function packageCard(packageState: CandidateInfoPackageState | null): string {
  if (!packageState) {
    return `
      <section class="assist-card package-card">
        <h2>上传信息包</h2>
        <p>仅支持 AI 侧导出的标准 JSON 信息包。P0 不再本地解析 PDF / Word 简历。</p>
        <label class="upload-drop">
          <span>选择 .zcresume.json 文件</span>
          <input type="file" accept=".json,.zcresume,.zcresume.json,application/json" data-info-package-file>
        </label>
      </section>
    `;
  }
  const confirmed = packageState.status === "confirmed";
  return `
    <section class="assist-card package-card ${confirmed ? "confirmed" : "draft"}">
      <div class="package-head">
        <div>
          <h2>${confirmed ? "信息包已确认" : "信息包待确认"}</h2>
          <p>${escapeHtml(packageState.fileName)} · ${escapeHtml(formatTime(packageState.confirmedAt ?? packageState.uploadedAt))}</p>
        </div>
        <span class="pill ${confirmed ? "success" : "action"}">${confirmed ? "可使用" : "待确认"}</span>
      </div>
      ${packageState.warnings.length ? `
        <ul class="package-warnings">
          ${packageState.warnings.map((warning) => `<li>${escapeHtml(warning)}</li>`).join("")}
        </ul>
      ` : ""}
      <div class="package-actions">
        ${confirmed ? `
          <button type="button" class="primary-action" data-attach-current-page>读取当前招聘页</button>
          <label class="secondary-action">
            更换信息包
            <input type="file" accept=".json,.zcresume,.zcresume.json,application/json" data-info-package-file>
          </label>
        ` : `
          <button type="button" class="primary-action" data-confirm-info-package>确认使用</button>
          <label class="secondary-action">
            重新上传
            <input type="file" accept=".json,.zcresume,.zcresume.json,application/json" data-info-package-file>
          </label>
        `}
        <button type="button" class="ghost-action" data-clear-info-package>清空</button>
      </div>
    </section>
  `;
}

function renderManual(error: PublicRecruitingError | null): string {
  const application = current?.activeApplication ?? null;
  const packageState = current?.candidatePackage ?? null;
  const manual = application?.manualAssist ?? packageState?.manualAssist;
  const view = manualStatus(packageState, application);
  const manifest = chrome.runtime.getManifest();
  const copyEnabled = Boolean(application?.manualAssist || packageState?.status === "confirmed");
  return `
	    <main class="status-shell" aria-label="AI Offer 招聘小助手 手动投递辅助状态">
	      <section class="status-card ${escapeHtml(view.tone)}">
        <div class="top-row">
          <div class="brand">
	              <span class="brand-mark">${icon("spark")}</span>
	              <div>
	                <h1>AI Offer 招聘小助手</h1>
	                <p>信息包辅助版 · v${escapeHtml(manifest.version)}</p>
	              </div>
	            </div>
	          <span class="pill ${escapeHtml(view.tone)}">${packageState ? packageState.status === "confirmed" ? "已就绪" : "待确认" : "未上传"}</span>
	        </div>
        <div class="current-status">
          <span class="status-icon">${icon(view.icon)}</span>
          <div>
            <h2>${escapeHtml(view.title)}</h2>
            <p>${escapeHtml(view.detail)}</p>
          </div>
        </div>
        ${error ? `
          <div class="error-box">
            <strong>${escapeHtml(error.message)}</strong>
            <p>${escapeHtml(error.userAction)}</p>
          </div>
	        ` : ""}
	        ${manualMetrics(manual, application?.observation ?? null)}
	      </section>
	      ${autoApplyRuntimeCard(current?.autoApplyRuntime)}
	      ${packageCard(packageState)}
	      ${manual ? unmatchedRequired(manual) : ""}
	      ${oneClickCard(current)}
	      ${traceCard(application)}

	      ${manual && application?.manualAssist ? `
	        <section class="assist-card job-card">
	          <div>
	            <h2>${escapeHtml(jobSummary(manual))}</h2>
            <p>${escapeHtml(manual.applicationUrl)}</p>
          </div>
	          <a href="${escapeAttr(manual.applicationUrl)}" target="_blank" rel="noreferrer">${icon("link")}打开</a>
	        </section>
	      ` : ""}

	      ${manual ? `
	        <section class="assist-card">
	          <div class="section-heading-compact">
	            <div>
	              <h2>建议填写内容</h2>
	              <p>更新时间：${escapeHtml(formatTime(manual.updatedAt))}${manual.observedAt ? ` · 表单读取：${escapeHtml(formatTime(manual.observedAt))}` : ""}</p>
	            </div>
	          </div>
	          ${manualItemCards(manual, copyEnabled)}
	        </section>
	      ` : `
	        <section class="assist-card empty-card">
	          <strong>等待信息包</strong>
	          <p>上传并确认标准信息包后，这里会出现可复制的简历字段。</p>
	        </section>
	      `}
	    </main>
  `;
}

function render(): void {
  app.setAttribute("aria-busy", polling ? "true" : "false");
  app.innerHTML = renderManual(lastError);
}

function activeManualForCopy(): ManualAssistState | null {
  if (current?.activeApplication?.manualAssist) return current.activeApplication.manualAssist;
  if (current?.candidatePackage?.status === "confirmed") return current.candidatePackage.manualAssist;
  return null;
}

function manualItemsByCopyKey(): Map<string, ManualAssistField> {
  return new Map((activeManualForCopy()?.items ?? []).map((item) => [manualCopyKey(item), item]));
}

document.addEventListener("click", async (event) => {
  const target = event.target as HTMLElement | null;
  const autoApplyControlButton = target?.closest<HTMLButtonElement>("[data-auto-apply-control]");
  if (autoApplyControlButton) {
    const action = autoApplyControlButton.dataset.autoApplyControl;
    const batchId = autoApplyControlButton.dataset.batchId;
    if (action && batchId) {
      const response = await chrome.runtime.sendMessage({
        type: "AUTO_APPLY_LOCAL_CONTROL",
        action,
        batchId
      }) as { ok?: boolean; error?: PublicRecruitingError };
      if (!response?.ok && response?.error) setPanelError(response.error);
      await refreshState();
    }
    return;
  }
  const filePickerTrigger = target?.closest<HTMLElement>(".upload-drop, .secondary-action");
  if (filePickerTrigger?.querySelector("[data-info-package-file]")) {
    pauseRefreshForFilePicker();
    if (liveRegion) liveRegion.textContent = "正在选择信息包文件";
  }
  const activateEntitlement = target?.closest<HTMLButtonElement>("[data-entitlement-activate]");
  if (activateEntitlement) {
    const activationCode = (document.querySelector<HTMLInputElement>("[data-entitlement-code]")?.value ?? activationCodeDraft).trim();
    activationCodeDraft = activationCode;
    pauseRefreshForActivationInput();
    try {
      const response = await chrome.runtime.sendMessage({
        type: "ENTITLEMENT_ACTIVATE",
        activationCode
      }) as { ok: boolean; state?: ExtensionState; error?: PublicRecruitingError };
      if (response.ok && response.state) {
        current = response.state;
        lastError = null;
        activationCodeDraft = "";
        resumeRefreshAfterActivation();
        if (liveRegion) liveRegion.textContent = "一键填写已激活";
      } else if (response.error) {
        setPanelError(response.error);
        pauseRefreshForActivationInput();
      }
      render();
    } catch (error) {
      setPanelError({
        code: "TRANSPORT_FAILED",
        stage: "transport",
        message: error instanceof Error ? error.message : "特殊码激活失败",
        retryable: true,
        userAction: "重新加载插件后再试。"
      });
      pauseRefreshForActivationInput();
      render();
    }
    return;
  }
  const refreshEntitlement = target?.closest<HTMLButtonElement>("[data-entitlement-refresh]");
  if (refreshEntitlement) {
    try {
      const response = await chrome.runtime.sendMessage({ type: "ENTITLEMENT_REFRESH" }) as { ok: boolean; state?: ExtensionState; error?: PublicRecruitingError };
      if (response.ok && response.state) {
        current = response.state;
        lastError = null;
        if (liveRegion) liveRegion.textContent = "权益状态已刷新";
      } else if (response.error) {
        setPanelError(response.error);
      }
      render();
    } catch (error) {
      setPanelError({
        code: "TRANSPORT_FAILED",
        stage: "transport",
        message: error instanceof Error ? error.message : "权益刷新失败",
        retryable: true,
        userAction: "重新加载插件后再试。"
      });
      render();
    }
    return;
  }
  const checkoutEntitlement = target?.closest<HTMLButtonElement>("[data-entitlement-checkout]");
  if (checkoutEntitlement) {
    try {
      const response = await chrome.runtime.sendMessage({ type: "ENTITLEMENT_CHECKOUT" }) as { ok: boolean; state?: ExtensionState; error?: PublicRecruitingError };
      if (response.ok && response.state) {
        current = response.state;
        lastError = null;
        if (liveRegion) liveRegion.textContent = "已打开充值页面";
      } else if (response.error) {
        setPanelError(response.error);
      }
      render();
    } catch (error) {
      setPanelError({
        code: "TRANSPORT_FAILED",
        stage: "transport",
        message: error instanceof Error ? error.message : "充值入口打开失败",
        retryable: true,
        userAction: "重新加载插件后再试。"
      });
      render();
    }
    return;
  }
  const confirmPackage = target?.closest<HTMLButtonElement>("[data-confirm-info-package]");
  if (confirmPackage) {
    try {
      const response = await chrome.runtime.sendMessage({ type: "INFO_PACKAGE_CONFIRM" }) as { ok: boolean; state?: ExtensionState; error?: PublicRecruitingError };
      if (response.ok && response.state) {
        current = response.state;
        lastError = null;
        if (liveRegion) liveRegion.textContent = "信息包已确认";
      } else if (response.error) {
        setPanelError(response.error);
      }
      render();
    } catch (error) {
      setPanelError({
        code: "TRANSPORT_FAILED",
        stage: "transport",
        message: error instanceof Error ? error.message : "信息包确认失败",
        retryable: true,
        userAction: "重新加载插件后再试。"
      });
      render();
    }
    return;
  }
  const clearPackage = target?.closest<HTMLButtonElement>("[data-clear-info-package]");
  if (clearPackage) {
    try {
      const response = await chrome.runtime.sendMessage({ type: "INFO_PACKAGE_CLEAR" }) as { ok: boolean; state?: ExtensionState; error?: PublicRecruitingError };
      if (response.ok && response.state) {
        current = response.state;
        lastError = null;
        lastCopiedKey = null;
        if (liveRegion) liveRegion.textContent = "信息包已清空";
      } else if (response.error) {
        setPanelError(response.error);
      }
      render();
    } catch (error) {
      setPanelError({
        code: "TRANSPORT_FAILED",
        stage: "transport",
        message: error instanceof Error ? error.message : "信息包清空失败",
        retryable: true,
        userAction: "重新加载插件后再试。"
      });
      render();
    }
    return;
  }
  const saveMissingAnswers = target?.closest<HTMLButtonElement>("[data-save-missing-answers]");
  if (saveMissingAnswers) {
    const controls = [...document.querySelectorAll<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>("[data-missing-answer-input]")];
    const answers = controls.map((control) => {
      let options: string[] = [];
      try {
        const rawOptions = control.dataset.options ? JSON.parse(control.dataset.options) : [];
        options = Array.isArray(rawOptions) ? rawOptions.map((option) => String(option)).filter(Boolean) : [];
      } catch {
        options = [];
      }
      return {
        requestId: control.dataset.requestId ?? "",
        fieldId: control.dataset.fieldId ?? "",
        stableFieldKey: control.dataset.stableFieldKey ?? "",
        label: control.dataset.label ?? "",
        type: control.dataset.fieldType ?? "",
        options,
        value: control.value.trim()
      };
    }).filter((answer) => answer.value);
    if (!answers.length) {
      if (liveRegion) liveRegion.textContent = "请先填写至少一个补充项";
      return;
    }
    saveMissingAnswers.disabled = true;
    try {
      const response = await chrome.runtime.sendMessage({
        type: "MANUAL_ASSIST_SUPPLEMENT",
        answers
      }) as { ok: boolean; state?: ExtensionState; error?: PublicRecruitingError };
      if (response.ok && response.state) {
        current = response.state;
        lastError = null;
        answers.forEach((answer) => missingAnswerDrafts.delete(answer.requestId));
        resumeRefreshAfterMissingSave();
        if (liveRegion) liveRegion.textContent = "补充信息已保存";
      } else if (response.error) {
        setPanelError(response.error);
      }
      render();
    } catch (error) {
      setPanelError({
        code: "TRANSPORT_FAILED",
        stage: "missing_information",
        message: error instanceof Error ? error.message : "补充信息保存失败",
        retryable: true,
        userAction: "请重新打开侧栏后再试；也可以直接在招聘网页中手动填写。"
      });
      render();
    }
    return;
  }
  const attachCurrent = target?.closest<HTMLButtonElement>("[data-attach-current-page]");
  if (attachCurrent) {
    try {
      const response = await chrome.runtime.sendMessage({ type: "APPLICATION_ATTACH_CURRENT" }) as { ok: boolean; state?: ExtensionState; error?: PublicRecruitingError };
      if (response.ok && response.state) {
        current = response.state;
        lastError = null;
        if (liveRegion) liveRegion.textContent = "已读取当前招聘页";
      } else if (response.error) {
        setPanelError(response.error);
      }
      render();
    } catch (error) {
      setPanelError({
        code: "TRANSPORT_FAILED",
        stage: "transport",
        message: error instanceof Error ? error.message : "当前页面读取失败",
        retryable: true,
        userAction: "请确认左侧已打开招聘申请网页，或重新加载插件后再试。"
      });
      render();
    }
    return;
  }
  const inspectApplication = target?.closest<HTMLButtonElement>("[data-inspect-application]");
  if (inspectApplication) {
    try {
      const response = await chrome.runtime.sendMessage({
        type: current?.activeApplication ? "APPLICATION_INSPECT" : "APPLICATION_ATTACH_CURRENT"
      }) as { ok: boolean; state?: ExtensionState; error?: PublicRecruitingError };
      if (response.ok && response.state) {
        current = response.state;
        lastError = null;
        if (liveRegion) liveRegion.textContent = "已重新检测招聘页";
      } else if (response.error) {
        setPanelError(response.error);
      }
      render();
    } catch (error) {
      setPanelError({
        code: "TRANSPORT_FAILED",
        stage: "transport",
        message: error instanceof Error ? error.message : "招聘页检测失败",
        retryable: true,
        userAction: "请确认左侧已打开招聘申请网页，或重新加载插件后再试。"
      });
      render();
    }
    return;
  }
  const oneClickFill = target?.closest<HTMLButtonElement>("[data-one-click-fill]");
  if (oneClickFill) {
    oneClickFill.disabled = true;
    if (liveRegion) liveRegion.textContent = "正在一键填写当前招聘页";
    try {
      const response = await chrome.runtime.sendMessage({
        type: "APPLICATION_FILL",
        requireEntitlement: false,
        idempotencyKey: `sidepanel-one-click:${Date.now()}:${Math.random().toString(16).slice(2)}`
      }) as { ok: boolean; state?: ExtensionState; error?: PublicRecruitingError };
      if (response.ok && response.state) {
        current = response.state;
        lastError = null;
        if (liveRegion) liveRegion.textContent = "一键填写完成，请核对后手动提交";
      } else if (response.error) {
        setPanelError(response.error);
        try {
          const latest = await chrome.runtime.sendMessage({ type: "STATE_GET" }) as { ok: boolean; state?: ExtensionState };
          if (latest.ok && latest.state) current = latest.state;
        } catch {
          // Keep the visible error; state refresh is a best-effort convenience.
        }
      }
      render();
    } catch (error) {
      setPanelError({
        code: "TRANSPORT_FAILED",
        stage: "transport",
        message: error instanceof Error ? error.message : "一键填写失败",
        retryable: true,
        userAction: "保留下方建议内容手动复制；也可以刷新招聘页后重试。"
      });
      render();
    }
    return;
  }
  const button = target?.closest<HTMLButtonElement>("[data-copy-key]");
  if (!button) return;
  const copyKey = button.dataset.copyKey ?? "";
  const item = manualItemsByCopyKey().get(copyKey);
  if (!item?.value) return;
  try {
    await navigator.clipboard.writeText(String(item.value));
    lastCopiedKey = copyKey;
    if (liveRegion) liveRegion.textContent = `已复制 ${item.label}`;
    render();
  } catch {
    if (liveRegion) liveRegion.textContent = "复制失败，请手动选中文本复制";
  }
});

document.addEventListener("change", async (event) => {
  const missingInput = (event.target as HTMLElement | null)?.closest<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>("[data-missing-answer-input]");
  if (missingInput) {
    const draftKey = missingInput.dataset.draftKey || missingInput.dataset.requestId || "";
    if (draftKey) missingAnswerDrafts.set(draftKey, missingInput.value);
    pauseRefreshForMissingInput();
    return;
  }
  const input = (event.target as HTMLElement | null)?.closest<HTMLInputElement>("[data-info-package-file]");
  const file = input?.files?.[0];
  if (!input || !file) {
    resumeRefreshAfterFilePicker();
    return;
  }
  fileUploadInProgress = true;
  resumeRefreshAfterFilePicker();
  if (liveRegion) liveRegion.textContent = "正在读取信息包";
  try {
    const text = await file.text();
    const packageData = JSON.parse(text) as unknown;
    const response = await chrome.runtime.sendMessage({
      type: "INFO_PACKAGE_UPLOAD",
      fileName: file.name,
      packageData
    }) as { ok: boolean; state?: ExtensionState; error?: PublicRecruitingError };
    if (response.ok && response.state) {
      current = response.state;
      lastError = null;
      lastCopiedKey = null;
      if (liveRegion) liveRegion.textContent = "信息包已读取，请确认";
    } else if (response.error) {
      setPanelError(response.error);
    }
  } catch (error) {
    setPanelError({
      code: "INVALID_INPUT",
      stage: "resume",
      message: error instanceof Error ? error.message : "信息包读取失败",
      retryable: true,
      userAction: "请上传 AI 侧导出的有效 JSON 信息包。"
    });
  } finally {
    fileUploadInProgress = false;
    input.value = "";
    render();
  }
});

document.addEventListener("input", (event) => {
  const target = event.target as HTMLElement | null;
  const entitlementInput = target?.closest<HTMLInputElement>("[data-entitlement-code]");
  if (entitlementInput) {
    activationCodeDraft = entitlementInput.value;
    pauseRefreshForActivationInput();
    return;
  }
  const missingInput = target?.closest<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>("[data-missing-answer-input]");
  if (missingInput) {
    const draftKey = missingInput.dataset.draftKey || missingInput.dataset.requestId || "";
    if (draftKey) missingAnswerDrafts.set(draftKey, missingInput.value);
    pauseRefreshForMissingInput();
  }
});

document.addEventListener("focusin", (event) => {
  const target = event.target as HTMLElement | null;
  if (target?.closest("[data-missing-answer-input]")) {
    pauseRefreshForMissingInput();
    return;
  }
  if (target?.closest("[data-entitlement-code]")) {
    pauseRefreshForActivationInput();
  }
});

document.addEventListener("toggle", (event) => {
  const details = event.target instanceof HTMLDetailsElement
    ? event.target
    : null;
  const key = details?.dataset.manualSectionKey ?? "";
  if (!key) return;
  manualSectionOpenState.set(key, details.open);
}, true);

document.addEventListener("keydown", (event) => {
  const input = (event.target as HTMLElement | null)?.closest<HTMLInputElement>("[data-entitlement-code]");
  if (!input || event.key !== "Enter") return;
  event.preventDefault();
  activationCodeDraft = input.value;
  pauseRefreshForActivationInput();
  document.querySelector<HTMLButtonElement>("[data-entitlement-activate]")?.click();
});

window.addEventListener("focus", () => {
  if (!filePickerActiveUntil || fileUploadInProgress) return;
  window.setTimeout(() => {
    if (!fileUploadInProgress) resumeRefreshAfterFilePicker();
  }, 1_500);
});

async function refreshState(): Promise<void> {
  if (shouldSuspendRefresh()) return;
  polling = true;
  try {
    const response = await chrome.runtime.sendMessage({ type: "STATE_GET" }) as {
      ok: boolean;
      state?: ExtensionState;
      error?: PublicRecruitingError;
    };
    if (response.ok && response.state) {
      current = response.state;
      if (Date.now() > errorPinnedUntil) lastError = null;
    } else if (response.error) {
      setPanelError(response.error);
    }
  } catch (error) {
    setPanelError({
      code: "TRANSPORT_FAILED",
      stage: "transport",
      message: error instanceof Error ? error.message : "插件后台通信失败",
      retryable: true,
      userAction: "重新加载插件后再试。"
    });
  } finally {
    polling = false;
    if (!shouldSuspendRefresh()) render();
  }
}

render();
void refreshState();
window.setInterval(() => {
  void refreshState();
}, 1500);
