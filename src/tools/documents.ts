import { z } from "zod";
import { defineTool, type ToolDefinition } from "./types.js";
import { deliverDownload } from "../core/downloads.js";

/**
 * Documents API
 *   POST   /api/v1/documents
 *   PUT    /api/v1/documents/:documentId
 *   PUT    /api/v1/documents/:documentId/rights
 *   POST   /api/v1/documents/verify
 *   GET    /api/v1/documents/versions/:versionId/verification
 */

const MediaTypeEnum = z.enum(["document", "image", "video", "text", "call_to_action"]);

const MediaHandleSchema = z.object({
  type: MediaTypeEnum.describe("Media type returned by chaindoc_media_upload."),
  name: z.string(),
  key: z.string(),
  url: z.string(),
  hash: z.string().optional(),
  size: z.number().optional(),
  thumbnail: z.string().optional(),
  bluredThumbnail: z.string().optional(),
  compressed: z.string().optional(),
});

const MetaPairSchema = z.object({
  key: z.string(),
  value: z.string(),
});

const AccessEmailSchema = z.object({
  email: z.string().email(),
  level: z.enum(["read", "write"]),
});

const AccessRoleSchema = z.object({
  roleId: z.number().int().positive(),
  level: z.enum(["read", "write"]),
});

const DocumentStatusEnum = z.enum([
  "draft",
  "published",
  "archived",
  "pending_signature",
  "signed",
]);

const DocumentStatusForCreateEnum = z.enum(["draft", "published"]);

const AccessTypeEnum = z.enum(["private", "public", "restricted", "team"]);

const CreateInputSchema = z.object({
  name: z.string().min(1).max(200),
  description: z.string().max(2000).describe("Required by the backend; pass an empty string if unused."),
  media: MediaHandleSchema.describe("Returned by chaindoc_media_upload."),
  meta: z.array(MetaPairSchema).describe("Required by the backend; pass [] if unused."),
  hashtags: z
    .array(z.string())
    .max(20)
    .describe("Required by the backend; pass [] if unused."),
  status: DocumentStatusForCreateEnum.describe(
    "When status='published', the version is queued for blockchain anchoring.",
  ),
  isForSigning: z.boolean().optional(),
  accessType: AccessTypeEnum.optional(),
  accessEmails: z.array(AccessEmailSchema).optional(),
  accessRoles: z.array(AccessRoleSchema).optional(),
});

const UpdateInputSchema = z.object({
  documentId: z.string().uuid(),
  name: z.string(),
  description: z.string(),
  media: MediaHandleSchema,
  meta: z.array(MetaPairSchema),
  hashtags: z.array(z.string()),
  status: DocumentStatusForCreateEnum,
  isForSigning: z.boolean().optional(),
});

const RightsInputSchema = z.object({
  documentId: z.string().uuid(),
  accessType: AccessTypeEnum,
  accessEmails: z.array(AccessEmailSchema).optional(),
  accessRoles: z.array(AccessRoleSchema).optional(),
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
    "Create a blockchain-anchored document from an uploaded media handle. " +
    "When status='published', the version is queued for blockchain anchoring. " +
    "Backend requires `description`, `meta`, `hashtags`, and `status` — pass empty strings/arrays if unused.",
  inputSchema: CreateInputSchema,
  handler: (args, { client }) =>
    client.run("chaindoc_documents_create", (sdk) =>
      sdk.documents.create({
        name: args.name,
        description: args.description,
        media: args.media,
        meta: args.meta,
        hashtags: args.hashtags,
        status: args.status,
        ...(args.isForSigning !== undefined && { isForSigning: args.isForSigning }),
        ...(args.accessType !== undefined && { accessType: args.accessType }),
        ...(args.accessEmails !== undefined && { accessEmails: args.accessEmails }),
        ...(args.accessRoles !== undefined && { accessRoles: args.accessRoles }),
      }),
    ),
});

export const documentsUpdate = defineTool({
  name: "chaindoc_documents_update",
  description:
    "Update a document by creating a new version. Previous versions are preserved for audit. " +
    "All version fields (`name`, `description`, `media`, `meta`, `hashtags`, `status`) are required.",
  inputSchema: UpdateInputSchema,
  handler: (args, { client }) => {
    const { documentId, isForSigning, ...patch } = args;
    return client.run("chaindoc_documents_update", (sdk) =>
      sdk.documents.update(documentId, {
        ...patch,
        ...(isForSigning !== undefined && { isForSigning }),
      }),
    );
  },
});

export const documentsUpdateRights = defineTool({
  name: "chaindoc_documents_update_rights",
  description:
    "Update a document's access control: accessType plus optional per-email and per-role grants.",
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
    "Fetch a document's current-version metadata (accessType, txtId, owner, etc.). " +
    "Preconditions: key owner must have read access (owner or shared).",
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
    "Use after chaindoc_documents_create with status='published' and before chaindoc_signatures_create_request. " +
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
  documentsUpdate as ToolDefinition<unknown>,
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
