import { readFile } from "node:fs/promises";
import { Buffer } from "node:buffer";
import { z } from "zod";

/**
 * How an agent hands a file to a tool: a path on the MCP host (stdio only), a public URL the server fetches,
 * or base64 inline.
 */
export const FileInputSchema = z.union([
  z.object({
    kind: z.literal("filePath"),
    path: z.string().describe("Absolute path on the MCP server host."),
    name: z.string().optional(),
    mimeType: z.string().describe("e.g. application/pdf, image/png."),
  }),
  z.object({
    kind: z.literal("url"),
    url: z.string().url(),
    name: z.string().optional(),
    mimeType: z.string(),
  }),
  z.object({
    kind: z.literal("inline"),
    name: z.string(),
    mimeType: z.string(),
    base64Content: z.string().describe("Base64-encoded file contents."),
  }),
]);

export type FileInput = z.infer<typeof FileInputSchema>;

export const MAX_BYTES_PER_FILE = 250 * 1024 * 1024;

export interface ResolvedFile {
  blob: File;
  filename: string;
}

export async function resolveFile(file: FileInput): Promise<ResolvedFile> {
  switch (file.kind) {
    case "filePath": {
      const buf = await readFile(file.path);
      enforceSize(buf.byteLength, file.path);
      const filename = file.name ?? file.path.split("/").pop() ?? "upload";
      return { blob: new File([buf], filename, { type: file.mimeType }), filename };
    }
    case "url": {
      const resp = await fetch(file.url);
      if (!resp.ok) {
        throw Object.assign(new Error(`Failed to fetch ${file.url}: ${resp.status}`), {
          status: resp.status,
        });
      }
      const buf = Buffer.from(await resp.arrayBuffer());
      enforceSize(buf.byteLength, file.url);
      const filename = file.name ?? file.url.split("/").pop() ?? "upload";
      return { blob: new File([buf], filename, { type: file.mimeType }), filename };
    }
    case "inline": {
      const buf = Buffer.from(file.base64Content, "base64");
      enforceSize(buf.byteLength, file.name);
      return { blob: new File([buf], file.name, { type: file.mimeType }), filename: file.name };
    }
  }
}

function enforceSize(bytes: number, label: string): void {
  if (bytes > MAX_BYTES_PER_FILE) {
    throw Object.assign(
      new Error(`File ${label} is ${bytes} bytes; Chaindoc max is ${MAX_BYTES_PER_FILE}.`),
      { status: 413 },
    );
  }
}
