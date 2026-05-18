import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, rmSync, readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { createHash } from "node:crypto";
import { deliverDownload, type DownloadAdapterConfig } from "../../src/core/downloads.js";

const HELLO = new TextEncoder().encode("hello-pdf-bytes").buffer;
const HELLO_SHA = createHash("sha256").update(new Uint8Array(HELLO)).digest("hex");

function res(over: Partial<{ data: ArrayBuffer; contentType: string; fileName?: string }> = {}) {
  return {
    data: HELLO,
    contentType: "application/pdf",
    ...over,
  };
}

describe("deliverDownload", () => {
  let dir: string;
  beforeEach(() => { dir = mkdtempSync(join(tmpdir(), "chaindoc-dl-")); });
  afterEach(() => { rmSync(dir, { recursive: true, force: true }); });

  it("disk mode writes the file and returns a sha256 + path", async () => {
    const cfg: DownloadAdapterConfig = { mode: "disk", dir, inlineMaxBytes: 4 * 1024 * 1024 };
    const r = await deliverDownload(cfg, res({ fileName: "doc.pdf" }), { tool: "t" });
    expect(r.kind).toBe("disk");
    if (r.kind !== "disk") throw new Error("type narrow");
    expect(r.path.startsWith(dir)).toBe(true);
    expect(existsSync(r.path)).toBe(true);
    expect(r.sha256).toBe(HELLO_SHA);
    expect(r.contentType).toBe("application/pdf");
    expect(r.sizeBytes).toBe(15);
    expect(new TextDecoder().decode(readFileSync(r.path))).toBe("hello-pdf-bytes");
  });

  it("disk mode synthesizes a filename from contentType when fileName is missing", async () => {
    const cfg: DownloadAdapterConfig = { mode: "disk", dir, inlineMaxBytes: 4 * 1024 * 1024 };
    const r = await deliverDownload(cfg, res(), { tool: "documents_download" });
    if (r.kind !== "disk") throw new Error("type narrow");
    expect(r.path).toMatch(/documents_download-[0-9a-f-]+\.pdf$/);
  });

  it("inline mode returns base64 under the cap", async () => {
    const cfg: DownloadAdapterConfig = { mode: "inline", dir, inlineMaxBytes: 4 * 1024 * 1024 };
    const r = await deliverDownload(cfg, res({ fileName: "doc.pdf" }), { tool: "t" });
    expect(r.kind).toBe("inline");
    if (r.kind !== "inline") throw new Error("type narrow");
    expect(Buffer.from(r.base64, "base64").toString()).toBe("hello-pdf-bytes");
    expect(r.sha256).toBe(HELLO_SHA);
  });

  it("inline mode over the cap throws payload_too_large", async () => {
    const cfg: DownloadAdapterConfig = { mode: "inline", dir, inlineMaxBytes: 4 };
    await expect(deliverDownload(cfg, res(), { tool: "t" })).rejects.toMatchObject({
      status: 413,
      code: "payload_too_large",
    });
  });
});
