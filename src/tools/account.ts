import { z } from "zod";
import { defineTool, type ToolDefinition } from "./types.js";

/**
 * General API
 *   GET /me      — current API key info
 *   GET /health  — connectivity probe + key validity
 */

export const accountGetApiKeyInfo = defineTool({
  name: "chaindoc_account_get_api_key_info",
  description:
    "Return metadata about the API key in use: keyId, keyName, isActive, accessLevel, lastUsedAt.",
  inputSchema: z.object({}),
  handler: (_args, { client }) =>
    client.run("chaindoc_account_get_api_key_info", (sdk) => sdk.getApiKeyInfo()),
});

export const accountHealthCheck = defineTool({
  name: "chaindoc_account_health_check",
  description:
    "Lightweight reachability + key-validity probe. Returns { status, timestamp, apiKeyValid }.",
  inputSchema: z.object({}),
  handler: (_args, { client }) =>
    client.run("chaindoc_account_health_check", (sdk) => sdk.healthCheck()),
});

export const accountTools: ToolDefinition<unknown>[] = [
  accountGetApiKeyInfo as ToolDefinition<unknown>,
  accountHealthCheck as ToolDefinition<unknown>,
];
