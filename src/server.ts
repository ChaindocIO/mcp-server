import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import {
  CallToolRequestSchema,
  ListPromptsRequestSchema,
  ListResourcesRequestSchema,
  ListToolsRequestSchema,
  GetPromptRequestSchema,
  ReadResourceRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import { zodToJsonSchema } from "./util/zod-to-json-schema.js";
import { ChaindocClient } from "./core/client.js";
import { createLogger, type Logger } from "./core/logger.js";
import { toChaindocMcpError } from "./core/errors.js";
import { allTools } from "./tools/index.js";
import { listResources, readResource } from "./resources/index.js";
import { allPrompts } from "./prompts/index.js";
import type { DownloadAdapterConfig, DownloadAdapterMode } from "./core/downloads.js";
import { tmpdir } from "node:os";
import { join } from "node:path";

export interface BuildServerOptions {
  apiKey: string;
  environment?: "production" | "staging" | "development";
  maxRps?: number;
  timeoutMs?: number;
  retry?: { maxRetries?: number; baseDelayMs?: number; maxDelayMs?: number };
  logger?: Logger;
  downloads?: { mode?: DownloadAdapterMode; dir?: string; inlineMaxBytes?: number };
}

/**
 * Build an MCP `Server` instance with all Chaindoc tools, resources, and
 * prompts registered. The caller is responsible for connecting it to a
 * transport (stdio, HTTP, etc.).
 */
export function buildServer(opts: BuildServerOptions): Server {
  const logger = opts.logger ?? createLogger();
  const client = new ChaindocClient({
    apiKey: opts.apiKey,
    ...(opts.environment !== undefined && { environment: opts.environment }),
    ...(opts.maxRps !== undefined && { maxRps: opts.maxRps }),
    ...(opts.timeoutMs !== undefined && { timeout: opts.timeoutMs }),
    ...(opts.retry !== undefined && { retry: opts.retry }),
    logger,
  });

  const downloads: DownloadAdapterConfig = {
    mode: opts.downloads?.mode ?? "auto",
    dir: opts.downloads?.dir ?? join(tmpdir(), "chaindoc-mcp"),
    inlineMaxBytes: opts.downloads?.inlineMaxBytes ?? 4 * 1024 * 1024,
  };

  const server = new Server(
    {
      name: "chaindoc-mcp",
      version: "0.2.0",
    },
    {
      capabilities: {
        tools: {},
        resources: {},
        prompts: {},
      },
    },
  );

  // ---------- tools ----------
  server.setRequestHandler(ListToolsRequestSchema, async () => ({
    tools: allTools.map((t) => ({
      name: t.name,
      description: t.description,
      inputSchema: zodToJsonSchema(t.inputSchema),
    })),
  }));

  server.setRequestHandler(CallToolRequestSchema, async (req) => {
    const tool = allTools.find((t) => t.name === req.params.name);
    if (!tool) {
      return errorResult({
        code: "not_found",
        message: `Unknown tool: ${req.params.name}`,
      });
    }
    const parsed = tool.inputSchema.safeParse(req.params.arguments ?? {});
    if (!parsed.success) {
      return errorResult({
        code: "invalid_argument",
        message: "Tool arguments failed validation",
        details: parsed.error.issues,
      });
    }
    try {
      const result = await tool.handler(parsed.data, { client, logger, downloads });
      return {
        content: [
          {
            type: "text",
            text: typeof result === "string" ? result : JSON.stringify(result, null, 2),
          },
        ],
      };
    } catch (err) {
      logger.error({ err, tool: tool.name }, "Tool handler threw");
      return errorResult(toChaindocMcpError(err));
    }
  });

  // ---------- resources ----------
  server.setRequestHandler(ListResourcesRequestSchema, async () => {
    const items = await listResources(client);
    return { resources: items };
  });

  server.setRequestHandler(ReadResourceRequestSchema, async (req) => {
    const content = await readResource(req.params.uri, client);
    return { contents: [content] };
  });

  // ---------- prompts ----------
  server.setRequestHandler(ListPromptsRequestSchema, async () => ({
    prompts: allPrompts.map((p) => ({
      name: p.name,
      description: p.description,
      arguments: p.arguments,
    })),
  }));

  server.setRequestHandler(GetPromptRequestSchema, async (req) => {
    const prompt = allPrompts.find((p) => p.name === req.params.name);
    if (!prompt) {
      throw Object.assign(new Error(`Unknown prompt: ${req.params.name}`), { status: 404 });
    }
    const messages = prompt.build(req.params.arguments ?? {});
    return { messages };
  });

  return server;
}

function errorResult(payload: unknown) {
  return {
    isError: true,
    content: [
      {
        type: "text" as const,
        text: JSON.stringify(payload, null, 2),
      },
    ],
  };
}
