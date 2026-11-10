#!/usr/bin/env node
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { buildServer } from "../server.js";
import { loadConfig } from "../core/config.js";
import { createLogger } from "../core/logger.js";

async function main(): Promise<void> {
  const config = loadConfig({ requireApiKey: true });
  const logger = createLogger(config.logLevel);
  const server = buildServer({
    apiKey: config.apiKey!, // requireApiKey above guarantees this
    environment: config.environment,
    maxRps: config.maxRps,
    timeoutMs: config.timeoutMs,
    retry: {
      maxRetries: config.retryMaxRetries,
      baseDelayMs: config.retryBaseDelayMs,
      maxDelayMs: config.retryMaxDelayMs,
    },
    logger,
    transport: "stdio",
    ...(config.processIntegrationSecrets !== undefined && {
      integrationSecrets: config.processIntegrationSecrets,
    }),
    downloads: {
      mode: config.downloadMode === "auto" ? "disk" : config.downloadMode,
      dir: config.downloadDir,
      inlineMaxBytes: config.inlineDownloadMaxBytes,
    },
  });

  const transport = new StdioServerTransport();
  await server.connect(transport);

  logger.info(
    { environment: config.environment, maxRps: config.maxRps },
    "chaindoc-mcp listening on stdio",
  );
}

main().catch((err) => {
  process.stderr.write(`chaindoc-mcp failed to start: ${(err as Error).message}\n`);
  process.exit(1);
});
