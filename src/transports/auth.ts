/**
 * Where the hosted transport finds the caller's API key.
 *
 * Precedence: `Authorization: Bearer <key>`, then Smithery's per-install
 * `?config=<base64 JSON>` (`chaindocApiKey`, `chaindocEnvironment`), then the
 * server's own `CHAINDOC_API_KEY`. A `config` that cannot be read is refused
 * (typed error), not ignored.
 */
export type HostedEnvironment = "production" | "staging" | "development";

export interface HostedCredentials {
  apiKey?: string;
  environment?: HostedEnvironment;
}

export class HostedConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "HostedConfigError";
  }
}

const ENVIRONMENTS: readonly string[] = ["production", "staging", "development"];

export function readHostedCredentials(
  authorization: string | undefined,
  configParam: unknown,
): HostedCredentials {
  if (typeof authorization === "string" && authorization.startsWith("Bearer ")) {
    const key = authorization.slice("Bearer ".length).trim();
    if (key) return { apiKey: key };
  }
  if (configParam === undefined) return {};
  if (typeof configParam !== "string") {
    throw new HostedConfigError("`config` must be a single base64 JSON value.");
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(Buffer.from(configParam, "base64").toString("utf8"));
  } catch {
    throw new HostedConfigError("`config` is not base64-encoded JSON.");
  }
  if (typeof parsed !== "object" || parsed === null) {
    throw new HostedConfigError("`config` must be a JSON object.");
  }
  const cfg = parsed as Record<string, unknown>;
  const out: HostedCredentials = {};
  if (typeof cfg["chaindocApiKey"] === "string" && cfg["chaindocApiKey"].length > 0) {
    out.apiKey = cfg["chaindocApiKey"];
  }
  const env = cfg["chaindocEnvironment"];
  if (env !== undefined) {
    if (typeof env !== "string" || !ENVIRONMENTS.includes(env)) {
      throw new HostedConfigError("`chaindocEnvironment` must be production, staging or development.");
    }
    out.environment = env as HostedEnvironment;
  }
  return out;
}
