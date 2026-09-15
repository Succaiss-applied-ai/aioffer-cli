import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import { cp, mkdir, readdir, lstat } from "node:fs/promises";
import { join, resolve } from "node:path";

async function digest(path: string): Promise<string> {
  const hash = createHash("sha256");
  for await (const chunk of createReadStream(path)) hash.update(chunk);
  return hash.digest("hex");
}

/** Copy frozen evidence without parsing candidate content or logging filenames. */
export async function migrateGatewayEvidence(source: string, target: string): Promise<{ files: number; bytes: number }> {
  const sourceRoot = resolve(source); const targetRoot = resolve(target);
  if (sourceRoot === targetRoot || targetRoot.startsWith(sourceRoot + "/")) throw new Error("Evidence target must be separate");
  let files = 0; let bytes = 0;
  const visit = async (relative: string): Promise<void> => {
    let entries;
    try { entries = await readdir(join(sourceRoot, relative), { withFileTypes: true }); }
    catch (error) { if (!relative && (error as NodeJS.ErrnoException).code === "ENOENT") return; throw error; }
    await mkdir(join(targetRoot, relative), { recursive: true });
    for (const entry of entries) {
      const child = join(relative, entry.name);
      if (entry.isDirectory()) { await visit(child); continue; }
      if (!entry.isFile()) throw new Error("Evidence source contains unsupported non-regular file");
      const src = join(sourceRoot, child); const dest = join(targetRoot, child);
      const stat = await lstat(src);
      await cp(src, dest, { force: true, preserveTimestamps: true });
      if (await digest(src) !== await digest(dest)) throw new Error("Evidence hash verification failed");
      files++; bytes += stat.size;
    }
  };
  await visit(""); return { files, bytes };
}
