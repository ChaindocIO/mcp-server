import { z } from "zod";
import { defineTool, type ToolDefinition } from "./types.js";

/**
 * Embedded sessions API — POST /api/v1/embedded/sessions.
 *
 * Sessions live for 10 minutes. The signer receives an OTP via email to
 * exercise the iframe. The frontend Embed SDK consumes the returned
 * sessionId.
 *
 * For contract signing, pass `metadata.contractId` and the backend resolves
 * `documentId` and `signatureRequestId` automatically: the session is for the
 * contract's open signing request — its own, or an amendment's while one is
 * being signed (`pending_amendment`). `metadata.contractSigningRequestId` (the
 * `signingRequestId` that chaindoc_contracts_send and
 * chaindoc_contracts_agreements_initiate_signing answer) names that request
 * itself, beside `contractId` or alone.
 */

const CreateSessionSchema = z
  .object({
    email: z.string().email(),
    metadata: z.object({
      documentId: z.string().uuid().optional(),
      signatureRequestId: z.string().uuid().optional(),
      contractId: z.string().uuid().optional(),
      contractSigningRequestId: z.string().uuid().optional(),
      returnUrl: z.string().url().optional(),
    }),
  })
  .superRefine((v, ctx) => {
    const hasDoc = v.metadata.documentId && v.metadata.signatureRequestId;
    const hasContract = !!v.metadata.contractId || !!v.metadata.contractSigningRequestId;
    if (!hasDoc && !hasContract) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message:
          "metadata must include either { documentId + signatureRequestId }, { contractId } or { contractSigningRequestId }.",
      });
    }
  });

export const embeddedCreateSession = defineTool({
  name: "chaindoc_embedded_create_session",
  description:
    "Create a 10-minute embedded signing session for a recipient. " +
    "Pass {documentId, signatureRequestId} for standalone signing, or {contractId} for contract signing: the session is " +
    "for the contract's open signing request, its own or an amendment's while one is being signed (the signer signs or " +
    "declines the amendment in the window). To name the request itself, pass contractSigningRequestId (the " +
    "signingRequestId that chaindoc_contracts_send / chaindoc_contracts_agreements_initiate_signing answered), beside " +
    "contractId or alone. An OTP email is sent automatically; the returned sessionId is consumed by the Embed SDK. " +
    "Refused, with no session and no OTP: a request that is closed (EMBEDDED_SIGNING_REQUEST_CLOSED, `details.status` " +
    "says signed / cancelled / expired), a contract never sent (EMBEDDED_CONTRACT_NOT_SIGNABLE: chaindoc_contracts_send " +
    "first), and names that do not fit together (EMBEDDED_SESSION_REQUEST_MISMATCH).",
  inputSchema: CreateSessionSchema,
  handler: (args, { client }) =>
    client.run("chaindoc_embedded_create_session", (sdk) =>
      sdk.embedded.createSession({ email: args.email, metadata: args.metadata }),
    ),
});

export const embeddedTools: ToolDefinition<unknown>[] = [
  embeddedCreateSession as ToolDefinition<unknown>,
];
