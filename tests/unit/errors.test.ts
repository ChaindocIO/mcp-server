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
});
