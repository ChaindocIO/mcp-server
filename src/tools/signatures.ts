import { z } from "zod";
import { defineTool, type ToolDefinition } from "./types.js";
import { deliverDownload } from "../core/downloads.js";
import { AccountChoiceSchema, MetaTagSchema } from "./schemas.js";

/**
 * Signatures API
 *   POST   /api/v1/signatures/requests
 *   GET    /api/v1/signatures/requests/:requestId/status
 *   POST   /api/v1/signatures/sign
 *   GET    /api/v1/signatures?pageNumber&pageSize        (saved signature images)
 *   GET    /api/v1/signatures/requests?pageNumber&pageSize
 */

const SigningMethodEnum = z
  .enum(["embedded", "delegated"])
  .describe(
    "'embedded' opens the signer in an iframe via chaindoc_embedded_create_session; " +
      "'delegated' uses chaindoc_signatures_sign on behalf of the API key owner.",
  );

const RecipientSchema = z.object({
  email: z.string().email(),
  role: z
    .string()
    .min(1)
    .optional()
    .describe(
      "The role this person signs as: a `key` from chaindoc_documents_get_content `roles`. Required when the text holds " +
        "roles; every role needs exactly one recipient (SIGNATURE_ROLE_REQUIRED / _UNKNOWN / _UNASSIGNED / _TWICE).",
    ),
  account: AccountChoiceSchema.optional(),
  signingMethod: SigningMethodEnum.optional(),
});

const CreateRequestSchema = z.object({
  versionId: z.string().uuid().describe("A version of a TEXT document (a file version is DOCUMENT_FILE_CONVERTS)."),
  recipients: z.array(RecipientSchema).min(1).max(50),
  deadline: z
    .string()
    .datetime({ offset: true })
    .describe("ISO-8601 datetime. Required by the backend."),
  embeddedFlow: z.boolean().default(false),
  isKycRequired: z.boolean().default(false),
  message: z.string().max(2000).optional(),
  meta: z.array(MetaTagSchema).optional(),
}).strict(); // coordinate `fields` are refused, not dropped: places are chips in the text

const RequestIdSchema = z.object({ requestId: z.string().uuid() });

const SignSchema = z.object({
  requestId: z.string().uuid(),
  signatureId: z.number().int().positive(),
  messageText: z.string().max(2000).optional(),
  meta: z
    .array(z.object({ key: z.string(), value: z.string() }))
    .optional(),
});

const PaginationSchema = z.object({
  pageNumber: z.number().int().positive().default(1),
  pageSize: z.number().int().positive().max(100).default(10),
});

const SignatureRequestStatusFilter = z.enum(["all", "pending", "completed", "declined"]);

const GetMyRequestsSchema = z.object({
  pageNumber: z.number().int().positive().default(1),
  pageSize: z.number().int().positive().max(100).default(10),
  status: SignatureRequestStatusFilter.optional(),
});

export const signaturesCreateRequest = defineTool({
  name: "chaindoc_signatures_create_request",
  description:
    "Create a signature request for a version of a TEXT document. Signature places are chips in the text, never " +
    "coordinates: bind each recipient to a role of the text with `recipients[].role` (read roles with " +
    "chaindoc_documents_get_content; add them to a converted file with chaindoc_documents_add_signature_block). " +
    "Every role needs one recipient. Coordinate `fields` are refused (SETUP_FIELDS_STAND_IN_THE_TEXT). " +
    "A converting or file version is refused (DOCUMENT_CONVERSION_PENDING / DOCUMENT_FILE_CONVERTS). " +
    "`deadline` is required. Use `account` (from chaindoc_accounts_lookup) to address a person's workspace. " +
    "Set signingMethod='embedded' and use chaindoc_embedded_create_session for in-app signing. " +
    "A required signer field left empty at signing is SIGNING_FIELDS_EMPTY.",
  inputSchema: CreateRequestSchema,
  handler: (args, { client }) =>
    client.run("chaindoc_signatures_create_request", (sdk) => {
      const payload: Parameters<typeof sdk.signatures.createRequest>[0] = {
        versionId: args.versionId,
        recipients: args.recipients,
        deadline: new Date(args.deadline),
        embeddedFlow: args.embeddedFlow,
        isKycRequired: args.isKycRequired,
      };
      if (args.message !== undefined) payload.message = args.message;
      if (args.meta !== undefined) payload.meta = args.meta;
      return sdk.signatures.createRequest(payload);
    }),
});

export const signaturesGetRequestStatus = defineTool({
  name: "chaindoc_signatures_get_request_status",
  description:
    "Check the status of a signature request: which signers have signed, due date, completion flag.",
  inputSchema: RequestIdSchema,
  handler: (args, { client }) =>
    client.run("chaindoc_signatures_get_request_status", (sdk) =>
      sdk.signatures.getRequestStatus(args.requestId),
    ),
});

export const signaturesSign = defineTool({
  name: "chaindoc_signatures_sign",
  description:
    "LEGACY. Sign a request on behalf of the API key owner using a numeric signatureId. " +
    "New code should prefer chaindoc_contracts_business_sign (which takes a saved-signature hash from " +
    "chaindoc_signatures_get_signatures / chaindoc_signatures_create_signature). Kept callable for " +
    "callers that already hold a numeric signatureId.",
  inputSchema: SignSchema,
  handler: (args, { client }) =>
    client.run("chaindoc_signatures_sign", (sdk) => {
      const payload: Parameters<typeof sdk.signatures.sign>[0] = {
        requestId: args.requestId,
        signatureId: args.signatureId,
      };
      if (args.messageText !== undefined) payload.messageText = args.messageText;
      if (args.meta !== undefined) payload.meta = args.meta;
      return sdk.signatures.sign(payload);
    }),
});

export const signaturesGetMyRequests = defineTool({
  name: "chaindoc_signatures_get_my_requests",
  description:
    "Paginated list of signature requests for the authenticated key owner. " +
    "Optional `status` filter: 'all' | 'pending' | 'completed' | 'declined'. " +
    "Response includes totals: total, totalPending, totalCompleted, totalExpired.",
  inputSchema: GetMyRequestsSchema,
  handler: (args, { client }) =>
    client.run("chaindoc_signatures_get_my_requests", (sdk) => {
      const payload: { pageNumber: number; pageSize: number; status?: "all" | "pending" | "completed" | "declined" } = {
        pageNumber: args.pageNumber ?? 1,
        pageSize: args.pageSize ?? 10,
      };
      if (args.status !== undefined) payload.status = args.status;
      return sdk.signatures.getMyRequests(payload);
    }),
});

export const signaturesGetSignatures = defineTool({
  name: "chaindoc_signatures_get_signatures",
  description:
    "Paginated list of saved signature images on the authenticated user's account " +
    "(items[].hash, imageMedia, createdAt). For the list of signature requests, use chaindoc_signatures_get_my_requests.",
  inputSchema: PaginationSchema,
  handler: (args, { client }) =>
    client.run("chaindoc_signatures_get_signatures", (sdk) =>
      sdk.signatures.getSignatures(args),
    ),
});

const RemindSchema = z.object({
  requestId: z.string().uuid(),
  signerEmails: z.array(z.string().email()).max(50).optional(),
});

const EditRequestSchema = z.object({
  requestId: z.string().uuid(),
  signerId: z.string().uuid(),
  recipient: z.string().email(),
  account: AccountChoiceSchema.optional(),
});

const SigMediaHandleSchema = z.object({
  type: z.enum(["document", "image", "video", "text", "call_to_action"]),
  name: z.string(),
  key: z.string(),
  url: z.string(),
  hash: z.string().optional(),
  size: z.number().optional(),
  thumbnail: z.string().optional(),
  bluredThumbnail: z.string().optional(),
  compressed: z.string().optional(),
});

const CreateSignatureSchema = z.object({
  media: SigMediaHandleSchema,
  name: z.string().min(1).max(200).optional(),
});

const ValidatePdfFileInputSchema = z.union([
  z.object({ kind: z.literal("filePath"), path: z.string(), mimeType: z.string().default("application/pdf") }),
  z.object({ kind: z.literal("url"), url: z.string().url(), mimeType: z.string().default("application/pdf") }),
  z.object({ kind: z.literal("inline"), name: z.string(), mimeType: z.string().default("application/pdf"), base64Content: z.string() }),
]);

export const signaturesEditRequest = defineTool({
  name: "chaindoc_signatures_edit_request",
  description:
    "Reassign a signer slot on a PENDING signature request (optionally with the `account` option from chaindoc_accounts_lookup). Preconditions: request must be pending. " +
    "Otherwise returns code='wrong_state'.",
  inputSchema: EditRequestSchema,
  handler: (args, { client }) =>
    client.run("chaindoc_signatures_edit_request", (sdk) =>
      sdk.signatures.editRequest(args.requestId, {
        signerId: args.signerId,
        recipient: args.recipient,
        ...(args.account !== undefined && { account: args.account }),
      }),
    ),
});

export const signaturesCancel = defineTool({
  name: "chaindoc_signatures_cancel",
  description: "Cancel a PENDING signature request. Preconditions: request must be pending.",
  inputSchema: z.object({ requestId: z.string().uuid() }),
  handler: (args, { client }) =>
    client.run("chaindoc_signatures_cancel", (sdk) => sdk.signatures.cancel(args.requestId)),
});

export const signaturesRemind = defineTool({
  name: "chaindoc_signatures_remind",
  description:
    "Send a reminder email to pending signers on a request. Pass signerEmails to target specific signers; " +
    "omit to remind all. Preconditions: request must be pending. 12-hour per-signer cooldown — rate-limited " +
    "signers are returned in the response's `skipped[]` array (not as an error).",
  inputSchema: RemindSchema,
  handler: (args, { client }) =>
    client.run("chaindoc_signatures_remind", (sdk) =>
      sdk.signatures.remind(args.requestId, args.signerEmails !== undefined ? { signerEmails: args.signerEmails } : undefined),
    ),
});

export const signaturesResend = defineTool({
  name: "chaindoc_signatures_resend",
  description:
    "Resend a CANCELLED or EXPIRED signature request: opens a NEW request over a fresh copy of the version with the " +
    "original signers and leaves the first one as the record (the answer's requestId is the new one). " +
    "Optional `deadline` (ISO-8601); omitted, the original window is re-applied from now. Refused for a request that is " +
    "still active or that belongs to a contract (use chaindoc_contracts_resend_signing_request). " +
    "To nudge signers of an ACTIVE request use chaindoc_signatures_remind. This emails the signers again: confirm with the user.",
  inputSchema: z.object({
    requestId: z.string().uuid(),
    deadline: z.string().datetime({ offset: true }).optional(),
  }),
  handler: (args, { client }) =>
    client.run("chaindoc_signatures_resend", (sdk) =>
      sdk.signatures.resend(
        args.requestId,
        args.deadline !== undefined ? { deadline: new Date(args.deadline) } : undefined,
      ),
    ),
});

export const signaturesCreateSignature = defineTool({
  name: "chaindoc_signatures_create_signature",
  description:
    "Create a reusable saved signature from an uploaded image. Upload via chaindoc_media_upload first, " +
    "then pass the returned media handle. The new signature's `hash` is the id used by chaindoc_contracts_business_sign.",
  inputSchema: CreateSignatureSchema,
  handler: (args, { client }) =>
    client.run("chaindoc_signatures_create_signature", (sdk) =>
      sdk.signatures.createSignature({
        media: args.media as Parameters<typeof sdk.signatures.createSignature>[0]["media"],
        ...(args.name !== undefined && { name: args.name }),
      } as Parameters<typeof sdk.signatures.createSignature>[0]),
    ),
});

export const signaturesValidatePdfSignatures = defineTool({
  name: "chaindoc_signatures_validate_pdf_signatures",
  description:
    "Validate digital signatures embedded in a PDF via the EU DSS service. " +
    "Pass the PDF as filePath, url, or inline base64. The file is NOT stored.",
  inputSchema: z.object({ file: ValidatePdfFileInputSchema }),
  handler: async (args, { client }) => {
    const f = args.file;
    let blob: File | Blob;
    if (f.kind === "filePath") {
      const { readFile } = await import("node:fs/promises");
      const buf = await readFile(f.path);
      blob = new File([buf], f.path.split("/").pop() ?? "upload.pdf", { type: f.mimeType });
    } else if (f.kind === "url") {
      const resp = await fetch(f.url);
      if (!resp.ok) throw Object.assign(new Error(`Failed to fetch ${f.url}: ${resp.status}`), { status: resp.status });
      const buf = Buffer.from(await resp.arrayBuffer());
      blob = new File([buf], f.url.split("/").pop() ?? "upload.pdf", { type: f.mimeType });
    } else {
      const buf = Buffer.from(f.base64Content, "base64");
      blob = new File([buf], f.name, { type: f.mimeType });
    }
    return client.run("chaindoc_signatures_validate_pdf_signatures", (sdk) =>
      sdk.signatures.validatePdfSignatures(blob),
    );
  },
});

export const signaturesDownloadCertificate = defineTool({
  name: "chaindoc_signatures_download_certificate",
  description:
    "Download the audit-trail certificate PDF for a fully-signed document version. " +
    "Returns 400 if the version has no certificate (not yet fully signed).",
  inputSchema: z.object({ versionId: z.string().uuid() }),
  handler: (args, { client, downloads }) =>
    client.run("chaindoc_signatures_download_certificate", async (sdk) =>
      deliverDownload(downloads, await sdk.signatures.downloadCertificate(args.versionId), {
        tool: "chaindoc_signatures_download_certificate",
      }),
    ),
});

export const signaturesDownloadSignedDocument = defineTool({
  name: "chaindoc_signatures_download_signed_document",
  description:
    "Download the PAdES-signed PDF for a fully-signed document version. " +
    "Returns 400 if the version is not yet fully signed.",
  inputSchema: z.object({ versionId: z.string().uuid() }),
  handler: (args, { client, downloads }) =>
    client.run("chaindoc_signatures_download_signed_document", async (sdk) =>
      deliverDownload(downloads, await sdk.signatures.downloadSignedDocument(args.versionId), {
        tool: "chaindoc_signatures_download_signed_document",
      }),
    ),
});

export const signaturesTools: ToolDefinition<unknown>[] = [
  signaturesCreateRequest as ToolDefinition<unknown>,
  signaturesGetRequestStatus as ToolDefinition<unknown>,
  signaturesSign as ToolDefinition<unknown>,
  signaturesGetMyRequests as ToolDefinition<unknown>,
  signaturesGetSignatures as ToolDefinition<unknown>,
  signaturesEditRequest as ToolDefinition<unknown>,
  signaturesCancel as ToolDefinition<unknown>,
  signaturesRemind as ToolDefinition<unknown>,
  signaturesResend as ToolDefinition<unknown>,
  signaturesCreateSignature as ToolDefinition<unknown>,
  signaturesValidatePdfSignatures as ToolDefinition<unknown>,
  signaturesDownloadCertificate as ToolDefinition<unknown>,
  signaturesDownloadSignedDocument as ToolDefinition<unknown>,
];
