import { createMcpExpressApp } from "@modelcontextprotocol/sdk/server/express.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import type { Request, Response } from "express";
import {
  ApplicationService,
  MemoryApplicationRepository
} from "../applications/application-service.js";
import { MemoryDeviceBridge } from "../bridge/browser-bridge.js";
import type { SearchPlan } from "../domain.js";
import { MemoryResumeKnowledgeRepository } from "../resume/resume-knowledge.js";
import { createRecruitingMcpServer } from "./server.js";
import {
  FormFillPlanningService,
  OpenAiCompatibleFormFieldMapper
} from "../applications/form-fill-planner.js";
import {
  DefaultResumeParser,
  MAX_RESUME_BYTES,
  ResumeValidationError,
  resumeKnowledgeFromParseResult
} from "../resume/resume-parser.js";

const resumes = new MemoryResumeKnowledgeRepository();
const applications = new ApplicationService(
  resumes,
  new MemoryApplicationRepository(),
  new MemoryDeviceBridge()
);
const plans = new Map<string, SearchPlan>();
const formFillPlanner = process.env.RECRUITING_MODEL_BASE_URL && process.env.RECRUITING_MODEL_NAME
  ? new FormFillPlanningService(new OpenAiCompatibleFormFieldMapper({
      baseUrl: process.env.RECRUITING_MODEL_BASE_URL,
      model: process.env.RECRUITING_MODEL_NAME,
      apiKey: process.env.RECRUITING_MODEL_API_KEY,
      timeoutMs: Number(process.env.RECRUITING_MODEL_TIMEOUT_MS ?? 30_000)
    }))
  : undefined;
const app = createMcpExpressApp({ host: "127.0.0.1" });
const resumeParser = new DefaultResumeParser({
  mineruApiUrl: process.env.RECRUITING_MINERU_URL,
  timeoutMs: Number(process.env.RECRUITING_MINERU_TIMEOUT_MS ?? 120_000)
});

async function readResumeBody(request: Request): Promise<Buffer> {
  if (Buffer.isBuffer(request.body)) return request.body;
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of request) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    size += buffer.length;
    if (size > MAX_RESUME_BYTES) {
      throw new ResumeValidationError("简历不能超过 15 MiB。", 413);
    }
    chunks.push(buffer);
  }
  return Buffer.concat(chunks);
}

app.get("/health", (_request: Request, response: Response) => {
  response.json({
    status: "ok",
    service: "recruiting-ai-mcp",
    resumeParser: resumeParser.capabilities()
  });
});

app.get("/runtime/v1/resumes/capabilities", (_request: Request, response: Response) => {
  response
    .header("cache-control", "private, no-store")
    .json({
      schemaVersion: "local-resume-parser-capabilities.v1",
      formats: [".pdf", ".docx", ".txt", ".md"],
      maxBytes: MAX_RESUME_BYTES,
      ...resumeParser.capabilities()
    });
});

app.post("/runtime/v1/resumes:parse", async (request: Request, response: Response) => {
  try {
    const encodedFilename = String(request.header("x-resume-filename") ?? "");
    const filename = decodeURIComponent(encodedFilename);
    if (!filename) return response.status(400).json({ error: "缺少简历文件名。" });
    const buffer = await readResumeBody(request);
    const result = await resumeParser.parse({
      filename,
      mediaType: String(request.header("content-type") ?? "application/octet-stream").split(";")[0]!,
      buffer
    });
    const snapshot = resumeKnowledgeFromParseResult(result, { filename });
    await resumes.import(snapshot);
    return response
      .header("cache-control", "private, no-store")
      .json({
        schemaVersion: "local-resume-parse-result.v1",
        result,
        snapshot
      });
  } catch (error) {
    const status = error instanceof ResumeValidationError ? error.statusCode : 422;
    return response
      .status(status)
      .header("cache-control", "private, no-store")
      .json({ error: error instanceof Error ? error.message : "简历解析失败" });
  }
});

app.post("/mcp", async (request: Request, response: Response) => {
  const server = createRecruitingMcpServer({
    resumes,
    applications,
    plans,
    formFillPlanner,
    resumeParser
  });
  const transport = new StreamableHTTPServerTransport({
    sessionIdGenerator: undefined
  });
  try {
    await server.connect(transport);
    await transport.handleRequest(request, response, request.body);
    response.on("close", () => {
      void transport.close();
      void server.close();
    });
  } catch (error) {
    console.error("MCP request failed", error);
    if (!response.headersSent) {
      response.status(500).json({
        jsonrpc: "2.0",
        error: { code: -32603, message: "Internal server error" },
        id: null
      });
    }
  }
});

app.get("/mcp", (_request: Request, response: Response) => {
  response.status(405).json({
    jsonrpc: "2.0",
    error: { code: -32000, message: "Method not allowed in stateless mode" },
    id: null
  });
});

const port = Number(process.env.RECRUITING_MCP_PORT ?? 33330);
app.listen(port, "127.0.0.1", () => {
  console.log(`AI Offer 招聘小助手 MCP listening on http://127.0.0.1:${port}/mcp`);
});
