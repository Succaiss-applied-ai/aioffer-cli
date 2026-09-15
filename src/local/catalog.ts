import { readFile } from "node:fs/promises";
import { gunzipSync } from "node:zlib";
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
) {
  const terms = query.toLowerCase().trim().split(/\s+/).filter(Boolean);
  const items = catalog.items.filter(
    (x) =>
      (!city || x.locations.some((c) => c.includes(city))) &&
      terms.every((t) =>
        `${x.title} ${x.companyName} ${x.description}`
          .toLowerCase()
          .includes(t),
      ),
  );
  return {
    total: items.length,
    snapshotTotal: catalog.total,
    exportedAt: catalog.exportedAt,
    items: items.slice(offset, offset + limit),
  };
}
