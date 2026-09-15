import { mkdtemp, mkdir, readFile, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { migrateGatewayEvidence } from "./migrate-evidence.js";
let temp: string;
afterEach(async () => { if (temp) await rm(temp, { recursive: true, force: true }); });
describe("shared evidence cutover", () => {
  it("copies nested evidence bytes and can resume the same frozen source", async () => {
    temp = await mkdtemp(join(tmpdir(), "gateway-evidence-"));
    const source = join(temp, "source"); const target = join(temp, "target");
    await mkdir(join(source, "nested"), { recursive: true });
    await writeFile(join(source, "nested", "image.bin"), Buffer.from([0, 1, 2, 255]));
    expect(await migrateGatewayEvidence(source, target)).toEqual({ files: 1, bytes: 4 });
    expect(await readFile(join(target, "nested", "image.bin"))).toEqual(Buffer.from([0, 1, 2, 255]));
    expect(await migrateGatewayEvidence(source, target)).toEqual({ files: 1, bytes: 4 });
  });
  it("refuses symlinks and destinations nested in the source", async () => {
    temp = await mkdtemp(join(tmpdir(), "gateway-evidence-"));
    await symlink("/etc/passwd", join(temp, "link"));
    await expect(migrateGatewayEvidence(temp, join(temp, "target"))).rejects.toThrow("separate");
    await expect(migrateGatewayEvidence(temp, temp + "-target")).rejects.toThrow("non-regular");
    await rm(temp + "-target", { recursive: true, force: true });
  });
});
