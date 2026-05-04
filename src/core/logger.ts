import pino from "pino";
import type { Logger } from "pino";

/**
 * Build a pino logger that writes to stderr (so it doesn't pollute the
 * MCP stdio protocol stream on stdout) and redacts secrets.
 *
 * Pass the desired log level (e.g. from config). Default "info".
 */
export function createLogger(level: string = "info"): Logger {
  return pino(
    {
      level,
      base: { name: "chaindoc-mcp" },
      redact: {
        paths: [
          "apiKey",
          "secretKey",
          "secret",
          "token",
          "*.apiKey",
          "*.secretKey",
          "*.secret",
          "*.token",
          "headers.authorization",
          "headers.Authorization",
          "req.headers.authorization",
          "req.headers.Authorization",
        ],
        censor: "[REDACTED]",
      },
      formatters: {
        level: (label) => ({ level: label }),
      },
    },
    pino.destination(2), // stderr
  );
}

export type { Logger } from "pino";
