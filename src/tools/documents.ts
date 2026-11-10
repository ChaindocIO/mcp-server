import { z } from "zod";
import { defineTool, type ToolDefinition } from "./types.js";
import type { DocumentContent } from "@chaindoc_io/server-sdk";
import { deliverDownload } from "../core/downloads.js";
import {
  AccessEmailSchema,
  AccessTypeSchema,
  DocumentContentSchema,
  MetaTagSchema,
} from "./schemas.js";
import { FileInputSchema, resolveFile } from "./file-input.js";

/**
 * Documents API
 *   POST   /api/v1/documents                       (text from `content`; a file answers 202 with a conversion)
 *   POST   /api/v1/documents/from-storage          (a Storage file -> conversion)
 *   PUT    /api/v1/documents/:documentId           (next version from `content` or a Storage file)
 *   GET    /api/v1/documents/:documentId/content   (text, roles, fields)
 *   POST   /api/v1/documents/:documentId/conversion
 *   POST   /api/v1/documents/:documentId/signature-block
 *   PUT    /api/v1/documents/:documentId/rights
 *   POST   /api/v1/documents/verify
 *   GET    /api/v1/documents/versions/:versionId/verification
 *
 * A document is a TEXT with chips (fields and signer places are chips in the text). A person's file is
 * converted into such a text through Storage; the API never signs a file as it is.
 */

const StatusSchema = z.enum(["draft", "published"]);

const CreateInputSchema = z.object({
  name: z.string().min(1).max(200),
  description: z.string().max(2000).optional(),
  status: StatusSchema.describe(
    "'draft' keeps it editable. 'published' queues the version for blockchain anchoring and cannot be undone.",
  ),
  content: DocumentContentSchema,
  hashtags: z.array(z.string()).max(20).optional(),
  meta: z.array(MetaTagSchema).optional(),
  accessType: AccessTypeSchema.optional(),
  accessEmails: z.array(AccessEmailSchema).optional(),
  idempotencyKey: z
    .string()
    .optional()
    .describe("Reuse the same key to retry safely: the same key answers the same document."),
}).strict();

const FromFileInputSchema = z.object({
  file: FileInputSchema,
  name: z.string().min(1).max(200),
  description: z.string().max(2000).optional(),
  hashtags: z.array(z.string()).max(20).optional(),
  accessType: AccessTypeSchema.optional(),
  accessEmails: z.array(AccessEmailSchema).optional(),
  idempotencyKey: z.string().optional(),
});

const FromStorageInputSchema = z.object({
  storageFileId: z.string().min(1).describe("From chaindoc_storage_upload_file."),
  name: z.string().min(1).max(200),
  description: z.string().max(2000).optional(),
  hashtags: z.array(z.string()).max(20).optional(),
  accessType: AccessTypeSchema.optional(),
  accessEmails: z.array(AccessEmailSchema).optional(),
  idempotencyKey: z.string().optional(),
});

const UpdateInputSchema = z
  .object({
    documentId: z.string().uuid(),
    name: z.string().min(1).max(200),
    description: z.string().max(2000).optional(),
    status: StatusSchema,
    content: DocumentContentSchema.optional(),
    baseVersionId: z
      .string()
      .uuid()
      .optional()
      .describe("With `content`: the version you read the text from (else 409 DOCUMENT_WRITING_BASE_MOVED)."),
    storageFileId: z.string().min(1).optional().describe("A READY Storage file; it is converted (202)."),
    hashtags: z.array(z.string()).max(20).optional(),
    meta: z.array(MetaTagSchema).optional(),
    idempotencyKey: z.string().optional(),
  })
  .strict()
  .superRefine((v, ctx) => {
    const hasContent = v.content !== undefined;
    const hasFile = v.storageFileId !== undefined;
    if (hasContent === hasFile) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Give exactly one of `content` or `storageFileId`." });
    }
    if (hasContent && v.baseVersionId === undefined) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: "`content` needs `baseVersionId` (the version you read)." });
    }
    if (hasFile && v.status !== "draft") {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: "A version made from a file lands as a draft: status must be 'draft'." });
    }
  });

const RightsInputSchema = z.object({
  documentId: z.string().uuid(),
  accessType: AccessTypeSchema,
  accessEmails: z.array(AccessEmailSchema).optional(),
});

const VerifyInputSchema = z.object({
  versionHash: z.string().regex(/^0x[0-9a-fA-F]+$/, "expected 0x-prefixed hex"),
  certificateHash: z
    .string()
    .regex(/^0x[0-9a-fA-F]+$/, "expected 0x-prefixed hex")
    .optional(),
});

const VerificationStatusInputSchema = z.object({ versionId: z.string().uuid() });

export const documentsCreate = defineTool({
  name: "chaindoc_documents_create",
  description:
    "Create a TEXT document directly from `content` (engine content v2; fields and signer places are chips in " +
    "the text, a 'template' mode text holds the signer roles). Answers 201 with the made document. " +
    "To make a document from a person's file use chaindoc_documents_create_from_file instead (it is converted). " +
    "Prefer status='draft'; 'published' queues blockchain anchoring and cannot be undone.",
  inputSchema: CreateInputSchema,
  handler: (args, { client }) =>
    client.run("chaindoc_documents_create", (sdk) => {
      const { content, ...rest } = args;
      return sdk.documents.create({ ...rest, content: content as DocumentContent });
    }),
});

export const documentsCreateFromFile = defineTool({
  name: "chaindoc_documents_create_from_file",
  description:
    "Turn a person's file (PDF, DOCX, ...) into a text document: uploads it to Storage and starts the conversion. " +
    "Answers 202 with { conversion: { id, status: 'converting' } } - NOT a document yet. The document is made as a " +
    "DRAFT when the conversion is ready: call chaindoc_conversions_wait with the id, then use the returned documentId " +
    "and versionId. Uses the workspace AI budget and storage (AI_LIMIT_REACHED, STORAGE_LIMIT_REACHED refuse before " +
    "anything is spent). The converted text has no signature places yet: add them with chaindoc_documents_add_signature_block.",
  inputSchema: FromFileInputSchema,
  handler: async (args, { client }) => {
    const { file, ...params } = args;
    const { blob, filename } = await resolveFile(file);
    return client.run("chaindoc_documents_create_from_file", (sdk) =>
      sdk.documents.createFromFile(blob, params, { filename }),
    );
  },
});

export const documentsCreateFromStorage = defineTool({
  name: "chaindoc_documents_create_from_storage",
  description:
    "Start converting a file already in Storage (storageFileId from chaindoc_storage_upload_file) into a draft text " +
    "document. Answers 202 with a conversion: wait for it with chaindoc_conversions_wait. The original stays in Storage.",
  inputSchema: FromStorageInputSchema,
  handler: (args, { client }) =>
    client.run("chaindoc_documents_create_from_storage", (sdk) => sdk.documents.createFromStorage(args)),
});

export const documentsUpdate = defineTool({
  name: "chaindoc_documents_update",
  description:
    "Make the NEXT VERSION of a document (previous versions are preserved for audit). Give exactly one of: " +
    "`content` + `baseVersionId` (the version you read; answers 200, 409 DOCUMENT_WRITING_BASE_MOVED if the document " +
    "moved) or `storageFileId` (a Storage file, converted asynchronously: answers 202 with a conversion, wait with " +
    "chaindoc_conversions_wait). A file document made before documents became text cannot be edited: convert it first " +
    "(chaindoc_documents_convert).",
  inputSchema: UpdateInputSchema,
  handler: (args, { client }) => {
    const { documentId, content, storageFileId, baseVersionId, ...common } = args;
    if (content !== undefined && baseVersionId !== undefined) {
      return client.run("chaindoc_documents_update", (sdk) =>
        sdk.documents.update(documentId, { ...common, content: content as DocumentContent, baseVersionId }),
      );
    }
    if (storageFileId !== undefined) {
      return client.run("chaindoc_documents_update", (sdk) =>
        sdk.documents.update(documentId, { ...common, storageFileId, status: "draft" }),
      );
    }
    throw new Error("chaindoc_documents_update: give `content` + `baseVersionId`, or `storageFileId`.");
  },
});

export const documentsGetContent = defineTool({
  name: "chaindoc_documents_get_content",
  description:
    "Read a version's text with its signer `roles` (what `recipients[].role` of chaindoc_signatures_create_request binds to) " +
    "and `fields`. Defaults to the current version; the answer names the versionId to send. A version that is a file " +
    "holds no text: DOCUMENT_FILE_CONVERTS - convert it with chaindoc_documents_convert.",
  inputSchema: z.object({ documentId: z.string().uuid(), versionId: z.string().uuid().optional() }),
  handler: (args, { client }) =>
    client.run("chaindoc_documents_get_content", (sdk) =>
      sdk.documents.getContent(args.documentId, args.versionId !== undefined ? { versionId: args.versionId } : undefined),
    ),
});

export const documentsConvert = defineTool({
  name: "chaindoc_documents_convert",
  description:
    "Convert a FILE document (made before documents became text; chaindoc_documents_get shows format='file', " +
    "sendable=false) into its next version as text. Answers 202 with a conversion: wait with chaindoc_conversions_wait. " +
    "The old version, its signature requests and verification stay untouched. Uses the workspace AI budget.",
  inputSchema: z.object({ documentId: z.string().uuid(), idempotencyKey: z.string().optional() }),
  handler: (args, { client }) =>
    client.run("chaindoc_documents_convert", (sdk) =>
      sdk.documents.convert(
        args.documentId,
        args.idempotencyKey !== undefined ? { idempotencyKey: args.idempotencyKey } : undefined,
      ),
    ),
});

export const documentsAddSignatureBlock = defineTool({
  name: "chaindoc_documents_add_signature_block",
  description:
    "Add signer roles with their Signature and Date-signed chips at the end of the text (makes the next version). " +
    "A converted file has no signature places until you do this. Then send with chaindoc_signatures_create_request, " +
    "one recipient per role. A role the text already holds is SIGNATURE_ROLE_TWICE.",
  inputSchema: z.object({
    documentId: z.string().uuid(),
    roles: z
      .array(z.object({ key: z.string().min(1).describe("e.g. 'client' - what recipients[].role names."), name: z.string().min(1).describe("Printed before the signature, e.g. 'Client'.") }))
      .min(1)
      .max(20),
    baseVersionId: z.string().uuid().optional(),
    idempotencyKey: z.string().optional(),
  }),
  handler: (args, { client }) => {
    const { documentId, ...params } = args;
    return client.run("chaindoc_documents_add_signature_block", (sdk) =>
      sdk.documents.addSignatureBlock(documentId, params),
    );
  },
});

export const documentsUpdateRights = defineTool({
  name: "chaindoc_documents_update_rights",
  description:
    "Update a document's access control: accessType ('private', 'restricted', 'team', 'public') plus per-person grants " +
    "in accessEmails (optionally with the `account` option from chaindoc_accounts_lookup). Role audiences no longer exist.",
  inputSchema: RightsInputSchema,
  handler: (args, { client }) => {
    const { documentId, ...rights } = args;
    return client.run("chaindoc_documents_update_rights", (sdk) =>
      sdk.documents.updateRights(documentId, rights),
    );
  },
});

export const documentsVerify = defineTool({
  name: "chaindoc_documents_verify",
  description:
    "Verify a document version's blockchain anchor. `versionHash` is required; `certificateHash` is optional.",
  inputSchema: VerifyInputSchema,
  handler: (args, { client }) =>
    client.run("chaindoc_documents_verify", (sdk) =>
      sdk.documents.verify({
        versionHash: args.versionHash,
        ...(args.certificateHash !== undefined && { certificateHash: args.certificateHash }),
      }),
    ),
});

export const documentsGetVerificationStatus = defineTool({
  name: "chaindoc_documents_get_verification_status",
  description:
    "Get blockchain anchoring status for a specific document version (by versionId). " +
    "Returns { verified, verification: { txHash, chainId, status, verifiedAt } }.",
  inputSchema: VerificationStatusInputSchema,
  handler: (args, { client }) =>
    client.run("chaindoc_documents_get_verification_status", (sdk) =>
      sdk.documents.getVerificationStatus(args.versionId),
    ),
});

// SDK: DocumentSearchStatus = "draft" | "published" | "published_not_signed"
const DocumentSearchStatusEnum = z.enum(["draft", "published", "published_not_signed"]);

const DocIdSchema = z.object({ documentId: z.string().uuid() });

const DocVersionsSchema = z.object({
  documentId: z.string().uuid(),
  pageNumber: z.number().int().positive().default(1),
  pageSize: z.number().int().positive().max(100).default(20),
});

const SearchDocsSchema = z.object({
  search: z.string().optional(),
  status: DocumentSearchStatusEnum.optional(),
  pageNumber: z.number().int().positive().default(1),
  pageSize: z.number().int().positive().max(100).default(20),
});

const ListSharedSchema = z.object({
  search: z.string().optional(),
  status: DocumentSearchStatusEnum.optional(),
  pageNumber: z.number().int().positive().default(1),
  pageSize: z.number().int().positive().max(100).default(20),
});

export const documentsGet = defineTool({
  name: "chaindoc_documents_get",
  description:
    "Fetch a document's current-version metadata (accessType, txtId, etc.) plus `format` ('text' or 'file') and " +
    "`sendable`: a 'file' document cannot start a signature request until chaindoc_documents_convert. " +
    "Preconditions: the key's workspace must have read access (own or shared).",
  inputSchema: DocIdSchema,
  handler: (args, { client }) =>
    client.run("chaindoc_documents_get", (sdk) => sdk.documents.get(args.documentId)),
});

export const documentsGetVersions = defineTool({
  name: "chaindoc_documents_get_versions",
  description: "Paginated version history for a document.",
  inputSchema: DocVersionsSchema,
  handler: (args, { client }) =>
    client.run("chaindoc_documents_get_versions", (sdk) =>
      sdk.documents.getVersions(args.documentId, { pageNumber: args.pageNumber, pageSize: args.pageSize }),
    ),
});

export const documentsSearch = defineTool({
  name: "chaindoc_documents_search",
  description:
    "Search documents the key owner can access by optional free-text `search` and optional `status` filter.",
  inputSchema: SearchDocsSchema,
  handler: (args, { client }) =>
    client.run("chaindoc_documents_search", (sdk) => sdk.documents.search(args)),
});

export const documentsListShared = defineTool({
  name: "chaindoc_documents_list_shared",
  description: "List documents explicitly shared *with* the key owner (not owned by them).",
  inputSchema: ListSharedSchema,
  handler: (args, { client }) =>
    client.run("chaindoc_documents_list_shared", (sdk) => sdk.documents.listShared(args)),
});

export const documentsGetActivity = defineTool({
  name: "chaindoc_documents_get_activity",
  description: "Activity log (views, downloads, verification checks) for the document's current version.",
  inputSchema: DocIdSchema,
  handler: (args, { client }) =>
    client.run("chaindoc_documents_get_activity", (sdk) => sdk.documents.getActivity(args.documentId)),
});

export const documentsGetDownloads = defineTool({
  name: "chaindoc_documents_get_downloads",
  description: "Retrieve the download history and activity log for a document.",
  inputSchema: DocIdSchema,
  handler: (args, { client }) =>
    client.run("chaindoc_documents_get_downloads", (sdk) => sdk.documents.getDownloads(args.documentId)),
});

// ---- Comments + public link ----

const CommentAddSchema = z.object({
  documentId: z.string().uuid(),
  content: z.string().min(1).max(4000),
});

const CommentsListSchema = z.object({
  documentId: z.string().uuid(),
  pageNumber: z.number().int().positive().default(1),
  pageSize: z.number().int().positive().max(100).default(20),
});

const SendPublicLinkSchema = z.object({
  documentId: z.string().uuid(),
  email: z.string().email(),
  text: z.string().max(2000).optional(),
});

export const documentsCommentsAdd = defineTool({
  name: "chaindoc_documents_comments_add",
  description:
    "Add a top-level comment to a document. Replies cannot be created via the public API.",
  inputSchema: CommentAddSchema,
  handler: (args, { client }) =>
    client.run("chaindoc_documents_comments_add", (sdk) =>
      sdk.documents.comments.add(args.documentId, { content: args.content }),
    ),
});

export const documentsCommentsList = defineTool({
  name: "chaindoc_documents_comments_list",
  description: "List top-level comments on a document (each with nested replies).",
  inputSchema: CommentsListSchema,
  handler: (args, { client }) =>
    client.run("chaindoc_documents_comments_list", (sdk) =>
      sdk.documents.comments.list(args.documentId, { pageNumber: args.pageNumber, pageSize: args.pageSize }),
    ),
});

export const documentsSendPublicLink = defineTool({
  name: "chaindoc_documents_send_public_link",
  description:
    "Email a public link to a recipient. Preconditions: document.accessType must be 'public'. " +
    "Otherwise returns code='document_not_public' with a hint pointing at chaindoc_documents_update_rights.",
  inputSchema: SendPublicLinkSchema,
  handler: (args, { client }) =>
    client.run("chaindoc_documents_send_public_link", (sdk) =>
      sdk.documents.sendPublicLink(args.documentId, {
        email: args.email,
        ...(args.text !== undefined && { text: args.text }),
      }),
    ),
});

const VersionIdSchema = z.object({ versionId: z.string().uuid() });

export const documentsDownload = defineTool({
  name: "chaindoc_documents_download",
  description:
    "Download a document version's bytes. On stdio returns { kind: 'disk', path, ... }; " +
    "on HTTP returns { kind: 'inline', base64, ... } up to CHAINDOC_INLINE_DOWNLOAD_MAX_BYTES.",
  inputSchema: VersionIdSchema,
  handler: (args, { client, downloads }) =>
    client.run("chaindoc_documents_download", async (sdk) =>
      deliverDownload(downloads, await sdk.documents.download(args.versionId), {
        tool: "chaindoc_documents_download",
      }),
    ),
});

export const documentsPreview = defineTool({
  name: "chaindoc_documents_preview",
  description: "Same bytes as download, served as a preview (logged as preview in activity).",
  inputSchema: VersionIdSchema,
  handler: (args, { client, downloads }) =>
    client.run("chaindoc_documents_preview", async (sdk) =>
      deliverDownload(downloads, await sdk.documents.preview(args.versionId), {
        tool: "chaindoc_documents_preview",
      }),
    ),
});

export const documentsWaitForVerification = defineTool({
  name: "chaindoc_documents_wait_for_verification",
  description:
    "Block until a document version's blockchain anchor is verified (or timeoutMs elapses). " +
    "Use after publishing a version (status='published') and before chaindoc_signatures_create_request. " +
    "Polls chaindoc_documents_get_verification_status every intervalMs.",
  inputSchema: z.object({
    versionId: z.string().uuid(),
    timeoutMs: z.number().int().positive().max(120_000).default(60_000),
    intervalMs: z.number().int().positive().min(500).max(10_000).default(2_000),
  }),
  handler: async (args, { client }) => {
    const deadline = Date.now() + (args.timeoutMs ?? 60_000);
    const interval = args.intervalMs ?? 2_000;
    while (Date.now() < deadline) {
      const status = await client.run("documents.wait_for_verification.poll", (sdk) =>
        sdk.documents.getVerificationStatus(args.versionId),
      );
      if ((status as { verified?: boolean }).verified === true) {
        return { verified: true, status };
      }
      await new Promise((r) => setTimeout(r, interval));
    }
    return {
      verified: false,
      timedOut: true,
      message:
        "Version not verified within timeout. The blockchain anchor may still be in flight; retry the same poll later.",
    };
  },
});

export const documentsTools: ToolDefinition<unknown>[] = [
  documentsCreate as ToolDefinition<unknown>,
  documentsCreateFromFile as ToolDefinition<unknown>,
  documentsCreateFromStorage as ToolDefinition<unknown>,
  documentsUpdate as ToolDefinition<unknown>,
  documentsGetContent as ToolDefinition<unknown>,
  documentsConvert as ToolDefinition<unknown>,
  documentsAddSignatureBlock as ToolDefinition<unknown>,
  documentsUpdateRights as ToolDefinition<unknown>,
  documentsVerify as ToolDefinition<unknown>,
  documentsGetVerificationStatus as ToolDefinition<unknown>,
  documentsGet as ToolDefinition<unknown>,
  documentsGetVersions as ToolDefinition<unknown>,
  documentsSearch as ToolDefinition<unknown>,
  documentsListShared as ToolDefinition<unknown>,
  documentsGetActivity as ToolDefinition<unknown>,
  documentsGetDownloads as ToolDefinition<unknown>,
  documentsCommentsAdd as ToolDefinition<unknown>,
  documentsCommentsList as ToolDefinition<unknown>,
  documentsSendPublicLink as ToolDefinition<unknown>,
  documentsDownload as ToolDefinition<unknown>,
  documentsPreview as ToolDefinition<unknown>,
  documentsWaitForVerification as ToolDefinition<unknown>,
];
