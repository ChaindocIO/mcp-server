import { z } from "zod";
import { defineTool, type ToolDefinition } from "./types.js";

/**
 * Signatures API
 *   POST   /signatures/requests
 *   GET    /signatures/requests/:requestId/status
 *   POST   /signatures/sign
 *   GET    /signatures?pageNumber&pageSize
 *   GET    /signatures/requests?pageNumber&pageSize
 */

const RecipientSchema = z.object({
  email: z.string().email(),
  signingMethod: z.enum(["email", "embedded"]).optional(),
  shareToken: z
    .string()
    .optional()
    .describe("Optional Sumsub KYC share token to skip KYC for this signer."),
});

const PlacedFieldSchema = z.object({
  signerEmail: z.string().email(),
  fieldType: z.enum(["signature", "initials", "date_signed", "text", "checkbox"]),
  pageIndex: z.number().int().min(0),
  xPct: z.number().min(0).max(1),
  yPct: z.number().min(0).max(1),
  wPct: z.number().min(0).max(1),
  hPct: z.number().min(0).max(1),
  required: z.boolean().optional(),
  label: z.string().optional(),
  systemKey: z.string().optional(),
});

const CreateRequestSchema = z.object({
  versionId: z.string().uuid(),
  recipients: z.array(RecipientSchema).min(1).max(50),
  deadline: z
    .string()
    .datetime({ offset: true })
    .optional()
    .describe("ISO-8601 datetime."),
  embeddedFlow: z.boolean().default(false),
  isKycRequired: z.boolean().default(false),
  message: z.string().max(2000).optional(),
  fields: z
    .array(PlacedFieldSchema)
    .max(100)
    .optional()
    .describe(
      "Optional pre-placed fields when uploading a custom PDF. Skip when rendering from a template.",
    ),
});

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

export const signaturesCreateRequest = defineTool({
  name: "chaindoc_signatures_create_request",
  description:
    "Create a signature request for a document version. " +
    "All recipients sign in parallel — Chaindoc does not support sequential or conditional ordering. " +
    "Set embeddedFlow=true and use chaindoc_embedded_create_session per recipient for in-app signing.",
  inputSchema: CreateRequestSchema,
  handler: (args, { client }) =>
    client.run("chaindoc_signatures_create_request", (sdk) => {
      const payload: Parameters<typeof sdk.signatures.createRequest>[0] = {
        versionId: args.versionId,
        recipients: args.recipients,
        embeddedFlow: args.embeddedFlow,
        isKycRequired: args.isKycRequired,
      };
      if (args.deadline !== undefined) payload.deadline = new Date(args.deadline);
      if (args.message !== undefined) payload.message = args.message;
      if (args.fields !== undefined) payload.fields = args.fields;
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
    "Sign a request on behalf of the API key owner — only valid when the key owner is one of the signers.",
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
  description: "Paginated list of signature requests for the authenticated key owner.",
  inputSchema: PaginationSchema,
  handler: (args, { client }) =>
    client.run("chaindoc_signatures_get_my_requests", (sdk) =>
      sdk.signatures.getMyRequests(args),
    ),
});

export const signaturesGetSignatures = defineTool({
  name: "chaindoc_signatures_get_signatures",
  description: "Paginated list of signatures created by the authenticated key owner.",
  inputSchema: PaginationSchema,
  handler: (args, { client }) =>
    client.run("chaindoc_signatures_get_signatures", (sdk) =>
      sdk.signatures.getSignatures(args),
    ),
});

export const signaturesTools: ToolDefinition<unknown>[] = [
  signaturesCreateRequest as ToolDefinition<unknown>,
  signaturesGetRequestStatus as ToolDefinition<unknown>,
  signaturesSign as ToolDefinition<unknown>,
  signaturesGetMyRequests as ToolDefinition<unknown>,
  signaturesGetSignatures as ToolDefinition<unknown>,
];
