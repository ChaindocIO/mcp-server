import { matchErrorPattern } from "./error-patterns.js";
import { hintForErrorKey } from "./error-keys.js";

/**
 * Normalized error envelope returned to MCP clients.
 *
 * Tool handlers wrap any thrown error from the Chaindoc SDK into one of
 * these so the model sees a stable shape regardless of upstream change.
 */
export interface ChaindocMcpError {
  code: ChaindocErrorCode;
  message: string;
  /** The server's machine-readable reason (`errorKey`), passed through as sent. */
  errorKey?: string;
  httpStatus?: number;
  validation?: unknown;
  hint?: string;
  retryAfter?: number;
  requestId?: string;
  details?: unknown;
}

export type ChaindocErrorCode =
  | "invalid_argument"
  | "unauthenticated"
  | "forbidden"
  | "not_found"
  | "conflict"
  | "unprocessable"
  | "rate_limited"
  | "upstream_error"
  | "not_implemented"
  | "internal_error"
  | "payload_too_large"
  // state-machine codes (set by the pattern pass in Task 6)
  | "wrong_state"
  | "not_verified"
  | "wrong_party"
  | "stripe_not_ready"
  | "document_not_public"
  // raised by the MCP server itself, before any call is made
  | "confirmation_required"
  | "unavailable"
  | "file_input_refused";

const STATUS_TO_CODE: Record<number, ChaindocErrorCode> = {
  400: "invalid_argument",
  401: "unauthenticated",
  403: "forbidden",
  404: "not_found",
  409: "conflict",
  413: "payload_too_large",
  422: "unprocessable",
  429: "rate_limited",
};

interface SdkErrorShape {
  status?: number;
  statusCode?: number;
  message?: string;
  code?: string;
  errorKey?: unknown;
  requestId?: string;
  retryAfter?: number;
  body?: unknown;
  response?: { message?: unknown };
}

/**
 * Map an unknown thrown value to a structured ChaindocMcpError.
 */
export function toChaindocMcpError(err: unknown): ChaindocMcpError {
  if (err instanceof NotImplementedError) {
    return { code: "not_implemented", message: err.message };
  }
  if (err instanceof ConfirmationRequiredError) {
    return { code: "confirmation_required", message: err.message, hint: err.hint };
  }
  if (err instanceof FileInputRefusedError) {
    return { code: "file_input_refused", message: err.message, hint: err.hint };
  }
  if (err instanceof UnavailableError) {
    return { code: "unavailable", message: err.message, hint: err.hint };
  }

  if (typeof err === "object" && err !== null) {
    const e = err as SdkErrorShape;
    const status = e.status ?? e.statusCode;
    if (typeof status === "number") {
      // Honor an explicit `code` from the source when the generic status map has no entry.
      // This lets a thrower attach a domain-specific code on an unmapped status (e.g. 402, 451)
      // without it being silently replaced with `internal_error`. The mapped 4xx statuses always
      // take precedence over the explicit code so they remain a stable baseline.
      const baseCode =
        STATUS_TO_CODE[status] ??
        (typeof e.code === "string" ? (e.code as ChaindocErrorCode) : undefined) ??
        (status >= 500 ? "upstream_error" : "internal_error");
      const out: ChaindocMcpError = {
        code: baseCode,
        message: e.message ?? `Chaindoc API returned ${status}`,
        httpStatus: status,
      };
      if (typeof e.requestId === "string") out.requestId = e.requestId;
      if (typeof e.retryAfter === "number") out.retryAfter = e.retryAfter;
      // The answer's body: the SDK keeps it on `response` (older throwers used `body`). A validation list goes to
      // `validation`; the facts the server sends beside its key (`blockers`, `status`, `role`/`roles`, `convert`,
      // `fields`...) go to `details`, so the agent can act on them.
      const body = e.response !== undefined ? e.response : e.body;
      const responseMessage = isRecord(body) ? body["message"] : undefined;
      if (Array.isArray(responseMessage)) out.validation = responseMessage;
      const facts = factsOf(body);
      if (facts !== undefined) out.details = facts;
      // The server's own reason decides; a known state refusal also refines the generic code. Without a key the
      // message text is the fallback (servers that do not send the key yet).
      const errorKey = readErrorKey(e);
      if (errorKey !== undefined) out.errorKey = errorKey;
      const pattern = matchErrorPattern(status, typeof e.message === "string" ? e.message : undefined, errorKey);
      if (pattern !== undefined) {
        out.code = pattern.code;
        out.hint = pattern.hint;
      }
      const keyHint = errorKey !== undefined ? hintForErrorKey(errorKey) : undefined;
      if (keyHint !== undefined) out.hint = keyHint;
      return out;
    }
  }

  if (typeof err === "object" && err !== null) {
    const e = err as SdkErrorShape;
    if (typeof e.errorKey === "string" && e.errorKey.length > 0) {
      // Raised inside the SDK before any HTTP answer (e.g. a conversion that ended `failed`).
      const out: ChaindocMcpError = {
        code: "unprocessable",
        message: e.message ?? e.errorKey,
        errorKey: e.errorKey,
      };
      const hint = hintForErrorKey(e.errorKey);
      if (hint !== undefined) out.hint = hint;
      const facts = factsOf(e.response);
      if (facts !== undefined) out.details = facts;
      return out;
    }
  }

  if (err instanceof Error) return { code: "internal_error", message: err.message };
  return { code: "internal_error", message: String(err) };
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

/** What the body says beside the words: everything but the message, the HTTP reason and the key itself. */
const NOT_FACTS = new Set(["message", "error", "statusCode", "errorKey"]);
function factsOf(body: unknown): unknown {
  if (body === undefined || body === null) return undefined;
  if (!isRecord(body)) return typeof body === "string" ? undefined : body;
  const facts = Object.fromEntries(Object.entries(body).filter(([k]) => !NOT_FACTS.has(k)));
  return Object.keys(facts).length > 0 ? facts : undefined;
}

/**
 * Throw from tool handlers that exist as stubs until the live API docs
 * confirm the endpoint shape.
 */
export class NotImplementedError extends Error {
  constructor(name: string, reason = "endpoint not yet verified against live docs") {
    super(`${name}: ${reason}`);
    this.name = "NotImplementedError";
  }
}

/**
 * The server answers `{ errorKey }` or, for money refusals, `{ code: 'STRIPE_...' }` in the body; the SDK
 * copies it to `errorKey` on the error.
 */
function readErrorKey(e: SdkErrorShape): string | undefined {
  if (typeof e.errorKey === "string" && e.errorKey.length > 0) return e.errorKey;
  const body = e.response as { errorKey?: unknown } | undefined;
  if (body && typeof body.errorKey === "string" && body.errorKey.length > 0) return body.errorKey;
  return undefined;
}

/**
 * Thrown by a tool that moves money (or does something that cannot be undone) when the agent did not pass
 * `confirm: true`. The agent must ask the user, then call again.
 */
export class ConfirmationRequiredError extends Error {
  readonly hint: string;
  constructor(action: string) {
    super(`${action} needs the user's explicit confirmation before it runs. Nothing was done.`);
    this.name = "ConfirmationRequiredError";
    this.hint = "Ask the user to confirm this exact action (amount, invoice, who is affected), then call again with confirm=true.";
  }
}

/** Thrown when a tool cannot work in this deployment (e.g. no secret is configured for it). */
export class UnavailableError extends Error {
  readonly hint: string;
  constructor(message: string, hint: string) {
    super(message);
    this.name = "UnavailableError";
    this.hint = hint;
  }
}

/** A file input (path or URL) was refused by the server's own safety rules, before anything was read or fetched. */
export class FileInputRefusedError extends Error {
  readonly hint: string;
  constructor(message: string, hint = "Send the file as base64 (kind: 'inline') or through Storage (chaindoc_storage_upload_file).") {
    super(message);
    this.name = "FileInputRefusedError";
    this.hint = hint;
  }
}
