#!/usr/bin/env node
import express, { type Request, type Response } from "express";
import { randomUUID } from "node:crypto";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { buildServer } from "../server.js";
import { loadConfig } from "../core/config.js";
import { createLogger } from "../core/logger.js";
import { HostedConfigError, readHostedCredentials, type HostedCredentials } from "./auth.js";

/**
 * Hosted HTTP/SSE transport.
 *
 * Auth precedence:
 *   1. Authorization: Bearer <key> on the incoming request.
 *   2. Smithery's ?config=<base64 JSON> (chaindocApiKey, chaindocEnvironment).
 *   3. CHAINDOC_API_KEY env var (default).
 *
 * If neither is present we return 401.
 */
async function main(): Promise<void> {
  const config = loadConfig({ requireApiKey: false });
  const logger = createLogger(config.logLevel);
  const app = express();
  app.use(express.json({ limit: "25mb" })); // accommodate base64 file payloads

  app.get("/healthz", (_req: Request, res: Response) => {
    res.json({ ok: true });
  });

  app.all("/mcp", async (req: Request, res: Response) => {
    const requestId = randomUUID();
    let creds: HostedCredentials;
    try {
      creds = readHostedCredentials(req.headers.authorization, req.query["config"]);
    } catch (err) {
      if (err instanceof HostedConfigError) {
        res.status(400).json({ error: "invalid_config", message: err.message });
        return;
      }
      logger.error({ err, requestId }, "Reading hosted credentials failed");
      res.status(500).json({ error: "internal_error", requestId });
      return;
    }
    const headerKey = creds.apiKey;
    const apiKey = headerKey ?? config.apiKey;

    if (!apiKey) {
      res.status(401).json({
        error: "missing_api_key",
        message:
          "Provide an API key via Authorization: Bearer <key> or set CHAINDOC_API_KEY on the server.",
      });
      return;
    }

    const reqLogger = logger.child({ requestId });
    if (headerKey && config.apiKey && headerKey !== config.apiKey) {
      reqLogger.debug("Authorization header overrides server-side CHAINDOC_API_KEY for this request");
    }

    const server = buildServer({
      apiKey,
      environment: creds.environment ?? config.environment,
      maxRps: config.maxRps,
      timeoutMs: config.timeoutMs,
      retry: {
        maxRetries: config.retryMaxRetries,
        baseDelayMs: config.retryBaseDelayMs,
        maxDelayMs: config.retryMaxDelayMs,
      },
      logger: reqLogger,
      transport: "http",
      downloads: {
        mode: config.downloadMode === "auto" ? "inline" : config.downloadMode,
        dir: config.downloadDir,
        inlineMaxBytes: config.inlineDownloadMaxBytes,
      },
    });

    const transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: () => randomUUID(),
    });
    res.on("close", () => {
      transport.close().catch(() => {});
      server.close().catch(() => {});
    });

    try {
      await server.connect(transport);
      await transport.handleRequest(req, res, req.body);
    } catch (err) {
      reqLogger.error({ err }, "MCP request failed");
      if (!res.headersSent) {
        res.status(500).json({ error: "internal_error", requestId });
      }
    }
  });

  app.listen(config.port, config.host, () => {
    logger.info(
      { host: config.host, port: config.port, environment: config.environment },
      "chaindoc-mcp HTTP transport listening",
    );
  });
}

main().catch((err) => {
  process.stderr.write(`chaindoc-mcp HTTP failed to start: ${(err as Error).message}\n`);
  process.exit(1);
});
