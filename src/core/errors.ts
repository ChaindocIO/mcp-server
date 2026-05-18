import { matchErrorPattern } from "./error-patterns.js";

/**
 * Normalized error envelope returned to MCP clients.
 *
 * Tool handlers wrap any thrown error from the Chaindoc SDK into one of
 * these so the model sees a stable shape regardless of upstream change.
 */
export interface ChaindocMcpError {
  code: ChaindocErrorCode;
  message: string;
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
  | "document_not_public";

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
      // Lift validation-array messages out of details into `validation`.
      const responseMessage = e.response?.message;
      if (Array.isArray(responseMessage)) {
        out.validation = responseMessage;
      } else if (e.body !== undefined) {
        out.details = e.body;
      }
      // Pattern pass: refine the generic code with a state-machine code + hint.
      if (typeof e.message === "string") {
        const p = matchErrorPattern(status, e.message);
        if (p !== undefined) {
          out.code = p.code;
          out.hint = p.hint;
        }
      }
      return out;
    }
  }

  if (err instanceof Error) return { code: "internal_error", message: err.message };
  return { code: "internal_error", message: String(err) };
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
