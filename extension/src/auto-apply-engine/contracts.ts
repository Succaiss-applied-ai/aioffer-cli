export type ApplicationEngineCode = "legacy" | "layered_v2" | "shadow_v2";

export type ApplicationAccessHint = "public" | "login_required" | "unknown";

export interface ApplicationEngine<TCommand, TCredential, TResult> {
  readonly code: ApplicationEngineCode;
  execute(command: TCommand, credential: TCredential): Promise<TResult>;
}

export interface ApplicationEngineRoute {
  requested: ApplicationEngineCode;
  selected: ApplicationEngineCode;
  fellBack: boolean;
  fallbackReason: string | null;
}

function stringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value.map((entry) => String(entry).trim()).filter(Boolean)
    : [];
}

/**
 * AI Offer's tag is an advisory preflight hint. A live page observation always
 * remains authoritative because sessions expire and recruiting routes change.
 */
export function applicationAccessHintFromTags(value: unknown): ApplicationAccessHint {
  const tags = new Set(stringArray(value).map((tag) => tag.toLowerCase()));
  // Fail safe when conflicting tags are accidentally sent.
  if (tags.has("application_access:login_required")) return "login_required";
  if (tags.has("application_access:public")) return "public";
  return "unknown";
}

export function requestedApplicationEngineFromPayload(payload: unknown): ApplicationEngineCode {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) return "legacy";
  const runtimePolicy = (payload as Record<string, unknown>).runtimePolicy;
  if (!runtimePolicy || typeof runtimePolicy !== "object" || Array.isArray(runtimePolicy)) return "legacy";
  const engine = String((runtimePolicy as Record<string, unknown>).engine ?? "");
  return engine === "layered_v2" || engine === "shadow_v2" ? engine : "legacy";
}
