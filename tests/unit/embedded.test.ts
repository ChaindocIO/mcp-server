import { describe, it, expect, vi } from "vitest";
import { embeddedCreateSession } from "../../src/tools/embedded.js";
import { toChaindocMcpError } from "../../src/core/errors.js";
import { fakeClient, fakeDownloads, fakeLogger } from "./_fakes.js";

const CONTRACT = "00000000-0000-0000-0000-000000000001";
const REQUEST = "00000000-0000-0000-0000-000000000002";
const EMAIL = "signer@example.com";

function sessionCtx(createSession = vi.fn().mockResolvedValue({ sessionId: "ses_1" })) {
  const client = fakeClient({ embedded: { createSession } } as never);
  return { createSession, ctx: { client, logger: fakeLogger(), downloads: fakeDownloads() } };
}

describe("chaindoc_embedded_create_session names a contract's signing request", () => {
  it("passes contractSigningRequestId beside contractId to the SDK, not stripped", async () => {
    const { createSession, ctx } = sessionCtx();
    const args = embeddedCreateSession.inputSchema.parse({
      email: EMAIL,
      metadata: { contractId: CONTRACT, contractSigningRequestId: REQUEST },
    });
    await embeddedCreateSession.handler(args, ctx);
    expect(createSession).toHaveBeenCalledWith({
      email: EMAIL,
      metadata: { contractId: CONTRACT, contractSigningRequestId: REQUEST },
    });
  });

  it("takes contractSigningRequestId alone: it names its contract", async () => {
    const { createSession, ctx } = sessionCtx();
    const args = embeddedCreateSession.inputSchema.parse({
      email: EMAIL,
      metadata: { contractSigningRequestId: REQUEST },
    });
    await embeddedCreateSession.handler(args, ctx);
    expect(createSession).toHaveBeenCalledWith({ email: EMAIL, metadata: { contractSigningRequestId: REQUEST } });
  });

  it("still refuses metadata that names nothing to sign, and a request id that is not a UUID", () => {
    expect(embeddedCreateSession.inputSchema.safeParse({ email: EMAIL, metadata: {} }).success).toBe(false);
    expect(
      embeddedCreateSession.inputSchema.safeParse({ email: EMAIL, metadata: { documentId: CONTRACT } }).success,
    ).toBe(false);
    expect(
      embeddedCreateSession.inputSchema.safeParse({ email: EMAIL, metadata: { contractSigningRequestId: "csr-1" } })
        .success,
    ).toBe(false);
  });

  it("tells the agent what EMBEDDED_SESSION_REQUEST_MISMATCH means", () => {
    const e = toChaindocMcpError(
      Object.assign(new Error("refused"), {
        statusCode: 400,
        errorKey: "EMBEDDED_SESSION_REQUEST_MISMATCH",
        response: { errorKey: "EMBEDDED_SESSION_REQUEST_MISMATCH", message: "refused" },
      }),
    );
    expect(e.errorKey).toBe("EMBEDDED_SESSION_REQUEST_MISMATCH");
    expect(e.hint).toContain("contractSigningRequestId");
  });
});
