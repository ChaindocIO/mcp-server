import { z } from "zod";
import type { ChaindocClient } from "../core/client.js";
import type { Logger } from "../core/logger.js";
import type { DownloadAdapterConfig } from "../core/downloads.js";

/**
 * Common context every tool handler receives.
 */
export interface ToolContext {
  client: ChaindocClient;
  logger: Logger;
  downloads: DownloadAdapterConfig;
  /**
   * Secrets of connected systems by integration uuid, from the operator's environment (stdio only).
   * They are never a tool argument, so they never reach the model or its transcript.
   */
  integrationSecrets?: Readonly<Record<string, string>>;
}

/**
 * A registered MCP tool: name, description, input schema, and handler.
 */
export interface ToolDefinition<Input> {
  name: string;
  description: string;
  inputSchema: z.ZodType<Input>;
  handler: (args: Input, ctx: ToolContext) => Promise<unknown>;
}

export function defineTool<Input>(t: ToolDefinition<Input>): ToolDefinition<Input> {
  return t;
}
