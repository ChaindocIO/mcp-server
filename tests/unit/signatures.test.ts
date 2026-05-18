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

import {
  signaturesEditRequest,
  signaturesCancel,
  signaturesRemind,
  signaturesCreateSignature,
  signaturesValidatePdfSignatures,
  signaturesDownloadCertificate,
  signaturesDownloadSignedDocument,
} from "../../src/tools/signatures.js";

const RID = "00000000-0000-0000-0000-000000000001";

function sigClient(over: Record<string, ReturnType<typeof vi.fn>>) {
  return fakeClient({
    signatures: {
      createRequest: vi.fn(), getRequestStatus: vi.fn(), sign: vi.fn(),
      getMyRequests: vi.fn(), getSignatures: vi.fn(),
      editRequest: over["editRequest"] ?? vi.fn(),
      cancel: over["cancel"] ?? vi.fn(),
      remind: over["remind"] ?? vi.fn(),
      createSignature: over["createSignature"] ?? vi.fn(),
      validatePdfSignatures: over["validatePdfSignatures"] ?? vi.fn(),
    } as never,
  });
}

const sigCtx = (client = sigClient({})) => ({ client, logger: fakeLogger(), downloads: fakeDownloads() });

describe("signatures lifecycle", () => {
  it("edit_request forwards signerId + recipient", async () => {
    const editRequest = vi.fn().mockResolvedValue({ ok: true });
    const args = signaturesEditRequest.inputSchema.parse({
      requestId: RID,
      signerId: "00000000-0000-0000-0000-000000000002",
      recipient: "new@example.com",
    });
    await signaturesEditRequest.handler(args, sigCtx(sigClient({ editRequest })));
    expect(editRequest).toHaveBeenCalledWith(RID, {
      signerId: "00000000-0000-0000-0000-000000000002",
      recipient: "new@example.com",
    });
  });

  it("cancel forwards requestId", async () => {
    const cancel = vi.fn().mockResolvedValue({ ok: true });
    const args = signaturesCancel.inputSchema.parse({ requestId: RID });
    await signaturesCancel.handler(args, sigCtx(sigClient({ cancel })));
    expect(cancel).toHaveBeenCalledWith(RID);
  });

  it("remind forwards optional signerEmails", async () => {
    const remind = vi.fn().mockResolvedValue({ skipped: [] });
    const args = signaturesRemind.inputSchema.parse({ requestId: RID, signerEmails: ["a@b.com"] });
    await signaturesRemind.handler(args, sigCtx(sigClient({ remind })));
    expect(remind).toHaveBeenCalledWith(RID, { signerEmails: ["a@b.com"] });
  });

  it("create_signature forwards media handle", async () => {
    const createSignature = vi.fn().mockResolvedValue({ signature: { hash: "0xabc" } });
    const media = { type: "image" as const, name: "s.png", key: "/t/s.png", url: "https://cdn/x" };
    const args = signaturesCreateSignature.inputSchema.parse({ media, name: "Personal" });
    await signaturesCreateSignature.handler(args, sigCtx(sigClient({ createSignature })));
    expect(createSignature).toHaveBeenCalledWith({ media, name: "Personal" });
  });

  it("create_signature rejects when media is malformed", () => {
    expect(() =>
      signaturesCreateSignature.inputSchema.parse({ media: { wrong: true } }),
    ).toThrow();
  });
});

describe("signatures binary downloads", () => {
  it("download_certificate routes through adapter", async () => {
    const downloadCertificate = vi.fn().mockResolvedValue({
      data: new TextEncoder().encode("cert").buffer,
      contentType: "application/pdf",
    });
    const client = fakeClient({
      signatures: {
        createRequest: vi.fn(), getRequestStatus: vi.fn(), sign: vi.fn(),
        getMyRequests: vi.fn(), getSignatures: vi.fn(),
        editRequest: vi.fn(), cancel: vi.fn(), remind: vi.fn(),
        createSignature: vi.fn(), validatePdfSignatures: vi.fn(),
        downloadCertificate, downloadSignedDocument: vi.fn(),
      } as never,
    });
    const args = signaturesDownloadCertificate.inputSchema.parse({ versionId: RID });
    const r = await signaturesDownloadCertificate.handler(args, {
      client, logger: fakeLogger(), downloads: fakeDownloads({ mode: "inline" }),
    });
    expect(downloadCertificate).toHaveBeenCalledWith(RID);
    expect((r as { kind: string }).kind).toBe("inline");
    expect((r as { contentType: string }).contentType).toBe("application/pdf");
  });

  it("download_signed_document routes through adapter", async () => {
    const downloadSignedDocument = vi.fn().mockResolvedValue({
      data: new TextEncoder().encode("signed").buffer,
      contentType: "application/pdf",
    });
    const client = fakeClient({
      signatures: {
        createRequest: vi.fn(), getRequestStatus: vi.fn(), sign: vi.fn(),
        getMyRequests: vi.fn(), getSignatures: vi.fn(),
        editRequest: vi.fn(), cancel: vi.fn(), remind: vi.fn(),
        createSignature: vi.fn(), validatePdfSignatures: vi.fn(),
        downloadCertificate: vi.fn(), downloadSignedDocument,
      } as never,
    });
    const args = signaturesDownloadSignedDocument.inputSchema.parse({ versionId: RID });
    const r = await signaturesDownloadSignedDocument.handler(args, {
      client, logger: fakeLogger(), downloads: fakeDownloads({ mode: "inline" }),
    });
    expect(downloadSignedDocument).toHaveBeenCalledWith(RID);
    expect((r as { kind: string }).kind).toBe("inline");
  });
});
