import { describe, expect, it } from "vitest";
import { NotImplementedError, toChaindocMcpError } from "../../src/core/errors.js";

describe("toChaindocMcpError", () => {
  it("maps 401 to unauthenticated", () => {
    const err = toChaindocMcpError({ status: 401, message: "bad key" });
    expect(err).toMatchObject({ code: "unauthenticated", httpStatus: 401, message: "bad key" });
  });

  it("maps 429 with retryAfter", () => {
    const err = toChaindocMcpError({ status: 429, retryAfter: 30, message: "slow down" });
    expect(err).toMatchObject({ code: "rate_limited", retryAfter: 30 });
  });

  it("maps 5xx to upstream_error", () => {
    const err = toChaindocMcpError({ status: 502 });
    expect(err.code).toBe("upstream_error");
  });

  it("recognizes NotImplementedError", () => {
    const err = toChaindocMcpError(new NotImplementedError("foo"));
    expect(err.code).toBe("not_implemented");
    expect(err.message).toContain("foo");
  });

  it("falls back to internal_error", () => {
    expect(toChaindocMcpError(new Error("boom")).code).toBe("internal_error");
    expect(toChaindocMcpError("not even an error").code).toBe("internal_error");
  });

  it("maps 413 to payload_too_large", () => {
    expect(toChaindocMcpError({ status: 413, code: "payload_too_large", message: "too big" }))
      .toMatchObject({ code: "payload_too_large", httpStatus: 413 });
  });

  it("lifts validation-array response.message into `validation`", () => {
    const err = toChaindocMcpError({
      status: 400,
      message: "Request failed with status 400",
      response: { message: [{ property: "documentId", constraints: { isNotEmpty: "documentId should not be empty" } }] },
    });
    expect(err.code).toBe("invalid_argument");
    expect(err.validation).toEqual([
      { property: "documentId", constraints: { isNotEmpty: "documentId should not be empty" } },
    ]);
    expect(err.details).toBeUndefined();
  });
});
