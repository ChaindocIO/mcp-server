import { z } from "zod";
import { defineTool, type ToolDefinition } from "./types.js";

/**
 * Documents API
 *   POST   /documents
 *   PUT    /documents/:documentId
 *   PUT    /documents/:documentId/rights
 *   POST   /documents/verify
 *   GET    /documents/versions/:versionId/verification
 */

const MediaHandleSchema = z.object({
  type: z.string().describe("'document' | 'image' | 'video'"),
  name: z.string().optional(),
  key: z.string(),
  url: z.string().optional(),
  hash: z.string().optional(),
  size: z.number().optional(),
  thumbnail: z.string().nullable().optional(),
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

const CreateInputSchema = z.object({
  name: z.string().min(1).max(200),
  description: z.string().max(2000).optional(),
  media: MediaHandleSchema.describe("Returned by chaindoc_media_upload."),
  status: z.enum(["draft", "published"]).default("draft"),
  hashtags: z.array(z.string()).max(20).optional(),
  meta: z.array(MetaPairSchema).optional(),
  isForSigning: z.boolean().optional(),
  accessType: z.enum(["private", "public", "restricted"]).optional(),
  accessEmails: z.array(AccessEmailSchema).optional(),
  accessRoles: z.array(AccessRoleSchema).optional(),
});

const UpdateInputSchema = z.object({
  documentId: z.string().uuid(),
  name: z.string().optional(),
  description: z.string().optional(),
  media: MediaHandleSchema.optional(),
  status: z.enum(["draft", "published"]).optional(),
  hashtags: z.array(z.string()).optional(),
  meta: z.array(MetaPairSchema).optional(),
  isForSigning: z.boolean().optional(),
});

const RightsInputSchema = z.object({
  documentId: z.string().uuid(),
  accessType: z.enum(["private", "public", "restricted"]),
  accessEmails: z.array(AccessEmailSchema).optional(),
  accessRoles: z.array(AccessRoleSchema).optional(),
});

const VerifyInputSchema = z
  .object({
    versionHash: z.string().regex(/^0x[0-9a-fA-F]+$/, "expected 0x-prefixed hex").optional(),
    certificateHash: z
      .string()
      .regex(/^0x[0-9a-fA-F]+$/, "expected 0x-prefixed hex")
      .optional(),
  })
  .refine((v) => v.versionHash || v.certificateHash, {
    message: "provide at least one of versionHash or certificateHash",
  });

const VerificationStatusInputSchema = z.object({ versionId: z.string().uuid() });

export const documentsCreate = defineTool({
  name: "chaindoc_documents_create",
  description:
    "Create a blockchain-anchored document from an uploaded media handle. " +
    "When status='published', the version is queued for blockchain anchoring.",
  inputSchema: CreateInputSchema,
  handler: (args, { client }) =>
    client.run("chaindoc_documents_create", (sdk) =>
      sdk.documents.create({
        name: args.name,
        ...(args.description !== undefined && { description: args.description }),
        media: args.media,
        status: args.status,
        ...(args.hashtags !== undefined && { hashtags: args.hashtags }),
        ...(args.meta !== undefined && { meta: args.meta }),
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
    "Returns 200 with empty body on success.",
  inputSchema: UpdateInputSchema,
  handler: (args, { client }) => {
    const { documentId, ...patch } = args;
    return client.run("chaindoc_documents_update", (sdk) => sdk.documents.update(documentId, patch));
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
    "Verify a document version's blockchain anchor. Pass versionHash, certificateHash, or both.",
  inputSchema: VerifyInputSchema,
  handler: (args, { client }) =>
    client.run("chaindoc_documents_verify", (sdk) =>
      sdk.documents.verify({
        ...(args.versionHash !== undefined && { versionHash: args.versionHash }),
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

export const documentsTools: ToolDefinition<unknown>[] = [
  documentsCreate as ToolDefinition<unknown>,
  documentsUpdate as ToolDefinition<unknown>,
  documentsUpdateRights as ToolDefinition<unknown>,
  documentsVerify as ToolDefinition<unknown>,
  documentsGetVerificationStatus as ToolDefinition<unknown>,
];
