import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { randomUUID, createHash } from "node:crypto";
import { Buffer } from "node:buffer";

export type DownloadAdapterMode = "auto" | "disk" | "inline";

export interface DownloadAdapterConfig {
  mode: DownloadAdapterMode;
  dir: string;
  inlineMaxBytes: number;
}

export interface DownloadResult {
  data: ArrayBuffer;
  contentType: string;
  fileName?: string;
}

export interface DiskResult {
  kind: "disk";
  path: string;
  contentType: string;
  fileName?: string;
  sizeBytes: number;
  sha256: string;
}

export interface InlineResult {
  kind: "inline";
  base64: string;
  contentType: string;
  fileName?: string;
  sizeBytes: number;
  sha256: string;
}

const EXT_BY_CONTENT_TYPE: Record<string, string> = {
  "application/pdf": "pdf",
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/gif": "gif",
  "image/webp": "webp",
  "image/svg+xml": "svg",
  "text/html": "html",
  "text/plain": "txt",
  "application/json": "json",
  "application/octet-stream": "bin",
};

function inferExt(contentType: string, suggested?: string): string {
  if (suggested) return suggested.replace(/^\./, "");
  const base = contentType.split(";")[0]?.trim().toLowerCase() ?? "";
  return EXT_BY_CONTENT_TYPE[base] ?? "bin";
}

export async function deliverDownload(
  cfg: DownloadAdapterConfig,
  res: DownloadResult,
  hint: { tool: string; suggestedExt?: string },
): Promise<DiskResult | InlineResult> {
  const bytes = new Uint8Array(res.data);
  const sizeBytes = bytes.byteLength;
  const sha256 = createHash("sha256").update(bytes).digest("hex");
  const mode = cfg.mode === "auto" ? "disk" : cfg.mode;

  if (mode === "inline") {
    if (sizeBytes > cfg.inlineMaxBytes) {
      throw Object.assign(
        new Error(
          `Download is ${sizeBytes} bytes; inline cap is ${cfg.inlineMaxBytes}. ` +
            `Raise CHAINDOC_INLINE_DOWNLOAD_MAX_BYTES or run the MCP server on stdio to land the file on disk.`,
        ),
        { status: 413, code: "payload_too_large" },
      );
    }
    const out: InlineResult = {
      kind: "inline",
      base64: Buffer.from(bytes).toString("base64"),
      contentType: res.contentType,
      sizeBytes,
      sha256,
    };
    if (res.fileName !== undefined) out.fileName = res.fileName;
    return out;
  }

  await mkdir(cfg.dir, { recursive: true, mode: 0o700 });
  const ext = inferExt(res.contentType, hint.suggestedExt);
  const fileName = res.fileName ?? `${hint.tool}-${randomUUID()}.${ext}`;
  const filePath = join(cfg.dir, fileName);
  await writeFile(filePath, bytes, { mode: 0o600 });
  const out: DiskResult = {
    kind: "disk",
    path: filePath,
    contentType: res.contentType,
    sizeBytes,
    sha256,
  };
  if (res.fileName !== undefined) out.fileName = res.fileName;
  return out;
}
