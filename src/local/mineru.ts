import { unzipSync, strFromU8 } from "fflate";
import { setTimeout as delay } from "node:timers/promises";
import { randomUUID } from "node:crypto";

// Presigned object-storage links are transport, not an additional user-configured service.
function storageUrl(value: unknown): string {
  const url = new URL(String(value));
  if (
    url.protocol !== "https:" ||
    url.username ||
    url.password ||
    !/(^|\.)(mineru\.net|openxlab\.org\.cn|aliyuncs\.com|myqcloud\.com)$/.test(
      url.hostname,
    )
  )
    throw new Error("MinerU 返回了不受信任的文件地址");
  return url.toString();
}
async function boundedBytes(response: Response, maximum: number) {
  if (!response.ok) throw new Error(`MinerU 文件 HTTP ${response.status}`);
  if (Number(response.headers.get("content-length")) > maximum)
    throw new Error("MinerU 结果超过大小限制");
  const reader = response.body!.getReader();
  const parts: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const part = await reader.read();
      if (part.done) break;
      size += part.value.length;
      if (size > maximum) throw new Error("MinerU 结果超过大小限制");
      parts.push(part.value);
    }
  } finally {
    await reader.cancel();
  }
  return Buffer.concat(parts);
}
export async function parseMineru(
  bytes: Uint8Array,
  name: string,
  key: string,
  fetcher: typeof fetch = fetch,
  pollMs = 1500,
): Promise<string> {
  if (!key.trim()) throw new Error("请先配置 MinerU API Key");
  if (bytes.length > 20 * 1024 * 1024) throw new Error("本地简历限制为 20 MB");
  const signal = AbortSignal.timeout(300_000);
  const api = async (path: string, body?: unknown) => {
    const r = await fetcher(`https://mineru.net/api/v4${path}`, {
      method: body ? "POST" : "GET",
      headers: {
        authorization: `Bearer ${key}`,
        "content-type": "application/json",
      },
      ...(body ? { body: JSON.stringify(body) } : {}),
      signal,
      redirect: "error",
    });
    if (!r.ok)
      throw new Error(`MinerU HTTP ${r.status}；请检查 Key、额度和网络`);
    const data = (await r.json()) as any;
    if (data.code !== 0) throw new Error(`MinerU 错误代码 ${data.code}`);
    return data.data;
  };
  const id = randomUUID();
  const batch = await api("/file-urls/batch", {
    files: [{ name, data_id: id }],
    model_version: "vlm",
  });
  const uploaded = await fetcher(storageUrl(batch.file_urls?.[0]), {
    method: "PUT",
    body: Buffer.from(bytes),
    signal,
    redirect: "error",
  });
  if (!uploaded.ok) throw new Error(`MinerU 上传 HTTP ${uploaded.status}`);
  while (!signal.aborted) {
    const result = await api(
      `/extract-results/batch/${encodeURIComponent(batch.batch_id)}`,
    );
    const file =
      result.extract_result?.find((x: any) => x.data_id === id) ??
      result.extract_result?.[0];
    if (file?.state === "failed")
      throw new Error(
        "MinerU 解析失败；请检查原文件或在 MinerU 控制台查看任务",
      );
    if (file?.state === "done") {
      const zip = await boundedBytes(
        await fetcher(storageUrl(file.full_zip_url), {
          signal,
          redirect: "error",
        }),
        30 * 1024 * 1024,
      );
      // Never extract paths to disk. Bound inflated size and read only Markdown.
      const extracted = unzipSync(zip, {
        filter: (entry) =>
          /(^|\/)full\.md$/.test(entry.name) && entry.originalSize <= 2_000_000,
      });
      const markdown = Object.values(extracted)[0];
      if (!markdown) throw new Error("MinerU 结果缺少 full.md 或结果过大");
      return strFromU8(markdown);
    }
    await delay(pollMs, undefined, { signal });
  }
  throw new Error("MinerU 解析超时");
}
