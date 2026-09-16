import { assertLocalPlugin } from "./plugin-compatibility.js";
import { finalReviewNotice } from "./review-notice.js";
const $ = (id) => document.getElementById(id);
const fragment = new URLSearchParams(location.hash.slice(1));
if (fragment.has("token")) {
  sessionStorage.setItem("aioffer-token", fragment.get("token"));
  history.replaceState(null, "", "/");
}
const token = sessionStorage.getItem("aioffer-token") || "";
const selected = new Map();
let offset = 0,
  total = 0,
  versions = [],
  preview = null,
  configuration;
let extraAssetIds = [];
let previewRevision = 0;
function invalidatePreview() {
  previewRevision++;
  preview = null;
  $("previewArea").hidden = true;
  $("submitConsent").checked = false;
}
const instance =
  sessionStorage.getItem("aioffer-instance") || crypto.randomUUID();
sessionStorage.setItem("aioffer-instance", instance);
function notice(message, error = false) {
  $("notice").textContent = message;
  $("notice").className = error ? "error" : "";
}
async function api(path, body) {
  const res = await fetch(path, {
    method: body === undefined ? "GET" : "POST",
    headers: {
      authorization: `Bearer ${token}`,
      ...(body === undefined ? {} : { "content-type": "application/json" }),
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  const data = await res.json();
  if (!res.ok)
    throw Error(
      data.message || data.error?.message || `请求失败（${res.status}）`,
    );
  return data;
}
function bind(id, handler, event = "click", isDisabled = () => false) {
  $(id).addEventListener(event, async (e) => {
    e.preventDefault();
    const button = e.submitter || $(id);
    button.disabled = true;
    try {
      await handler(e);
    } catch (error) {
      notice(error.message, true);
    } finally {
      button.disabled = isDisabled();
    }
  });
}
function element(tag, text, cls) {
  const el = document.createElement(tag);
  el.textContent = text;
  if (cls) el.className = cls;
  return el;
}
function link(text, url) {
  const a = element("a", text);
  try {
    const u = new URL(url);
    if (!["https:", "http:"].includes(u.protocol)) return element("span", text);
    a.href = u.href;
    a.target = "_blank";
    a.rel = "noopener noreferrer";
  } catch {
    return element("span", text);
  }
  return a;
}
function action(text, fn) {
  const b = element("button", text, "secondary");
  b.onclick = async () => {
    b.disabled = true;
    try {
      await fn();
      await refreshAttempts();
    } catch (e) {
      notice(e.message, true);
    } finally {
      b.disabled = false;
    }
  };
  return b;
}
function bridge(type, payload = {}) {
  return new Promise((resolve, reject) => {
    if (document.documentElement.dataset.recruitingAiBridge !== "ready") {
      reject(Error("未检测到插件，请加载扩展后刷新本页面"));
      return;
    }
    const id = crypto.randomUUID();
    const timer = setTimeout(() => {
      window.removeEventListener("message", listener);
      reject(Error("插件响应超时，请检查扩展状态"));
    }, 20000);
    function listener(e) {
      if (
        e.source !== window ||
        e.origin !== location.origin ||
        e.data?.type !== "RECRUITING_AI_BRIDGE_RESULT" ||
        e.data.requestId !== id
      )
        return;
      clearTimeout(timer);
      window.removeEventListener("message", listener);
      e.data.ok
        ? resolve(e.data.response)
        : reject(
            Error(e.data.error || e.data.response?.error || "插件操作失败"),
          );
    }
    window.addEventListener("message", listener);
    window.postMessage(
      { type, requestId: id, clientInstanceId: instance, ...payload },
      location.origin,
    );
  });
}
async function status() {
  configuration = await api("/api/status");
  $("status").textContent =
    `岗位快照 ${configuration.jobs.toLocaleString()} 条 · 模型${configuration.model ? "已配置" : "未配置"} · MinerU ${configuration.mineruConfigured ? "已配置" : "未配置"}`;
  $("extensionPath").textContent = `扩展目录：${configuration.extensionPath}`;
  $("provider").replaceChildren(
    ...Object.entries(configuration.providers).map(([id, p]) => {
      const o = element("option", p.label);
      o.value = id;
      return o;
    }),
  );
  $("provider").value = configuration.model?.provider || "qwen";
  $("baseUrl").value =
    configuration.model?.baseUrl ||
    configuration.providers[$("provider").value].baseUrl;
  $("model").value = configuration.model?.model || "";
}
$("provider").onchange = () => {
  $("baseUrl").value = configuration.providers[$("provider").value].baseUrl;
  $("apiKey").value = "";
};
bind(
  "config",
  async () => {
    await api("/api/config", {
      model: {
        provider: $("provider").value,
        baseUrl: $("baseUrl").value,
        model: $("model").value,
        apiKey: $("apiKey").value,
      },
      mineruKey: $("mineruKey").value,
    });
    $("apiKey").value = "";
    $("mineruKey").value = "";
    await status();
    notice("配置已保存到本机。");
  },
  "submit",
);
bind("testModel", async () => {
  notice("正在使用一张本地测试图片验证模型连接…");
  notice((await api("/api/model/test", {})).message);
});
async function devices() {
  const items = await api("/api/devices");
  const old = $("device").value;
  $("device").replaceChildren(
    ...items.map((d) => {
      const o = element(
        "option",
        `${d.deviceName || d.deviceId} · ${d.pluginVersion || "未知版本"} · ${d.capabilities?.includes("aioffer.local-runtime.v1") ? "本地版" : "非本地版，不可使用"}`,
      );
      o.value = d.deviceId;
      o.disabled = !d.capabilities?.includes("aioffer.local-runtime.v1");
      return o;
    }),
  );
  if (items.some((d) => d.deviceId === old)) $("device").value = old;
}
bind("pair", async () => {
  assertLocalPlugin(await bridge("RECRUITING_AI_PLUGIN_INFO"));
  const bootstrap = await api("/api/bootstrap", {});
  await bridge("RECRUITING_DEVICE_BOOTSTRAP", bootstrap);
  await devices();
  notice("已连接本机插件。");
});
function showVersion() {
  extraAssetIds = [];
  $("attachments").replaceChildren();
  const v = versions.find((x) => x.id === $("version").value);
  $("profile").value = v ? JSON.stringify(v.profile, null, 2) : "";
  invalidatePreview();
}
async function resumes(id) {
  versions = await api("/api/resumes");
  $("version").replaceChildren(
    ...[...versions].reverse().map((v) => {
      const o = element(
        "option",
        `${v.confirmedAt ? "已确认" : "待核对"} · ${v.assets[0]?.name || "简历"} · ${new Date(v.createdAt).toLocaleString("zh-CN")}`,
      );
      o.value = v.id;
      return o;
    }),
  );
  if (id) $("version").value = id;
  showVersion();
}
$("version").onchange = showVersion;
bind(
  "import",
  async () => {
    const file = $("resumeFile").files[0];
    if (!file || file.size > 20 * 1024 * 1024)
      throw Error("请选择不超过 20 MB 的简历");
    notice("正在解析简历，可能需要几分钟，请勿重复上传…");
    const bytes = new Uint8Array(await file.arrayBuffer());
    let binary = "";
    for (let i = 0; i < bytes.length; i += 8192)
      binary += String.fromCharCode(...bytes.subarray(i, i + 8192));
    const result = await api("/api/resumes/import", {
      name: file.name,
      data: btoa(binary),
      allowExternalParsing: $("parsingConsent").checked,
    });
    await resumes(result.id);
    notice("解析完成，请核对下方资料。");
  },
  "submit",
);
bind(
  "attachment",
  async () => {
    const file = $("attachmentFile").files[0];
    if (!file || file.size > 20 * 1024 * 1024)
      throw Error("请选择不超过 20 MB 的附件");
    const bytes = new Uint8Array(await file.arrayBuffer());
    let binary = "";
    for (let i = 0; i < bytes.length; i += 8192)
      binary += String.fromCharCode(...bytes.subarray(i, i + 8192));
    const { asset } = await api("/api/resumes/import", {
      name: file.name,
      data: btoa(binary),
      purpose: $("attachmentPurpose").value,
    });
    extraAssetIds.push(asset.assetId);
    $("attachments").append(element("p", "待确认附件：" + asset.name));
    notice("附件已保存在本机，请点击资料确认保存到新版本。");
  },
  "submit",
);
bind("confirmProfile", async () => {
  const result = await api(`/api/resumes/${$("version").value}/confirm`, {
    profile: JSON.parse($("profile").value),
    confirmedByUser: true,
    extraAssetIds,
  });
  await resumes(result.id);
  notice("已保存新的确认版本。");
});
function selection() {
  invalidatePreview();
  $("selectionCount").textContent = `已选 ${selected.size} 个`;
}
let searchRequest = 0;
let searchPending = false;
let displayedQuery = "", displayedCity = "";
const previousDisabled = () => searchPending || offset === 0;
const nextDisabled = () => searchPending || offset + 30 >= total;
function updatePagination() {
  $("previous").disabled = previousDisabled();
  $("next").disabled = nextDisabled();
}
async function search(requestedOffset = offset) {
  const request = ++searchRequest;
  const query = $("query").value, city = $("city").value;
  if (query !== displayedQuery || city !== displayedCity) requestedOffset = 0;
  searchPending = true;
  updatePagination();
  try {
    const result = await api(
      `/api/jobs?q=${encodeURIComponent(query)}&city=${encodeURIComponent(city)}&offset=${requestedOffset}`,
    );
    // 仅最新成功响应可以替换列表和页码；失败不消耗当前页。
    if (request !== searchRequest) return;
    offset = requestedOffset;
    displayedQuery = query;
    displayedCity = city;
    renderJobs(result);
  } catch (error) {
    if (request === searchRequest) throw error;
  } finally {
    if (request === searchRequest) {
      searchPending = false;
      updatePagination();
    }
  }
}
function renderJobs(result) {
  total = result.total;
  $("jobCount").textContent =
    `找到 ${total} 个 · 当前 ${total ? offset + 1 : 0}–${Math.min(offset + 30, total)}`;
  $("jobs").replaceChildren();
  for (const job of result.items) {
    const div = element("div", "", "job");
    const label = element("label", "", "check");
    const checkbox = document.createElement("input");
    checkbox.type = "checkbox";
    checkbox.checked = selected.has(job.jobId);
    checkbox.onchange = () => {
      checkbox.checked
        ? selected.set(job.jobId, job)
        : selected.delete(job.jobId);
      selection();
    };
    label.append(
      checkbox,
      element("strong", `${job.companyName} · ${job.title}`),
    );
    div.append(
      label,
      element("p", `${job.locations.join("、")} ${job.salary}`),
      link("查看企业投递页面", job.applicationUrl),
    );
    const detail = document.createElement("details");
    detail.append(
      element("summary", "岗位说明"),
      element("pre", job.description),
    );
    div.append(detail);
    $("jobs").append(div);
  }
}
bind(
  "search",
  async () => {
    await search(0);
  },
  "submit",
);
bind("previous", () => search(Math.max(0, offset - 30)), "click", previousDisabled);
bind("next", () => search(offset + 30 < total ? offset + 30 : offset), "click", nextDisabled);
bind("clearSelection", async () => {
  selected.clear();
  selection();
  await search();
});
bind("preview", async () => {
  invalidatePreview();
  const revision = previewRevision;
  const body = {
    versionId: $("version").value,
    deviceId: $("device").value,
    mode: $("mode").value,
    jobIds: [...selected.keys()],
    allowAutomaticFinalSubmit: $("mode").value === "auto",
    allowConsentClick: $("consentClick").checked,
  };
  if (!body.jobIds.length) throw Error("请至少选择一个岗位");
  if (body.mode === "assisted" && body.jobIds.length !== 1)
    throw Error("半自动模式每次选择一个岗位");
  const result = await api("/api/preview", body);
  // 用户修改选择后，旧请求不得恢复已失效的确认入口。
  if (revision !== previewRevision) return;
  preview = {
    ...body,
    idempotencyKey: crypto.randomUUID(),
    confirmedByUser: true,
  };
  $("previewContent").replaceChildren(
    element(
      "h3",
      `${body.mode === "auto" ? "自动" : "半自动"} · ${result.resumeName}`,
    ),
    ...result.jobs.map((j) =>
      element(
        "p",
        `${j.companyName} / ${j.title} · ${j.support.supported ? "支持投递" : "暂不支持此站点，将跳过"}`,
      ),
    ),
  );
  $("submitConsent").checked = false;
  $("previewArea").hidden = false;
});
for (const id of ["mode", "consentClick", "device"])
  $(id).addEventListener("change", invalidatePreview);
bind("start", async () => {
  if (!preview || !$("submitConsent").checked)
    throw Error("请先核对并勾选本次投递确认");
  const submittedPreview = preview;
  const result = await api("/api/attempts", submittedPreview);
  await bridge("RECRUITING_AUTO_APPLY_WAKE", {
    deviceId: submittedPreview.deviceId,
    batchId: result.batchId,
  }).catch((e) => notice(`任务已保存；${e.message}。不要重复创建。`, true));
  if (preview === submittedPreview) invalidatePreview();
  await refreshAttempts();
});
const labels = {
  queued: "排队中",
  running: "运行中",
  preflight: "准备中",
  paused: "已暂停",
  waiting_for_user_action: "等待你处理",
  waiting_for_site_receipt: "等待网站回执",
  succeeded: "投递成功",
  failed: "失败",
  cancelled: "已停止",
  completed: "已完成",
  completed_with_errors: "已结束（含未成功岗位）",
  opening: "打开页面",
  filling: "填写中",
  submitting: "提交中",
  verifying: "核对回执",
  skipped_unsupported_site: "暂不支持该站点",
};
let attemptsSnapshot = null;
let attemptsRequest = 0;
async function refreshAttempts() {
  const request = ++attemptsRequest;
  const attempts = await api("/api/attempts");
  const snapshot = JSON.stringify(attempts);
  // 无变化时保留原控件、用户勾选和焦点；丢弃晚到的旧请求。
  if (request !== attemptsRequest || snapshot === attemptsSnapshot) return;
  $("attempts").replaceChildren();
  for (const attempt of attempts.reverse()) {
    const div = element("div", "", "attempt");
    div.append(
      element(
        "h3",
        `${attempt.mode === "auto" ? "自动" : "半自动"} · ${new Date(attempt.createdAt).toLocaleString("zh-CN")}`,
      ),
    );
    const batch = attempt.batch;
    if (!batch) {
      div.append(
        element(
          "p",
          "任务创建结果不明确，已阻止重复投递，请保留本地数据检查。",
        ),
      );
      $("attempts").append(div);
      continue;
    }
    div.append(element("p", labels[batch.status] || batch.status));
    const path = `/automation/auto-apply/v1/batches/${batch.batchId}`;
    if (["running", "queued"].includes(batch.status))
      div.append(action("暂停批次", () => api(`${path}/pause`, {})));
    if (batch.status === "paused" && batch.pauseReason === "user_requested")
      div.append(action("恢复批次", () => api(`${path}/resume`, {})));
    if (
      !["cancelled", "completed", "completed_with_errors", "failed"].includes(
        batch.status,
      )
    )
      div.append(action("停止批次", () => api(`${path}/cancel`, {})));
    for (const job of batch.jobs) {
      const item = element("div", "", "job");
      item.append(
        element("strong", `${job.companyName} · ${job.title}`),
        element(
          "p",
          `${labels[job.status] || job.status} · ${job.evidence?.diagnostic?.userMessage || job.evidence?.siteConfirmation || job.progress?.message || job.reasonCode || ""}`,
        ),
      );
      if (job.evidence?.pageUrl)
        item.append(link("查看招聘页面", job.evidence.pageUrl));
      const jp = `${path}/jobs/${job.batchJobId}`;
      if (attempt.retryableLoginJobIds?.includes(job.jobId)) {
        const label = element("label", "", "check");
        const consent = document.createElement("input");
        consent.type = "checkbox";
        label.append(consent, document.createTextNode(attempt.mode === "auto"
          ? "我已完成登录，确认用原资料重试此岗位，并重新授权自动最终提交"
          : "我已完成登录，确认用原资料重试此岗位；最终提交仍需另行确认"));
        const retryKey = crypto.randomUUID();
        item.append(label, action("登录完成，重新尝试此岗位", async () => {
          if (!consent.checked) throw Error("请先勾选此岗位的重试确认");
          const next = await api("/api/attempts", {
            idempotencyKey: retryKey, retryOf: attempt.id,
            mode: attempt.mode, deviceId: attempt.deviceId, versionId: attempt.versionId,
            jobIds: [job.jobId], confirmedByUser: true,
            allowAutomaticFinalSubmit: attempt.mode === "auto",
            allowConsentClick: batch.safety.allowConsentClick,
          });
          await bridge("RECRUITING_AUTO_APPLY_WAKE", {
            deviceId: attempt.deviceId, batchId: next.batchId,
          }).catch(() => notice("重试任务已保存在本机，等待插件领取；请勿重复创建。"));
        }));
      }
      if (
        job.status === "waiting_for_user_action" &&
        job.reasonCode === "final_review_required"
      ) {
        item.append(
          element(
            "p",
            finalReviewNotice(job),
          ),
          action("已核对原页面，确认最终投递", () =>
            api(
              `/api/batches/${batch.batchId}/jobs/${job.batchJobId}/confirm`,
              {
                confirmedByUser: true,
                reviewHash: job.evidence?.failureDetails?.reviewHash,
              },
            ),
          ),
        );
      } else if (
        job.status === "waiting_for_user_action" &&
        job.reasonCode === "missing_information"
      ) {
        const form = document.createElement("form");
        const fields = job.evidence?.requiredFieldRequests || [];
        const inputs = [];
        for (const field of fields) {
          const label = element("label", field.question || field.label);
          let input;
          if (field.options?.length) {
            input = document.createElement("select");
            input.append(element("option", ""));
            for (const value of field.options) {
              const o = element("option", value);
              o.value = value;
              input.append(o);
            }
            input.multiple =
              field.inputKind === "multi_select" || field.type === "checkbox";
          } else {
            input = document.createElement("input");
            input.type = "text";
          }
          input.required = true;
          label.append(input);
          form.append(label);
          inputs.push({ field, input });
        }
        if (fields.length) {
          const submit = element("button", "确认补充资料并继续");
          form.append(submit);
          form.onsubmit = async (e) => {
            e.preventDefault();
            submit.disabled = true;
            try {
              await api(`${jp}/required-field-answers`, {
                schemaVersion: "required-field-answers.v1",
                answers: inputs.map(({ field, input }) => ({
                  fieldId: field.fieldId,
                  stableFieldKey: field.stableFieldKey,
                  value: input.multiple
                    ? [...input.selectedOptions].map((x) => x.value)
                    : input.value,
                  source: "user_confirmed",
                  answeredAt: new Date().toISOString(),
                })),
              });
              await refreshAttempts();
            } catch (e) {
              notice(e.message, true);
            } finally {
              submit.disabled = false;
            }
          };
        } else
          form.append(element("p", "缺少可编辑的问题清单，请检查诊断记录。"));
        item.append(form);
      } else if (job.status === "waiting_for_user_action")
        item.append(
          action("已完成登录 / 验证，继续", () => api(`${jp}/resume`, {})),
        );
      div.append(item);
    }
    $("attempts").append(div);
  }
  if (!attempts.length) $("attempts").append(element("p", "还没有投递记录。"));
  attemptsSnapshot = snapshot;
}
bind("refresh", refreshAttempts);
try {
  await status();
  await Promise.all([devices(), resumes(), search(), refreshAttempts()]);
} catch (e) {
  notice(e.message, true);
}
setInterval(() => {
  if (!document.hidden && !$("attempts").contains(document.activeElement))
    refreshAttempts().catch(() => {});
}, 10000);
