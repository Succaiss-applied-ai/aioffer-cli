import { readFile } from "node:fs/promises";
import { gunzipSync } from "node:zlib";
import { jobCapability, companyCoverage, type CapabilityFilter } from "./job-capability.js";
export interface LocalJob {
  jobId: string;
  companyName: string;
  title: string;
  locations: string[];
  applicationUrl: string;
  description: string;
  channel: string;
  tags: string[];
  salary: string;
  verifiedAt: string | null;
  sourceJobId?: string;
  availability?: "active" | "unavailable";
  loginRequirement?: {
    status: "required" | "not_required" | "unknown";
    scope: string;
    verificationMethod: string;
    verifiedAt: string;
    evidenceUrl: string;
  };
  deliveryEvidence?: { successfulOn: string; latestStatus: string; latestOn: string };

}
export interface Catalog {
  total: number;
  exportedAt: string;
  items: LocalJob[];
}
export async function loadCatalog(path: string): Promise<Catalog> {
  const raw = await readFile(path);
  const catalog = JSON.parse(gunzipSync(raw).toString("utf8")) as Catalog;
  if (
    catalog.total !== catalog.items.length ||
    new Set(catalog.items.map((x) => x.jobId)).size !== catalog.total
  )
    throw new Error("岗位快照不完整");
  return catalog;
}
export function searchCatalog(
  catalog: Catalog,
  query: string,
  city = "",
  offset = 0,
  limit = 30,
  capability: CapabilityFilter = "all",
) {
  const terms = query.toLowerCase().trim().split(/\s+/).filter(Boolean);
  const candidates = catalog.items.map(x => ({ ...x, capability: jobCapability(x) }));
  const counts = { auto: 0, assisted: 0, unverified: 0, unavailable: 0 };
  for (const x of candidates) counts[x.capability.kind]++;
  const items = candidates.filter(
    (x) =>
      (capability === "all" || (capability === "actionable" ? x.capability.allowedModes.length > 0 : x.capability.kind === capability)) &&
      (!city || x.locations.some((c) => c.includes(city))) &&
      terms.every((t) =>
        `${x.title} ${x.companyName} ${x.description}`
          .toLowerCase()
          .includes(t),
      ),
  );
  return {
    total: items.length,
    capabilityCounts: counts,
    companyCounts: companyCoverage(catalog.items).counts,
    snapshotTotal: catalog.total,
    exportedAt: catalog.exportedAt,
    items: items.slice(offset, offset + limit),
  };
}
