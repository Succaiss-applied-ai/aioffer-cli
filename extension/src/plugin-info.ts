export interface RecruitingAiPluginInfoResponse {
  ok: true;
  version: string;
  buildCommit: string;
}

declare const __RECRUITING_AI_BUILD_COMMIT__: string | undefined;

/**
 * Purely local, read-only plugin metadata. This must never depend on device
 * pairing, Gateway reachability, or mutable extension state.
 */
export function recruitingAiPluginInfo(): RecruitingAiPluginInfoResponse {
  return {
    ok: true,
    version: String(chrome.runtime.getManifest().version ?? ""),
    buildCommit: typeof __RECRUITING_AI_BUILD_COMMIT__ === "string"
      ? __RECRUITING_AI_BUILD_COMMIT__
      : "development"
  };
}
