export type BrowserResumeParserName = "pdfjs-local" | "docx-local" | "plain-text";

export interface BrowserResumeParseResult {
  parser: BrowserResumeParserName;
  extractedText: string;
  warnings: string[];
}

export interface BrowserResumeInput {
  name: string;
  type: string;
  base64: string;
}

function bytesFromBase64(base64: string): Uint8Array {
  const binary = atob(base64.includes(",") ? base64.slice(base64.indexOf(",") + 1) : base64);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
  return bytes;
}

function normalizedExtension(name: string): string {
  return name.toLowerCase().match(/\.([a-z0-9]+)$/)?.[1] ?? "";
}

function findEndOfCentralDirectory(bytes: Uint8Array): number {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const minimum = Math.max(0, bytes.length - 65_557);
  for (let offset = bytes.length - 22; offset >= minimum; offset -= 1) {
    if (view.getUint32(offset, true) === 0x06054b50) return offset;
  }
  throw new Error("DOCX 压缩目录损坏");
}

async function inflateRaw(bytes: Uint8Array): Promise<Uint8Array> {
  const stream = new Blob([bytes.slice().buffer as ArrayBuffer])
    .stream().pipeThrough(new DecompressionStream("deflate-raw"));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

async function docxEntries(bytes: Uint8Array): Promise<Array<{ name: string; content: Uint8Array }>> {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const decoder = new TextDecoder();
  const end = findEndOfCentralDirectory(bytes);
  const total = view.getUint16(end + 10, true);
  let offset = view.getUint32(end + 16, true);
  const result: Array<{ name: string; content: Uint8Array }> = [];

  for (let index = 0; index < total; index += 1) {
    if (view.getUint32(offset, true) !== 0x02014b50) break;
    const method = view.getUint16(offset + 10, true);
    const compressedSize = view.getUint32(offset + 20, true);
    const nameLength = view.getUint16(offset + 28, true);
    const extraLength = view.getUint16(offset + 30, true);
    const commentLength = view.getUint16(offset + 32, true);
    const localOffset = view.getUint32(offset + 42, true);
    const name = decoder.decode(bytes.subarray(offset + 46, offset + 46 + nameLength));

    if (/^word\/(?:document|header\d+|footer\d+)\.xml$/.test(name)) {
      if (view.getUint32(localOffset, true) !== 0x04034b50) throw new Error("DOCX 本地文件头损坏");
      const localNameLength = view.getUint16(localOffset + 26, true);
      const localExtraLength = view.getUint16(localOffset + 28, true);
      const dataOffset = localOffset + 30 + localNameLength + localExtraLength;
      const compressed = bytes.slice(dataOffset, dataOffset + compressedSize);
      const content = method === 0 ? compressed : method === 8 ? await inflateRaw(compressed) : null;
      if (!content) throw new Error(`DOCX 使用了不支持的压缩方式：${method}`);
      result.push({ name, content });
    }
    offset += 46 + nameLength + extraLength + commentLength;
  }
  return result;
}

function decodeWordXml(bytes: Uint8Array): string {
  const xml = new TextDecoder("utf-8", { fatal: false }).decode(bytes);
  return xml
    .replace(/<w:tab\s*\/>/g, "\t")
    .replace(/<w:br\s*\/>/g, "\n")
    .replace(/<\/w:tc>/g, "\t")
    .replace(/<\/w:tr>/g, "\n")
    .replace(/<\/w:p>/g, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"').replace(/&apos;/g, "'")
    .replace(/[ \t]+$/gm, "").replace(/\n{3,}/g, "\n\n").trim();
}

async function extractDocxText(bytes: Uint8Array): Promise<string> {
  const entries = await docxEntries(bytes);
  const document = entries.find((entry) => entry.name === "word/document.xml");
  if (!document) throw new Error("DOCX 中缺少正文内容");
  return entries.map((entry) => decodeWordXml(entry.content)).filter(Boolean).join("\n").trim();
}

interface PdfTextItem {
  str?: string;
  width?: number;
  height?: number;
  transform?: number[];
}

function pdfItemsToText(items: unknown[]): string {
  const positioned = items.flatMap((raw) => {
    const item = raw as PdfTextItem;
    const transform = Array.isArray(item.transform) ? item.transform : [];
    if (typeof item.str !== "string" || !item.str.trim() ||
      !Number.isFinite(transform[4]) || !Number.isFinite(transform[5])) return [];
    return [{
      text: item.str,
      x: Number(transform[4]),
      y: Number(transform[5]),
      width: Number.isFinite(item.width) ? Number(item.width) : 0,
      height: Number.isFinite(item.height) && Number(item.height) > 0 ? Number(item.height) : 12
    }];
  }).sort((left, right) => right.y - left.y || left.x - right.x);
  if (!positioned.length) return "";

  const lines: typeof positioned[] = [];
  for (const item of positioned) {
    const line = lines.at(-1);
    const anchor = line?.[0];
    const tolerance = Math.max(anchor?.height ?? item.height, item.height) * 0.5;
    if (!line || !anchor || Math.abs(item.y - anchor.y) > tolerance) lines.push([item]);
    else line.push(item);
  }

  return lines.map((line) => {
    line.sort((left, right) => left.x - right.x);
    let value = "";
    let previousEnd: number | null = null;
    let previousHeight = 0;
    for (const item of line) {
      if (value && previousEnd !== null && item.x - previousEnd > Math.max(item.height, previousHeight) * 0.25) {
        value += " ";
      }
      value += item.text;
      previousEnd = item.x + item.width;
      previousHeight = item.height;
    }
    return value.trim();
  }).filter(Boolean).join("\n");
}

async function extractPdfText(bytes: Uint8Array): Promise<string> {
  const pdfjs = await import("pdfjs-dist/build/pdf.mjs");
  pdfjs.GlobalWorkerOptions.workerSrc = chrome.runtime.getURL("pdf.worker.min.mjs");
  const pdf = await pdfjs.getDocument({ data: bytes }).promise;
  const pages: string[] = [];
  for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
    const page = await pdf.getPage(pageNumber);
    pages.push(pdfItemsToText((await page.getTextContent()).items));
  }
  return pages.filter(Boolean).join("\n").trim();
}

export async function parseResumeFileInBrowser(input: BrowserResumeInput): Promise<BrowserResumeParseResult> {
  const extension = normalizedExtension(input.name);
  const bytes = bytesFromBase64(input.base64);
  if (!bytes.length) throw new Error("简历文件为空");
  if (bytes.length > 15 * 1024 * 1024) throw new Error("简历不能超过 15 MiB");

  if (extension === "pdf") {
    if (new TextDecoder("ascii").decode(bytes.subarray(0, 5)) !== "%PDF-") throw new Error("PDF 文件内容无效");
    const extractedText = await extractPdfText(bytes);
    if (!extractedText) throw new Error("该 PDF 可能是扫描件，未检测到可复制文字");
    return {
      parser: "pdfjs-local",
      extractedText,
      warnings: ["PDF 已在浏览器本地提取文字；扫描件或复杂双栏排版请在投递前核对。"]
    };
  }
  if (extension === "docx") {
    const extractedText = await extractDocxText(bytes);
    if (!extractedText) throw new Error("Word 文件中没有可识别的文字");
    return {
      parser: "docx-local",
      extractedText,
      warnings: ["DOCX 已在浏览器本地提取文字；文本框和复杂表格请在投递前核对。"]
    };
  }
  if (["txt", "md", "markdown"].includes(extension)) {
    const extractedText = new TextDecoder("utf-8", { fatal: false }).decode(bytes).trim();
    if (!extractedText) throw new Error("文本简历中没有可识别的内容");
    return { parser: "plain-text", extractedText, warnings: [] };
  }
  if (extension === "doc") throw new Error("暂不支持旧版 .doc，请另存为 .docx 后上传");
  throw new Error("仅支持 PDF、DOCX、TXT 和 Markdown 简历");
}
