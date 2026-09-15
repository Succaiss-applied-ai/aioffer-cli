#!/usr/bin/env node
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { createRecruitingMcpServer } from "./server.js";
import {
  FormFillPlanningService,
  OpenAiCompatibleFormFieldMapper
} from "../applications/form-fill-planner.js";

const formFillPlanner = process.env.RECRUITING_MODEL_BASE_URL && process.env.RECRUITING_MODEL_NAME
  ? new FormFillPlanningService(new OpenAiCompatibleFormFieldMapper({
      baseUrl: process.env.RECRUITING_MODEL_BASE_URL,
      model: process.env.RECRUITING_MODEL_NAME,
      apiKey: process.env.RECRUITING_MODEL_API_KEY,
      timeoutMs: Number(process.env.RECRUITING_MODEL_TIMEOUT_MS ?? 30_000)
    }))
  : undefined;
const server = createRecruitingMcpServer({ formFillPlanner });
await server.connect(new StdioServerTransport());
console.error("AI Offer 招聘小助手 MCP 0.5.0 running over stdio");
