import { readFile } from "node:fs/promises";
import { Buffer } from "node:buffer";
import { z } from "zod";
import { defineTool, type ToolDefinition } from "./types.js";

/**
 * Media API — POST /media/upload (multipart, field 'media').
 *
 * Up to 10 files per request, max 250 MB per file. Three input modes:
 *   - filePath: local file on the MCP host (stdio transport only)
 *   - url:      publicly fetchable URL (server fetches on the user's behalf)
 *   - inline:   base64-encoded contents
 */

const FileInputSchema = z.union([
  z.object({
    kind: z.literal("filePath"),
    path: z.string().describe("Absolute path on the MCP server host."),
    name: z.string().optional(),
    mimeType: z
      .string()
      .describe("e.g. application/pdf, image/png, video/mp4."),
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

const UploadInputSchema = z.object({
  files: z.array(FileInputSchema).min(1).max(10),
});

type UploadInput = z.infer<typeof UploadInputSchema>;

const MAX_BYTES_PER_FILE = 250 * 1024 * 1024;

async function toBlob(file: UploadInput["files"][number]): Promise<File | Blob> {
  switch (file.kind) {
    case "filePath": {
      const buf = await readFile(file.path);
      enforceSize(buf.byteLength, file.path);
      return new File([buf], file.name ?? file.path.split("/").pop() ?? "upload", {
        type: file.mimeType,
      });
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
      return new File([buf], file.name ?? file.url.split("/").pop() ?? "upload", {
        type: file.mimeType,
      });
    }
    case "inline": {
      const buf = Buffer.from(file.base64Content, "base64");
      enforceSize(buf.byteLength, file.name);
      return new File([buf], file.name, { type: file.mimeType });
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

export const mediaUpload: ToolDefinition<UploadInput> = defineTool({
  name: "chaindoc_media_upload",
  description:
    "Upload up to 10 files (PDF/DOC/XLS/PPT/TXT/JPG/PNG/GIF/WEBP/SVG/MP4/AVI/MOV/WMV) " +
    "to Chaindoc temporary storage. Returns media handles you pass to chaindoc_documents_create. " +
    "Max 250 MB per file. Provide each file as filePath, url, or base64 inline.",
  inputSchema: UploadInputSchema,
  async handler(args, { client }) {
    const blobs = await Promise.all(args.files.map(toBlob));
    return client.run("chaindoc_media_upload", (sdk) => sdk.media.upload(blobs));
  },
});

export const mediaTools: ToolDefinition<unknown>[] = [
  mediaUpload as ToolDefinition<unknown>,
];
