import { describe, it, expect, vi } from "vitest";
import { mkdtempSync, writeFileSync, symlinkSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { resolveFile, isPublicAddress } from "../../src/tools/file-input.js";
import { FileInputRefusedError, toChaindocMcpError } from "../../src/core/errors.js";

const pub = async () => [{ address: "93.184.216.34", family: 4 }];
const urlFile = (url: string) => ({ kind: "url" as const, url, mimeType: "application/pdf" });

function streamOf(chunks: Uint8Array[], headers: Record<string, string> = {}, status = 200): Response {
  let i = 0;
  const body = new ReadableStream<Uint8Array>({
    pull(c) {
      if (i < chunks.length) c.enqueue(chunks[i++]!);
      else c.close();
    },
  });
  return new Response(body, { status, headers });
}

describe("file input is safe", () => {
  it("filePath is refused on the hosted transport, nothing read", async () => {
    await expect(
      resolveFile({ kind: "filePath", path: "/etc/hosts", mimeType: "text/plain" }, "http"),
    ).rejects.toMatchObject({ name: "FileInputRefusedError" });
    // default (no transport given) is the restrictive one
    await expect(
      resolveFile({ kind: "filePath", path: "/etc/hosts", mimeType: "text/plain" }),
    ).rejects.toMatchObject({ name: "FileInputRefusedError" });
  });

  it("url is refused on the hosted transport, nothing fetched", async () => {
    const fetchImpl = vi.fn();
    await expect(resolveFile(urlFile("https://example.com/a.pdf"), "http", { lookup: pub, fetchImpl })).rejects.toMatchObject({
      name: "FileInputRefusedError",
    });
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("base64 stays allowed on both transports", async () => {
    const f = { kind: "inline" as const, name: "a.pdf", mimeType: "application/pdf", base64Content: "AAAA" };
    expect((await resolveFile(f, "http")).blob.size).toBe(3);
    expect((await resolveFile(f, "stdio")).blob.size).toBe(3);
  });

  it("the refusal is a typed result with a hint", () => {
    const e = toChaindocMcpError(new FileInputRefusedError("nope"));
    expect(e.code).toBe("file_input_refused");
    expect(e.hint).toContain("inline");
  });

  it("filePath on stdio reads a regular file and refuses a directory", async () => {
    const dir = mkdtempSync(join(tmpdir(), "mcp-fi-"));
    writeFileSync(join(dir, "a.txt"), "hello");
    const ok = await resolveFile({ kind: "filePath", path: join(dir, "a.txt"), mimeType: "text/plain" }, "stdio");
    expect(ok.blob.size).toBe(5);
    mkdirSync(join(dir, "sub"));
    await expect(resolveFile({ kind: "filePath", path: join(dir, "sub"), mimeType: "x/y" }, "stdio")).rejects.toMatchObject({
      name: "FileInputRefusedError",
    });
    await expect(resolveFile({ kind: "filePath", path: join(dir, "missing"), mimeType: "x/y" }, "stdio")).rejects.toMatchObject({
      name: "FileInputRefusedError",
    });
  });

  it("filePath resolves symlinks and still refuses a non-regular target", async () => {
    const dir = mkdtempSync(join(tmpdir(), "mcp-fi-"));
    mkdirSync(join(dir, "d"));
    symlinkSync(join(dir, "d"), join(dir, "link"));
    await expect(resolveFile({ kind: "filePath", path: join(dir, "link"), mimeType: "x/y" }, "stdio")).rejects.toMatchObject({
      name: "FileInputRefusedError",
    });
  });

  it("filePath refuses a file over the cap before reading it", async () => {
    const dir = mkdtempSync(join(tmpdir(), "mcp-fi-"));
    writeFileSync(join(dir, "big"), "0123456789");
    await expect(
      resolveFile({ kind: "filePath", path: join(dir, "big"), mimeType: "x/y" }, "stdio", { maxBytes: 5 }),
    ).rejects.toMatchObject({ status: 413 });
  });

  it.each([
    "http://127.0.0.1/a", "http://localhost/a", "http://10.0.0.5/a", "http://169.254.169.254/latest/meta-data",
    "http://100.64.0.1/a", "http://192.168.1.1/a", "http://172.16.0.1/a", "http://[::1]/a", "http://[fd00::1]/a",
    "http://[fe80::1]/a", "http://[::ffff:127.0.0.1]/a",
  ])("private address %s is refused on stdio, not fetched", async (u) => {
    const fetchImpl = vi.fn();
    const lookup = async (h: string) => (h === "localhost" ? [{ address: "127.0.0.1", family: 4 }] : [{ address: h, family: 4 }]);
    await expect(resolveFile(urlFile(u), "stdio", { lookup, fetchImpl })).rejects.toMatchObject({ name: "FileInputRefusedError" });
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("a name that resolves to a private address is refused (checked before the fetch)", async () => {
    const fetchImpl = vi.fn();
    const lookup = async () => [{ address: "93.184.216.34", family: 4 }, { address: "10.1.2.3", family: 4 }];
    await expect(resolveFile(urlFile("https://evil.example.com/a"), "stdio", { lookup, fetchImpl })).rejects.toMatchObject({
      name: "FileInputRefusedError",
    });
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("only http(s) is accepted", async () => {
    await expect(resolveFile(urlFile("file:///etc/passwd"), "stdio", { lookup: pub })).rejects.toMatchObject({ name: "FileInputRefusedError" });
    await expect(resolveFile(urlFile("ftp://example.com/a"), "stdio", { lookup: pub })).rejects.toMatchObject({ name: "FileInputRefusedError" });
  });

  it("a redirect is refused, not followed", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(new Response(null, { status: 302, headers: { location: "http://169.254.169.254/" } }));
    await expect(resolveFile(urlFile("https://example.com/a"), "stdio", { lookup: pub, fetchImpl })).rejects.toMatchObject({
      name: "FileInputRefusedError",
    });
    expect(fetchImpl.mock.calls[0]![1]).toMatchObject({ redirect: "manual" });
  });

  it("an oversize Content-Length is refused before the body is read", async () => {
    const read = vi.fn();
    const resp = { status: 200, ok: true, headers: new Headers({ "content-length": "1000" }), body: { getReader: read } };
    const fetchImpl = vi.fn().mockResolvedValue(resp);
    await expect(resolveFile(urlFile("https://example.com/a"), "stdio", { lookup: pub, fetchImpl, maxBytes: 100 })).rejects.toMatchObject({
      status: 413,
    });
    expect(read).not.toHaveBeenCalled();
  });

  it("an oversize stream (no Content-Length) is aborted as soon as the cap is passed", async () => {
    let pulled = 0;
    const body = new ReadableStream<Uint8Array>({
      pull(c) {
        pulled++;
        c.enqueue(new Uint8Array(40));
        if (pulled > 50) c.close();
      },
    });
    const fetchImpl = vi.fn().mockResolvedValue(new Response(body));
    await expect(resolveFile(urlFile("https://example.com/a"), "stdio", { lookup: pub, fetchImpl, maxBytes: 100 })).rejects.toMatchObject({
      status: 413,
    });
    expect(pulled).toBeLessThan(10);
  });

  it("a public URL within the cap is fetched", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(streamOf([new Uint8Array([1, 2, 3])]));
    const out = await resolveFile(urlFile("https://example.com/doc.pdf"), "stdio", { lookup: pub, fetchImpl });
    expect(out.blob.size).toBe(3);
    expect(out.filename).toBe("doc.pdf");
  });

  it("address classes", () => {
    for (const a of ["93.184.216.34", "8.8.8.8", "2606:4700:4700::1111"]) expect(isPublicAddress(a), a).toBe(true);
    for (const a of ["0.0.0.0", "255.255.255.255", "::", "224.0.0.1", "198.18.0.1", "not-an-ip"]) expect(isPublicAddress(a), a).toBe(false);
  });
});
