import { z } from "zod";

/**
 * Configuration for the Chaindoc MCP server. All values come from
 * environment variables. CHAINDOC_API_KEY is required for the local
 * stdio transport; for the hosted HTTP transport the key may be
 * provided per-request via Authorization header instead.
 */
export const ConfigSchema = z.object({
  apiKey: z
    .string()
    .min(1)
    .optional()
    .describe("Chaindoc API key (sk_ for write, pk_ for read-only)."),
  environment: z
    .enum(["production", "staging", "development"])
    .default("production")
    .describe("Chaindoc environment. Keys are environment-agnostic."),
  logLevel: z
    .enum(["trace", "debug", "info", "warn", "error", "fatal", "silent"])
    .default("info"),
  // Chaindoc rate limit is 10 requests per 60 seconds. Default the bucket
  // refill rate to that to avoid client-side overshoot.
  maxRps: z.coerce.number().positive().default(10 / 60),
  timeoutMs: z.coerce.number().int().positive().default(30_000),
  retryMaxRetries: z.coerce.number().int().nonnegative().default(3),
  retryBaseDelayMs: z.coerce.number().int().positive().default(1000),
  retryMaxDelayMs: z.coerce.number().int().positive().default(10_000),
  port: z.coerce.number().int().positive().default(8787),
  host: z.string().default("0.0.0.0"),
});

export type Config = z.infer<typeof ConfigSchema>;

export interface LoadConfigOptions {
  /**
   * If true, throw when CHAINDOC_API_KEY is missing.
   * Used by the stdio transport (which has no per-request auth).
   */
  requireApiKey?: boolean;
}

export function loadConfig(opts: LoadConfigOptions = {}): Config {
  const parsed = ConfigSchema.safeParse({
    apiKey: process.env["CHAINDOC_API_KEY"],
    environment: process.env["CHAINDOC_ENVIRONMENT"],
    logLevel: process.env["CHAINDOC_LOG_LEVEL"],
    maxRps: process.env["CHAINDOC_MAX_RPS"],
    timeoutMs: process.env["CHAINDOC_TIMEOUT_MS"],
    retryMaxRetries: process.env["CHAINDOC_RETRY_MAX_RETRIES"],
    retryBaseDelayMs: process.env["CHAINDOC_RETRY_BASE_DELAY_MS"],
    retryMaxDelayMs: process.env["CHAINDOC_RETRY_MAX_DELAY_MS"],
    port: process.env["PORT"],
    host: process.env["HOST"],
  });

  if (!parsed.success) {
    const issues = parsed.error.issues
      .map((i) => `${i.path.join(".")}: ${i.message}`)
      .join("; ");
    throw new Error(`Invalid configuration: ${issues}`);
  }

  if (opts.requireApiKey && !parsed.data.apiKey) {
    throw new Error(
      "CHAINDOC_API_KEY is required. Set it in your environment or MCP client config.",
    );
  }

  return parsed.data;
}
