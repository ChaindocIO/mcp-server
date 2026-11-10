import { z } from "zod";
import { defineTool, type ToolDefinition } from "./types.js";
import { FileInputSchema, resolveFile } from "./file-input.js";

/**
 * Files.
 *
 *   POST /api/v1/media/upload   (temporary upload; only for a saved-signature image)
 *   POST /api/v1/media/chunked  (resumable upload into the workspace's Storage)
 *
 * A document's file goes through Storage and conversion, never through `media/upload`.
 */

const UploadInputSchema = z.object({
  files: z.array(FileInputSchema).min(1).max(10),
});

type UploadInput = z.infer<typeof UploadInputSchema>;

export const mediaUpload: ToolDefinition<UploadInput> = defineTool({
  name: "chaindoc_media_upload",
  description:
    "Upload up to 10 images to Chaindoc temporary storage. Use it ONLY for a saved-signature image: " +
    "pass the returned media handle to chaindoc_signatures_create_signature. " +
    "Do not use it for documents: a document's file goes through chaindoc_storage_upload_file or " +
    "chaindoc_documents_create_from_file (it is converted into a text document). Max 250 MB per file.",
  inputSchema: UploadInputSchema,
  async handler(args, { client, transport }) {
    const files = await Promise.all(args.files.map((f) => resolveFile(f, transport)));
    return client.run("chaindoc_media_upload", (sdk) =>
      sdk.media.upload(files.map((f) => f.blob)),
    );
  },
});

const StorageUploadSchema = z.object({ file: FileInputSchema });

export const storageUploadFile: ToolDefinition<z.infer<typeof StorageUploadSchema>> = defineTool({
  name: "chaindoc_storage_upload_file",
  description:
    "Upload one file (PDF, DOCX, ...) into the workspace's Storage with a resumable chunked upload. " +
    "Returns { storageFileId }. Use that id with chaindoc_documents_create_from_storage, or as `storageFileId` " +
    "of chaindoc_documents_update. Counts against the workspace storage limit (STORAGE_LIMIT_REACHED). " +
    "To make a document straight from a file, use chaindoc_documents_create_from_file instead.",
  inputSchema: StorageUploadSchema,
  async handler(args, { client, transport }) {
    const { blob, filename } = await resolveFile(args.file, transport);
    return client.run("chaindoc_storage_upload_file", (sdk) =>
      sdk.media.uploadChunked(blob, { filename }),
    );
  },
});

export const mediaTools: ToolDefinition<unknown>[] = [
  mediaUpload as ToolDefinition<unknown>,
  storageUploadFile as ToolDefinition<unknown>,
];
