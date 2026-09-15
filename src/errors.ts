export type RecruitingErrorStage =
  | "configuration"
  | "search"
  | "resume"
  | "login"
  | "form_observation"
  | "missing_information"
  | "form_fill"
  | "review"
  | "approval"
  | "submission"
  | "cloud_sync"
  | "transport"
  | "unknown";

export type RecruitingErrorCode =
  | "INVALID_INPUT"
  | "SEARCH_PLAN_NOT_FOUND"
  | "RESUME_NOT_FOUND"
  | "RESUME_NOT_APPROVED"
  | "JOB_INACTIVE"
  | "LOGIN_REQUIRED"
  | "FORM_NOT_OBSERVED"
  | "MISSING_INFORMATION"
  | "FORM_FILL_NOT_READY"
  | "FORM_FILL_VALIDATION_FAILED"
  | "SITE_VALIDATION_BLOCKED"
  | "REVIEW_NOT_READY"
  | "APPROVAL_INVALID"
  | "APPROVAL_EXPIRED"
  | "SUBMISSION_RESULT_UNKNOWN"
  | "MODEL_ROUTE_NOT_CONFIGURED"
  | "MODEL_NOT_CONFIGURED"
  | "MODEL_MODALITY_UNSUPPORTED"
  | "MODEL_PROVIDER_NOT_CONNECTED"
  | "MODEL_AUTH_FAILED"
  | "MODEL_RATE_LIMITED"
  | "MODEL_UNAVAILABLE"
  | "MODEL_RESPONSE_INVALID"
  | "WEB_SEARCH_NOT_CONFIGURED"
  | "CLOUD_SYNC_NOT_CONFIGURED"
  | "CLOUD_SYNC_AUTH_FAILED"
  | "CLOUD_SYNC_UNAVAILABLE"
  | "REVISION_CONFLICT"
  | "SHARED_DATA_CONTAINS_PII"
  | "CLOUD_KNOWLEDGE_UNAVAILABLE"
  | "DEVICE_BRIDGE_OFFLINE"
  | "TRANSPORT_FAILED"
  | "INTERNAL_ERROR";

export interface PublicRecruitingError {
  code: RecruitingErrorCode;
  stage: RecruitingErrorStage;
  message: string;
  retryable: boolean;
  userAction: string;
  details?: Record<string, unknown>;
}

export class RecruitingError extends Error {
  constructor(
    readonly publicError: PublicRecruitingError,
    options?: ErrorOptions
  ) {
    super(publicError.message, options);
    this.name = "RecruitingError";
  }
}

interface ErrorRule {
  pattern: RegExp;
  error: Omit<PublicRecruitingError, "message">;
}

const rules: ErrorRule[] = [
  {
    pattern: /检索计划不存在/,
    error: {
      code: "SEARCH_PLAN_NOT_FOUND",
      stage: "search",
      retryable: false,
      userAction: "重新创建岗位检索范围。"
    }
  },
  {
    pattern: /简历知识不存在/,
    error: {
      code: "RESUME_NOT_FOUND",
      stage: "resume",
      retryable: false,
      userAction: "重新导入并选择一份简历。"
    }
  },
  {
    pattern: /简历知识尚未由用户确认/,
    error: {
      code: "RESUME_NOT_APPROVED",
      stage: "resume",
      retryable: false,
      userAction: "先确认润色后的简历版本。"
    }
  },
  {
    pattern: /岗位已失效/,
    error: {
      code: "JOB_INACTIVE",
      stage: "search",
      retryable: false,
      userAction: "移除失效岗位并重新选择。"
    }
  },
  {
    pattern: /仍有缺失信息|缺失信息不存在/,
    error: {
      code: "MISSING_INFORMATION",
      stage: "missing_information",
      retryable: false,
      userAction: "补充页面列出的必填信息后继续。"
    }
  },
  {
    pattern: /尚未读取真实表单/,
    error: {
      code: "FORM_NOT_OBSERVED",
      stage: "form_observation",
      retryable: true,
      userAction: "保持招聘页面打开；若要求登录，请先完成登录。"
    }
  },
  {
    pattern: /尚未准备填表|不在填表状态/,
    error: {
      code: "FORM_FILL_NOT_READY",
      stage: "form_fill",
      retryable: true,
      userAction: "重新读取当前招聘表单后再尝试。"
    }
  },
  {
    pattern: /读回校验/,
    error: {
      code: "FORM_FILL_VALIDATION_FAILED",
      stage: "form_fill",
      retryable: true,
      userAction: "查看失败字段，修正后重新填表。"
    }
  },
  {
    pattern: /批次尚未准备确认/,
    error: {
      code: "REVIEW_NOT_READY",
      stage: "review",
      retryable: true,
      userAction: "等待所有岗位完成填表校验。"
    }
  },
  {
    pattern: /授权已过期/,
    error: {
      code: "APPROVAL_EXPIRED",
      stage: "approval",
      retryable: false,
      userAction: "重新查看投递预览并确认。"
    }
  },
  {
    pattern: /没有有效授权|授权失效|内容已变化/,
    error: {
      code: "APPROVAL_INVALID",
      stage: "approval",
      retryable: false,
      userAction: "重新查看最新投递内容并确认。"
    }
  },
  {
    pattern: /未配置模型路由/,
    error: {
      code: "MODEL_ROUTE_NOT_CONFIGURED",
      stage: "configuration",
      retryable: false,
      userAction: "在模型配置中为该场景选择模型。"
    }
  },
  {
    pattern: /模型不存在|缺少模型服务地址/,
    error: {
      code: "MODEL_NOT_CONFIGURED",
      stage: "configuration",
      retryable: false,
      userAction: "填写服务地址和模型名称后保存。"
    }
  },
  {
    pattern: /不支持图片输入/,
    error: {
      code: "MODEL_MODALITY_UNSUPPORTED",
      stage: "configuration",
      retryable: false,
      userAction: "为图文场景选择支持图片输入的模型。"
    }
  },
  {
    pattern: /模型提供方尚未接入/,
    error: {
      code: "MODEL_PROVIDER_NOT_CONNECTED",
      stage: "configuration",
      retryable: false,
      userAction: "启用 OpenAI-compatible 调用器或接入统一模型网关。"
    }
  },
  {
    pattern: /本地 Web Search|WEB Search 工具|联网检索工具/,
    error: {
      code: "WEB_SEARCH_NOT_CONFIGURED",
      stage: "search",
      retryable: false,
      userAction: "为本地 Recruiting Runtime 配置 Web Search/Fetch 工具，或启用模型提供方的原生联网检索。"
    }
  },
  {
    pattern: /云同步尚未配置/,
    error: {
      code: "CLOUD_SYNC_NOT_CONFIGURED",
      stage: "cloud_sync",
      retryable: false,
      userAction: "配置云端数据同步地址和访问令牌；模型 API 配置无需改变。"
    }
  },
  {
    pattern: /云同步.*(?:401|403)|云同步鉴权失败/,
    error: {
      code: "CLOUD_SYNC_AUTH_FAILED",
      stage: "cloud_sync",
      retryable: false,
      userAction: "检查云同步令牌、租户和设备绑定。"
    }
  },
  {
    pattern: /共享数据.*(?:个人信息|PII)/,
    error: {
      code: "SHARED_DATA_CONTAINS_PII",
      stage: "cloud_sync",
      retryable: false,
      userAction: "移除候选人答案、简历正文、文件内容和身份信息后再回传。"
    }
  },
  {
    pattern: /revision.*冲突|版本冲突/i,
    error: {
      code: "REVISION_CONFLICT",
      stage: "cloud_sync",
      retryable: true,
      userAction: "拉取云端最新版本，在本地重新核验后提交新增量。"
    }
  },
  {
    pattern: /共享岗位知识库|持久化回执|云同步不可用/,
    error: {
      code: "CLOUD_SYNC_UNAVAILABLE",
      stage: "cloud_sync",
      retryable: true,
      userAction: "检查云同步服务连接；本地检索结果可暂存，但不得声称已写入共享知识库。"
    }
  }
];

export function toPublicError(
  error: unknown,
  fallback: Partial<PublicRecruitingError> = {}
): PublicRecruitingError {
  if (error instanceof RecruitingError) return error.publicError;
  const message = error instanceof Error ? error.message : String(error);
  const matched = rules.find((rule) => rule.pattern.test(message));
  if (matched) return { ...matched.error, message };
  return {
    code: fallback.code ?? "INTERNAL_ERROR",
    stage: fallback.stage ?? "unknown",
    message: fallback.message ?? message ?? "发生未知错误",
    retryable: fallback.retryable ?? false,
    userAction: fallback.userAction ?? "复制错误码并联系技术支持。",
    ...(fallback.details ? { details: fallback.details } : {})
  };
}

export function modelHttpError(status: number, message: string): RecruitingError {
  if (status === 401 || status === 403) {
    return new RecruitingError({
      code: "MODEL_AUTH_FAILED",
      stage: "configuration",
      message,
      retryable: false,
      userAction: "检查 API Key、网关令牌或服务端权限。",
      details: { status }
    });
  }
  if (status === 429) {
    return new RecruitingError({
      code: "MODEL_RATE_LIMITED",
      stage: "transport",
      message,
      retryable: true,
      userAction: "稍后重试或检查模型服务额度。",
      details: { status }
    });
  }
  return new RecruitingError({
    code: "MODEL_UNAVAILABLE",
    stage: "transport",
    message,
    retryable: status >= 500,
    userAction: "检查模型服务地址、服务状态和模型名称。",
    details: { status }
  });
}
