export interface SiteAdapterMatch {
  adapterCode: string;
  supported: boolean;
  knownNoLogin: boolean;
  reason: string | null;
  supportLevel: "specialized" | "adaptive" | null;
}

interface SiteAdapterDefinition {
  code: string;
  hosts: Set<string>;
  match: (url: URL) => boolean;
  knownNoLogin: boolean;
}

const adapters: SiteAdapterDefinition[] = [
  // Keep the already accepted DeepSeek route first. Existing tasks and hints
  // continue to resolve to the frozen stable adapter.
  {
    code: "moka.deepseek.v1",
    hosts: new Set(["app.mokahr.com"]),
    match: (url) => /^\/social-recruitment\/high-flyer\/140576\/?$/i.test(url.pathname) &&
      /#\/job\/[a-f0-9-]+\/apply(?:\?|$)/i.test(url.hash),
    knownNoLogin: true
  },
  // Moka tenants share the application shell across social and campus
  // recruitment. Tenant-specific field differences are handled by live
  // observation and the family runtime, not by company-name scripts.
  {
    code: "moka.v2",
    hosts: new Set(["app.mokahr.com"]),
    match: (url) => /^\/(?:social|campus)-recruitment\/[^/]+\/[^/]+\/?$/i.test(url.pathname) &&
      /#\/job\/[a-z0-9-]+\/apply(?:\?|$)/i.test(url.hash),
    knownNoLogin: false
  },
  {
    code: "feishu.xiaopeng.v1",
    hosts: new Set(["xiaopeng.jobs.feishu.cn"]),
    match: (url) => /^\/index\/(?:resume\/[^/]+\/applyv?|position\/[^/]+(?:\/applyv?)?)\/?$/i.test(url.pathname),
    knownNoLogin: false
  }
];

export function matchSiteAdapter(applicationUrl: string, adapterHint?: string): SiteAdapterMatch {
  let url: URL;
  try {
    url = new URL(applicationUrl);
  } catch {
    return {
      adapterCode: "",
      supported: false,
      knownNoLogin: false,
      reason: "invalid_application_url",
      supportLevel: null
    };
  }
  if (!/^https?:$/.test(url.protocol)) {
    return {
      adapterCode: "",
      supported: false,
      knownNoLogin: false,
      reason: "unsupported_application_protocol",
      supportLevel: null
    };
  }
  // A hint is an optimization, not a gate. Stale or overly specific upstream
  // metadata must not prevent a valid public application URL from reaching the
  // live observation engine. Try the hinted adapter first, then every mature
  // adapter, and finally the generic visual/DOM runtime.
  const ordered = adapterHint
    ? [
        ...adapters.filter((adapter) => adapter.code === adapterHint),
        ...adapters.filter((adapter) => adapter.code !== adapterHint)
      ]
    : adapters;
  const adapter = ordered.find((candidate) => candidate.hosts.has(url.hostname) && candidate.match(url));
  if (!adapter) {
    return {
      adapterCode: "generic.web.v1",
      supported: true,
      knownNoLogin: false,
      reason: null,
      supportLevel: "adaptive"
    };
  }
  return {
    adapterCode: adapter.code,
    supported: true,
    knownNoLogin: adapter.knownNoLogin,
    reason: null,
    supportLevel: "specialized"
  };
}

export function siteAdapterCapabilities(): Array<Record<string, unknown>> {
  return [
    ...adapters.map((adapter) => ({
    adapterCode: adapter.code,
    hosts: [...adapter.hosts],
    knownNoLogin: adapter.knownNoLogin,
    supportLevel: "specialized"
    })),
    {
      adapterCode: "generic.web.v1",
      hosts: ["*"],
      knownNoLogin: false,
      supportLevel: "adaptive"
    }
  ];
}
