import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { documentsWaitForVerification } from "../../src/tools/documents.js";
import { fakeClient, fakeDownloads, fakeLogger } from "./_fakes.js";

const ID = "00000000-0000-0000-0000-000000000001";

beforeEach(() => { vi.useFakeTimers(); });
afterEach(() => { vi.useRealTimers(); });

function buildCtx(statuses: Array<{ verified: boolean }>) {
  const getVerificationStatus = vi.fn();
  for (const s of statuses) getVerificationStatus.mockResolvedValueOnce(s);
  const client = fakeClient({
    documents: {
      create: vi.fn(), update: vi.fn(), updateRights: vi.fn(),
      verify: vi.fn(), getVerificationStatus,
    } as never,
  });
  return { ctx: { client, logger: fakeLogger(), downloads: fakeDownloads() }, getVerificationStatus };
}

describe("documents_wait_for_verification", () => {
  it("returns verified on first poll", async () => {
    const { ctx, getVerificationStatus } = buildCtx([{ verified: true }]);
    const args = documentsWaitForVerification.inputSchema.parse({
      versionId: ID, timeoutMs: 5000, intervalMs: 500,
    });
    const p = documentsWaitForVerification.handler(args, ctx);
    await vi.advanceTimersByTimeAsync(0);
    const r = await p;
    expect(r).toMatchObject({ verified: true });
    expect(getVerificationStatus).toHaveBeenCalledTimes(1);
  });

  it("times out without throwing", async () => {
    const { ctx, getVerificationStatus } = buildCtx([
      { verified: false }, { verified: false }, { verified: false },
    ]);
    const args = documentsWaitForVerification.inputSchema.parse({
      versionId: ID, timeoutMs: 1200, intervalMs: 500,
    });
    const p = documentsWaitForVerification.handler(args, ctx);
    await vi.advanceTimersByTimeAsync(2000);
    const r = await p;
    expect(r).toMatchObject({ verified: false, timedOut: true });
    expect(getVerificationStatus.mock.calls.length).toBeGreaterThanOrEqual(1);
  });

  it("rejects intervalMs below 500", () => {
    expect(() => documentsWaitForVerification.inputSchema.parse({
      versionId: ID, intervalMs: 100,
    })).toThrow();
  });
});
