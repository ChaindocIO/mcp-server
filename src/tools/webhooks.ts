import { z } from "zod";
import { defineTool, type ToolDefinition } from "./types.js";

/**
 * Webhooks.
 *
 * Important: webhook delivery configuration (URL, secret, enabled flag)
 * lives in the Chaindoc dashboard and is **not** exposed via the public
 * REST API by design — this prevents API keys from reconfiguring their
 * own delivery target at runtime.
 *
 * What we *can* do from the MCP server is help users **verify** an
 * incoming webhook payload using the Server SDK's static
 * `Chaindoc.webhooks.verify()` helper. That's exactly the high-value
 * thing an LLM agent can do safely on the user's behalf when they paste
 * in a webhook delivery they want to inspect or debug.
 *
 * Canonical envelope (after verification):
 *   { id, type, createdAt, data }
 * Required headers:
 *   X-Chaindoc-Event, X-Chaindoc-Signature, X-Chaindoc-Delivery-Id, X-Chaindoc-Timestamp
 */

const VerifyInputSchema = z.object({
  rawBody: z.string().describe("The raw, unparsed JSON body of the incoming webhook request."),
  signature: z
    .string()
    .describe("Value of the X-Chaindoc-Signature header, format 'v1=<hex>' (HMAC-SHA256 of `${timestamp}.${rawBody}`)."),
  timestamp: z.string().describe("Value of the X-Chaindoc-Timestamp header (ISO 8601 UTC)."),
  secret: z
    .string()
    .min(16)
    .describe(
      "Webhook secret configured in your dashboard for the API key that owns this delivery.",
    ),
});

export const webhooksVerify = defineTool({
  name: "chaindoc_webhooks_verify",
  description:
    "Verify the HMAC-SHA256 signature of a Chaindoc webhook delivery. Returns " +
    "{ valid: boolean, envelope?: { id, type, createdAt, data } }. The 5-minute replay window is enforced. " +
    "Webhook configuration itself (URL/secret/enabled) is set in the Chaindoc dashboard, " +
    "not via this API.",
  inputSchema: VerifyInputSchema,
  handler: async (args, { client }) => {
    const staticApi = await client.staticApi();
    return staticApi.webhooks.verify(args.rawBody, args.signature, args.timestamp, args.secret);
  },
});

const ParseSchema = z.object({
  rawBody: z.string().describe("The raw, unparsed JSON body of an inbound webhook."),
});

export const webhooksParse = defineTool({
  name: "chaindoc_webhooks_parse",
  description:
    "Parse a Chaindoc webhook body WITHOUT verifying the signature. Only safe for trusted-transport contexts " +
    "(internal queue replays, log inspection). For any cross-network delivery, use chaindoc_webhooks_verify instead.",
  inputSchema: ParseSchema,
  handler: async (args, { client }) => {
    const staticApi = await client.staticApi();
    return staticApi.webhooks.parse(args.rawBody);
  },
});

export const webhooksTools: ToolDefinition<unknown>[] = [
  webhooksVerify as ToolDefinition<unknown>,
  webhooksParse as ToolDefinition<unknown>,
];
