import { describe, expect, it } from "vitest";
import { deflateRawSync } from "node:zlib";
import {
  DefaultResumeParser,
  buildProfileDraft,
  extractDocxText,
  resumeKnowledgeFromParseResult,
  validateResumeInput
} from "./resume-parser.js";

function tinyDocx(xml: string): Buffer {
  const name = Buffer.from("word/document.xml");
  const content = Buffer.from(xml);
  const compressed = deflateRawSync(content);
  const local = Buffer.alloc(30);
  local.writeUInt32LE(0x04034b50, 0);
  local.writeUInt16LE(8, 8);
  local.writeUInt32LE(compressed.length, 18);
  local.writeUInt32LE(content.length, 22);
  local.writeUInt16LE(name.length, 26);
  const central = Buffer.alloc(46);
  central.writeUInt32LE(0x02014b50, 0);
  central.writeUInt16LE(8, 10);
  central.writeUInt32LE(compressed.length, 20);
  central.writeUInt32LE(content.length, 24);
  central.writeUInt16LE(name.length, 28);
  central.writeUInt32LE(0, 42);
  const centralOffset = local.length + name.length + compressed.length;
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(1, 8);
  end.writeUInt16LE(1, 10);
  end.writeUInt32LE(central.length + name.length, 12);
  end.writeUInt32LE(centralOffset, 16);
  return Buffer.concat([local, name, compressed, central, name, end]);
}

describe("local resume parser", () => {
  it("extracts multiple work and project experiences", () => {
    const draft = buildProfileDraft(`
林测试
邮箱：lin@example.com
手机：13800000000
工作经历
甲科技｜后端工程师
2022.01 – 2023.06
负责 Python 服务。
乙科技｜平台工程师
2023.07 – 2025.06
负责 Kubernetes 平台。
项目经历
项目一｜负责人
2023.01 – 2023.06
使用 FastAPI 和 Redis。
项目二｜后端开发
2024.01 – 2024.08
使用 PostgreSQL。
    `);
    expect(draft.workExperiences).toHaveLength(2);
    expect(draft.projectExperiences).toHaveLength(2);
    expect(draft.skills).toEqual(expect.arrayContaining(["Python", "Kubernetes", "FastAPI", "Redis", "PostgreSQL"]));
  });

  it("extracts DOCX locally without uploading it to a model", () => {
    const buffer = tinyDocx("<w:document><w:body><w:p><w:r><w:t>林测试</w:t></w:r></w:p><w:p><w:r><w:t>Python 后端工程师</w:t></w:r></w:p></w:body></w:document>");
    expect(validateResumeInput({ filename: "resume.docx", mediaType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document", buffer })).toBe("docx");
    expect(extractDocxText(buffer)).toContain("Python 后端工程师");
  });

  it("uses MinerU for PDFs and creates directly usable local knowledge", async () => {
    const parser = new DefaultResumeParser({
      mineruApiUrl: "http://127.0.0.1:8000",
      fetcher: async () => new Response(JSON.stringify({ data: { markdown: "姓名：林测试\n邮箱：lin@example.com\n技能 Python FastAPI" } }), { status: 200 })
    });
    const result = await parser.parse({
      filename: "resume.pdf",
      mediaType: "application/pdf",
      buffer: Buffer.from("%PDF-1.7\n")
    });
    const snapshot = resumeKnowledgeFromParseResult(result, {
      filename: "resume.pdf",
      now: new Date("2026-08-06T00:00:00Z")
    });
    expect(result.parser).toBe("mineru-pipeline");
    expect(snapshot.userApproved).toBe(true);
    expect(snapshot.sections).toEqual(expect.arrayContaining([
      expect.objectContaining({ kind: "basic" }),
      expect.objectContaining({ kind: "skill" })
    ]));
  });
});
