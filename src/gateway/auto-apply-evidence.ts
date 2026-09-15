import { GatewayRequestError } from "./gateway-errors.js";
import { createHash, randomUUID } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";

export interface AutoApplyEvidenceReceipt {
  evidenceRef: string;
  sha256: string;
  mediaType: "image/jpeg" | "image/png";
  size: number;
  storedAt: string;
  expiresAt: string;
}

export class AutoApplyEvidenceStore {
  private readonly memory = new Map<string, Buffer>();
  private activeSaves = 0;

  constructor(
    private readonly directory?: string,
    private readonly now: () => Date = () => new Date(),
    private readonly retentionMs = 7 * 24 * 60 * 60_000
  ) {}

  mode(): "json_file" | "memory" {
    return this.directory ? "json_file" : "memory";
  }

  async saveRedactedScreenshot(dataUrl: string): Promise<AutoApplyEvidenceReceipt> {
    if (this.activeSaves >= 4) throw new GatewayRequestError("GATEWAY_BUSY", "截图保存繁忙，请稍后重试", 503, true);
    this.activeSaves++;
    try { return await this.save(dataUrl); } finally { this.activeSaves--; }
  }

  private async save(dataUrl: string): Promise<AutoApplyEvidenceReceipt> {
    const match = /^data:(image\/(?:jpeg|png));base64,([a-z0-9+/=]+)$/i.exec(dataUrl);
    if (!match) throw new Error("脱敏截图必须是 JPEG 或 PNG Data URL");
    const mediaType = match[1]!.toLowerCase() as "image/jpeg" | "image/png";
    const bytes = Buffer.from(match[2]!, "base64");
    if (!bytes.length || bytes.length > 5 * 1024 * 1024) throw new Error("脱敏截图大小无效或超过 5MB");
    const evidenceId = randomUUID();
    const extension = mediaType === "image/png" ? "png" : "jpg";
    const evidenceRef = `evidence:${evidenceId}`;
    if (this.directory) {
      await mkdir(this.directory, { recursive: true });
      await writeFile(join(this.directory, `${evidenceId}.${extension}`), bytes, { mode: 0o600 });
    } else {
      this.memory.set(evidenceRef, bytes);
    }
    const storedAt = this.now();
    return {
      evidenceRef,
      sha256: createHash("sha256").update(bytes).digest("hex"),
      mediaType,
      size: bytes.length,
      storedAt: storedAt.toISOString(),
      expiresAt: new Date(storedAt.getTime() + this.retentionMs).toISOString()
    };
  }
}
