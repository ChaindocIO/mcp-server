import { readFile, realpath, stat } from "node:fs/promises";
import { lookup as dnsLookup } from "node:dns/promises";
import { isIP } from "node:net";
import { FileInputRefusedError } from "../core/errors.js";
import { Buffer } from "node:buffer";
import { z } from "zod";

/**
 * How an agent hands a file to a tool: a path on the MCP host (stdio only), a public URL the server fetches,
 * or base64 inline.
 */
export const FileInputSchema = z.union([
  z.object({
    kind: z.literal("filePath"),
    path: z.string().describe("Absolute path of a regular file on the MCP host. Local stdio server only; refused on the hosted server."),
    name: z.string().optional(),
    mimeType: z.string().describe("e.g. application/pdf, image/png."),
  }),
  z.object({
    kind: z.literal("url"),
    url: z.string().url().describe("Public http(s) URL, fetched once, no redirects. Local stdio server only; refused on the hosted server."),
    name: z.string().optional(),
    mimeType: z.string(),
  }),
  z.object({
    kind: z.literal("inline"),
    name: z.string(),
    mimeType: z.string(),
    base64Content: z.string().describe("Base64-encoded file contents. Works on every transport."),
  }),
]);

export type FileInput = z.infer<typeof FileInputSchema>;

export const MAX_BYTES_PER_FILE = 250 * 1024 * 1024;

export interface ResolvedFile {
  blob: File;
  filename: string;
}

type Lookup = (host: string) => Promise<Array<{ address: string; family: number }>>;

export interface ResolveDeps {
  lookup?: Lookup;
  fetchImpl?: typeof fetch;
  maxBytes?: number;
}

/**
 * Turn a tool's file input into bytes.
 *
 * - `inline` (base64) works everywhere.
 * - `filePath` and `url` work ONLY on the local stdio transport. On the hosted transport the caller is remote:
 *   a path would read (and upload) the server's own files, a URL would reach the server's network (SSRF).
 * - A path is resolved with realpath and must be a regular file. A URL must be http(s), is resolved first and
 *   refused when it points at a loopback, private, link-local, CGNAT or metadata address, and redirects are refused.
 * - The size cap is enforced before reading (stat, Content-Length) and while streaming.
 */
export async function resolveFile(
  file: FileInput,
  transport: "stdio" | "http" = "http",
  deps: ResolveDeps = {},
): Promise<ResolvedFile> {
  const maxBytes = deps.maxBytes ?? MAX_BYTES_PER_FILE;
  switch (file.kind) {
    case "inline": {
      // base64 length bounds the decoded size: refuse before decoding a huge string.
      if (Math.floor((file.base64Content.length * 3) / 4) > maxBytes) throw tooBig(file.name, maxBytes);
      const buf = Buffer.from(file.base64Content, "base64");
      enforceSize(buf.byteLength, file.name, maxBytes);
      return { blob: new File([buf], file.name, { type: file.mimeType }), filename: file.name };
    }
    case "filePath": {
      requireStdio(transport, "filePath");
      let real: string;
      try {
        real = await realpath(file.path);
      } catch {
        throw new FileInputRefusedError(`File path ${file.path} cannot be resolved.`);
      }
      const st = await stat(real);
      if (!st.isFile()) throw new FileInputRefusedError(`${file.path} is not a regular file.`);
      enforceSize(st.size, file.path, maxBytes);
      const buf = await readFile(real);
      enforceSize(buf.byteLength, file.path, maxBytes);
      const filename = file.name ?? real.split("/").pop() ?? "upload";
      return { blob: new File([buf], filename, { type: file.mimeType }), filename };
    }
    case "url": {
      requireStdio(transport, "url");
      const buf = await fetchPublicUrl(file.url, maxBytes, deps);
      const filename = file.name ?? file.url.split("?")[0]!.split("/").pop() ?? "upload";
      return { blob: new File([buf], filename, { type: file.mimeType }), filename };
    }
  }
}

function requireStdio(transport: "stdio" | "http", kind: string): void {
  if (transport !== "stdio") {
    throw new FileInputRefusedError(
      `File input kind '${kind}' is not available on the hosted transport.`,
    );
  }
}

function tooBig(label: string, maxBytes: number): Error {
  return Object.assign(new Error(`File ${label} is larger than the ${maxBytes} byte limit.`), { status: 413 });
}

function enforceSize(bytes: number, label: string, maxBytes: number): void {
  if (bytes > maxBytes) throw tooBig(label, maxBytes);
}

async function fetchPublicUrl(raw: string, maxBytes: number, deps: ResolveDeps): Promise<Buffer> {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new FileInputRefusedError("The URL is not valid.");
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") {
    throw new FileInputRefusedError("Only http(s) URLs are accepted.");
  }
  const host = url.hostname.replace(/^\[|\]$/g, "");
  const lookup: Lookup = deps.lookup ?? ((h) => dnsLookup(h, { all: true }));
  let addrs: Array<{ address: string; family: number }>;
  try {
    addrs = isIP(host) ? [{ address: host, family: isIP(host) }] : await lookup(host);
  } catch {
    throw new FileInputRefusedError(`The host ${host} cannot be resolved.`);
  }
  if (addrs.length === 0) throw new FileInputRefusedError(`The host ${host} cannot be resolved.`);
  for (const a of addrs) {
    if (!isPublicAddress(a.address)) {
      throw new FileInputRefusedError(`The URL points at a non-public address; it is not fetched.`);
    }
  }
  const doFetch = deps.fetchImpl ?? fetch;
  const controller = new AbortController();
  const resp = await doFetch(url, { redirect: "manual", signal: controller.signal });
  if (resp.status >= 300 && resp.status < 400) {
    controller.abort();
    throw new FileInputRefusedError("The URL redirects; redirects are not followed. Give the final URL.");
  }
  if (!resp.ok) {
    controller.abort();
    throw Object.assign(new Error(`Failed to fetch the URL: ${resp.status}`), { status: resp.status });
  }
  const declared = Number(resp.headers.get("content-length") ?? "");
  if (Number.isFinite(declared) && declared > maxBytes) {
    controller.abort();
    throw tooBig(raw, maxBytes);
  }
  if (!resp.body) return Buffer.alloc(0);
  const reader = resp.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > maxBytes) {
      controller.abort();
      await reader.cancel().catch(() => undefined);
      throw tooBig(raw, maxBytes);
    }
    chunks.push(value);
  }
  return Buffer.concat(chunks);
}

/** False for loopback, private, link-local, CGNAT, metadata, multicast, reserved and unspecified addresses. */
export function isPublicAddress(address: string): boolean {
  const v = isIP(address);
  if (v === 4) return isPublicV4(address.split(".").map(Number) as [number, number, number, number]);
  if (v === 6) return isPublicV6(address);
  return false;
}

function isPublicV4([a, b, c]: [number, number, number, number]): boolean {
  if (a === 0 || a === 10 || a === 127) return false;
  if (a === 100 && b >= 64 && b <= 127) return false; // CGNAT
  if (a === 169 && b === 254) return false; // link-local, cloud metadata
  if (a === 172 && b >= 16 && b <= 31) return false;
  if (a === 192 && b === 0 && (c === 0 || c === 2)) return false;
  if (a === 192 && b === 168) return false;
  if (a === 198 && (b === 18 || b === 19)) return false;
  if (a === 198 && b === 51 && c === 100) return false;
  if (a === 203 && b === 0 && c === 113) return false;
  if (a >= 224) return false; // multicast, reserved, broadcast
  return true;
}

function isPublicV6(address: string): boolean {
  const lower = address.toLowerCase().split("%")[0]!;
  const mapped = lower.match(/^(?:0*:)*:?ffff:(\d+\.\d+\.\d+\.\d+)$/) ?? lower.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/);
  if (mapped) return isPublicAddress(mapped[1]!);
  const words = expandV6(lower);
  if (words === undefined) return false;
  const w0 = words[0]!;
  if (words.every((w) => w === 0)) return false; // ::
  if (words.slice(0, 7).every((w) => w === 0) && words[7] === 1) return false; // ::1
  if (words.slice(0, 5).every((w) => w === 0) && words[5] === 0xffff) {
    return isPublicV4([words[6]! >> 8, words[6]! & 255, words[7]! >> 8, words[7]! & 255]);
  }
  if ((w0 & 0xfe00) === 0xfc00) return false; // fc00::/7 unique local (fd00::/8)
  if ((w0 & 0xffc0) === 0xfe80) return false; // fe80::/10 link-local
  if ((w0 & 0xff00) === 0xff00) return false; // multicast
  if (w0 === 0x64 && words[1] === 0xff9b) return false; // NAT64
  if (w0 === 0x2001 && words[1] === 0x0db8) return false; // documentation
  return true;
}

function expandV6(addr: string): number[] | undefined {
  let tail: number[] = [];
  let a = addr;
  const v4 = a.match(/(\d+\.\d+\.\d+\.\d+)$/);
  if (v4) {
    const p = v4[1]!.split(".").map(Number);
    tail = [(p[0]! << 8) | p[1]!, (p[2]! << 8) | p[3]!];
    a = a.slice(0, -v4[1]!.length) + "0:0";
  }
  const halves = a.split("::");
  if (halves.length > 2) return undefined;
  const parse = (h: string) => (h === "" ? [] : h.split(":").map((x) => parseInt(x, 16)));
  const head = parse(halves[0]!);
  const rest = halves.length === 2 ? parse(halves[1]!) : [];
  const fill = 8 - head.length - rest.length;
  if (halves.length === 1 ? head.length !== 8 : fill < 0) return undefined;
  const out = halves.length === 2 ? [...head, ...Array<number>(fill).fill(0), ...rest] : head;
  if (tail.length > 0) {
    out[6] = tail[0]!;
    out[7] = tail[1]!;
  }
  return out.some((n) => Number.isNaN(n)) ? undefined : out;
}
