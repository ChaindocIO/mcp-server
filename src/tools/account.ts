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

export const accountsLookup = defineTool({
  name: "chaindoc_accounts_lookup",
  description:
    "Find where people can be addressed. For each e-mail (1-25) returns status 'not_registered', 'hidden' (the person " +
    "does not reveal where they can be sent) or 'options': their personal account and the workspaces they can receive " +
    "documents as ({kind:'personal'} or {kind:'workspace', workspaceId, workspaceName}). Pass the chosen option back " +
    "unchanged as `account` on recipients, access grants, template slots or `contragentAccount`. Omitting `account` " +
    "addresses the person's personal account. When someone has several options, ask the user which one is meant.",
  inputSchema: z.object({
    emails: z.array(z.string().email()).min(1).max(25),
  }),
  handler: (args, { client }) =>
    client.run("chaindoc_accounts_lookup", (sdk) => sdk.accounts.lookup({ emails: args.emails })),
});

export const accountTools: ToolDefinition<unknown>[] = [
  accountsLookup as ToolDefinition<unknown>,
  accountGetApiKeyInfo as ToolDefinition<unknown>,
  accountHealthCheck as ToolDefinition<unknown>,
];
