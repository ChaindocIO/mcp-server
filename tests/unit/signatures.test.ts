import { describe, it, expect, vi } from "vitest";
import { signaturesGetMyRequests, signaturesSign } from "../../src/tools/signatures.js";
import { fakeClient, fakeDownloads, fakeLogger } from "./_fakes.js";

describe("signatures_get_my_requests filter", () => {
  it("forwards status when set", async () => {
    const getMyRequests = vi.fn().mockResolvedValue({ items: [] });
    const client = fakeClient({
      signatures: {
        createRequest: vi.fn(), getRequestStatus: vi.fn(), sign: vi.fn(),
        getSignatures: vi.fn(), getMyRequests,
      } as never,
    });
    const args = signaturesGetMyRequests.inputSchema.parse({
      pageNumber: 1, pageSize: 10, status: "pending",
    });
    await signaturesGetMyRequests.handler(args, { client, logger: fakeLogger(), downloads: fakeDownloads() });
    expect(getMyRequests).toHaveBeenCalledWith({ pageNumber: 1, pageSize: 10, status: "pending" });
  });

  it("omits status when not provided", async () => {
    const getMyRequests = vi.fn().mockResolvedValue({ items: [] });
    const client = fakeClient({
      signatures: {
        createRequest: vi.fn(), getRequestStatus: vi.fn(), sign: vi.fn(),
        getSignatures: vi.fn(), getMyRequests,
      } as never,
    });
    const args = signaturesGetMyRequests.inputSchema.parse({ pageNumber: 1, pageSize: 10 });
    await signaturesGetMyRequests.handler(args, { client, logger: fakeLogger(), downloads: fakeDownloads() });
    expect(getMyRequests).toHaveBeenCalledWith({ pageNumber: 1, pageSize: 10 });
  });

  it("rejects invalid status enum", () => {
    expect(() => signaturesGetMyRequests.inputSchema.parse({ status: "weird" })).toThrow();
  });
});

describe("signatures_sign description carries the legacy warning", () => {
  it("description mentions chaindoc_contracts_business_sign and the word legacy", () => {
    expect(signaturesSign.description).toContain("chaindoc_contracts_business_sign");
    expect(signaturesSign.description.toLowerCase()).toContain("legacy");
  });
});
