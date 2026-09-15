import { parseResumeFileInBrowser, type BrowserResumeInput } from "./resume-local.js";

chrome.runtime.onMessage.addListener((message: unknown, _sender, respond) => {
  const input = message as { type?: string; file?: BrowserResumeInput };
  if (input.type !== "RESUME_PARSE_OFFSCREEN" || !input.file) return false;
  parseResumeFileInBrowser(input.file)
    .then((result) => respond({ ok: true, result }))
    .catch((error: unknown) => respond({
      ok: false,
      error: error instanceof Error ? error.message : "浏览器本地简历解析失败"
    }));
  return true;
});
