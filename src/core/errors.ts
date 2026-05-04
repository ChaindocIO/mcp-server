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
  | "internal_error";

const STATUS_TO_CODE: Record<number, ChaindocErrorCode> = {
  400: "invalid_argument",
  401: "unauthenticated",
  403: "forbidden",
  404: "not_found",
  409: "conflict",
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
}

/**
 * Map an unknown thrown value to a structured ChaindocMcpError.
 *
 * Recognizes:
 *   - errors with .status / .statusCode (Chaindoc SDK + most HTTP libs)
 *   - NotImplementedError (this package)
 *   - plain Error (fallback to internal_error)
 */
export function toChaindocMcpError(err: unknown): ChaindocMcpError {
  if (err instanceof NotImplementedError) {
    return {
      code: "not_implemented",
      message: err.message,
    };
  }

  if (typeof err === "object" && err !== null) {
    const e = err as SdkErrorShape;
    const status = e.status ?? e.statusCode;
    if (typeof status === "number") {
      const code: ChaindocErrorCode =
        STATUS_TO_CODE[status] ?? (status >= 500 ? "upstream_error" : "internal_error");
      const result: ChaindocMcpError = {
        code,
        message: e.message ?? `Chaindoc API returned ${status}`,
        httpStatus: status,
      };
      if (typeof e.requestId === "string") result.requestId = e.requestId;
      if (typeof e.retryAfter === "number") result.retryAfter = e.retryAfter;
      if (e.body !== undefined) result.details = e.body;
      return result;
    }
  }

  if (err instanceof Error) {
    return { code: "internal_error", message: err.message };
  }

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
