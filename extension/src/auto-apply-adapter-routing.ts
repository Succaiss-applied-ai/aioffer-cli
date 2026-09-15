import { isXiaopengApplicationUrl } from "./auto-apply-navigation.js";

export interface AutoApplyAdapterResolution {
  adapterCode: string;
  requestedAdapterCode: string;
  supported: boolean;
  fallbackApplied: boolean;
  reason: "invalid_application_url" | "unsupported_application_protocol" | null;
}

function parseWebApplicationUrl(value: string): URL | null {
  try {
    const url = new URL(value);
    return /^https?:$/.test(url.protocol) ? url : null;
  } catch {
    return null;
  }
}

function isDeepSeekMokaApplicationUrl(value: string): boolean {
  const url = parseWebApplicationUrl(value);
  if (!url) return false;
  if (["127.0.0.1", "localhost"].includes(url.hostname) &&
    url.pathname === "/__recruiting_ai_test__/moka") return true;
  return url.hostname === "app.mokahr.com" &&
    /^\/social-recruitment\/high-flyer\/140576\/?$/i.test(url.pathname) &&
    /#\/job\/[a-f0-9-]+\/apply(?:\?|$)/i.test(url.hash);
}

function isMokaFamilyApplicationUrl(value: string): boolean {
  const url = parseWebApplicationUrl(value);
  if (!url) return false;
  if (["127.0.0.1", "localhost"].includes(url.hostname) &&
    url.pathname === "/__recruiting_ai_test__/moka") return true;
  return url.hostname === "app.mokahr.com" &&
    /^\/(?:social|campus)-recruitment\/[^/]+\/[^/]+\/?$/i.test(url.pathname) &&
    /#\/job\/[a-z0-9-]+(?:\/apply)?(?:\?|$)/i.test(url.hash);
}

const specializedAdapters = [
  { code: "moka.deepseek.v1", match: isDeepSeekMokaApplicationUrl },
  { code: "moka.v2", match: isMokaFamilyApplicationUrl },
  { code: "feishu.xiaopeng.v1", match: isXiaopengApplicationUrl }
] as const;

/**
 * Resolve the runtime adapter from the actual application URL. The adapter
 * carried by an older Gateway or persisted batch is only a preference; it may
 * never turn a valid HTTP(S) application URL into an unsupported-site result.
 */
export function resolveAutoApplyAdapter(
  applicationUrl: string,
  requestedAdapterCode: string
): AutoApplyAdapterResolution {
  let parsed: URL;
  try {
    parsed = new URL(applicationUrl);
  } catch {
    return {
      adapterCode: "",
      requestedAdapterCode,
      supported: false,
      fallbackApplied: false,
      reason: "invalid_application_url"
    };
  }
  if (!/^https?:$/.test(parsed.protocol)) {
    return {
      adapterCode: "",
      requestedAdapterCode,
      supported: false,
      fallbackApplied: false,
      reason: "unsupported_application_protocol"
    };
  }

  const detected = specializedAdapters.find((adapter) => adapter.match(applicationUrl));
  const adapterCode = detected?.code ?? "generic.web.v1";
  return {
    adapterCode,
    requestedAdapterCode,
    supported: true,
    fallbackApplied: adapterCode !== requestedAdapterCode,
    reason: null
  };
}
