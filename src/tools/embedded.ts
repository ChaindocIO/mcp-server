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
 * `documentId` and `signatureRequestId` automatically.
 */

const CreateSessionSchema = z
  .object({
    email: z.string().email(),
    metadata: z.object({
      documentId: z.string().uuid().optional(),
      signatureRequestId: z.string().uuid().optional(),
      contractId: z.string().uuid().optional(),
      returnUrl: z.string().url().optional(),
    }),
  })
  .superRefine((v, ctx) => {
    const hasDoc = v.metadata.documentId && v.metadata.signatureRequestId;
    const hasContract = !!v.metadata.contractId;
    if (!hasDoc && !hasContract) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message:
          "metadata must include either { documentId + signatureRequestId } or { contractId }.",
      });
    }
  });

export const embeddedCreateSession = defineTool({
  name: "chaindoc_embedded_create_session",
  description:
    "Create a 10-minute embedded signing session for a recipient. " +
    "Pass {documentId, signatureRequestId} for standalone signing, or {contractId} for contract signing. " +
    "An OTP email is sent automatically; the returned sessionId is consumed by the Embed SDK.",
  inputSchema: CreateSessionSchema,
  handler: (args, { client }) =>
    client.run("chaindoc_embedded_create_session", (sdk) =>
      sdk.embedded.createSession({ email: args.email, metadata: args.metadata }),
    ),
});

export const embeddedTools: ToolDefinition<unknown>[] = [
  embeddedCreateSession as ToolDefinition<unknown>,
];
