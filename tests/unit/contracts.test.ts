import { describe, it, expect, vi } from "vitest";
import {
  contractsCreateEmpty, contractsCreateMinimal, contractsImport,
  contractsUpdate, contractsDelete, contractsAttachDocument,
  contractsGetStats, contractsSetupRecurring,
  contractsResendRecurringApproval, contractsCancelRecurringApproval,
  contractsListSigningRequests, contractsGetSigningRequest,
  contractsResendSigningRequest, contractsCancelSigningRequest,
  contractsBusinessSign,
} from "../../src/tools/contracts.js";
import { fakeClient, fakeDownloads, fakeLogger } from "./_fakes.js";

const CID = "00000000-0000-0000-0000-000000000001";
const DID = "00000000-0000-0000-0000-000000000002";
const SRID = "00000000-0000-0000-0000-000000000003";

function emptyContractsSdk() {
  return {
    create: vi.fn(), list: vi.fn(), get: vi.fn(), getStatus: vi.fn(),
    getActivities: vi.fn(), addPaymentSetup: vi.fn(),
    send: vi.fn(), cancel: vi.fn(), terminate: vi.fn(),
    createEmpty: vi.fn(), createMinimal: vi.fn(), import: vi.fn(),
    update: vi.fn(), delete: vi.fn(), attachDocument: vi.fn(),
    getStats: vi.fn(),
    setupRecurring: vi.fn(),
    resendRecurringApproval: vi.fn(),
    cancelRecurringApproval: vi.fn(),
    listSigningRequests: vi.fn(),
    getSigningRequest: vi.fn(),
    resendSigningRequest: vi.fn(),
    cancelSigningRequest: vi.fn(),
    businessSign: vi.fn(),
  };
}

function buildClient(over: Record<string, ReturnType<typeof vi.fn>>) {
  return fakeClient({
    contracts: {
      create: vi.fn(), list: vi.fn(), get: vi.fn(), getStatus: vi.fn(),
      getActivities: vi.fn(), addPaymentSetup: vi.fn(),
      send: vi.fn(), cancel: vi.fn(), terminate: vi.fn(),
      createEmpty: over["createEmpty"] ?? vi.fn(),
      createMinimal: over["createMinimal"] ?? vi.fn(),
      import: over["import"] ?? vi.fn(),
      update: over["update"] ?? vi.fn(),
      delete: over["delete"] ?? vi.fn(),
      attachDocument: over["attachDocument"] ?? vi.fn(),
    } as never,
  });
}

const ctx = (client = buildClient({})) => ({ client, logger: fakeLogger(), downloads: fakeDownloads() });

describe("contracts create variants + lifecycle additions", () => {
  it("create_empty forwards flat contragentEmail + currencyCode", async () => {
    const createEmpty = vi.fn().mockResolvedValue({ id: CID });
    const args = contractsCreateEmpty.inputSchema.parse({
      title: "Manual billing — Acme",
      contragentEmail: "a@b.com",
      currencyCode: "USD",
    });
    await contractsCreateEmpty.handler(args, ctx(buildClient({ createEmpty })));
    expect(createEmpty).toHaveBeenCalledWith({
      title: "Manual billing — Acme",
      contragentEmail: "a@b.com",
      currencyCode: "USD",
    });
  });

  it("create_minimal rejects missing contragentEmail", () => {
    expect(() =>
      contractsCreateMinimal.inputSchema.parse({ documentId: DID, title: "x" }),
    ).toThrow();
  });

  it("import forwards documentId + contragentEmail", async () => {
    const imp = vi.fn().mockResolvedValue({ id: CID });
    const args = contractsImport.inputSchema.parse({
      title: "Imported NDA",
      documentId: DID,
      contragentEmail: "x@y.com",
      currencyCode: "USD",
    });
    await contractsImport.handler(args, ctx(buildClient({ import: imp })));
    expect(imp).toHaveBeenCalledWith(expect.objectContaining({
      documentId: DID,
      contragentEmail: "x@y.com",
      currencyCode: "USD",
    }));
  });

  it("update partial — only provided fields go through", async () => {
    const update = vi.fn().mockResolvedValue({ id: CID });
    const args = contractsUpdate.inputSchema.parse({ contractId: CID, title: "renamed" });
    await contractsUpdate.handler(args, ctx(buildClient({ update })));
    expect(update).toHaveBeenCalledWith(CID, { title: "renamed" });
  });

  it("delete forwards contractId", async () => {
    const del = vi.fn().mockResolvedValue({ ok: true });
    const args = contractsDelete.inputSchema.parse({ contractId: CID });
    await contractsDelete.handler(args, ctx(buildClient({ delete: del })));
    expect(del).toHaveBeenCalledWith(CID);
  });

  it("attach_document forwards documentId", async () => {
    const attach = vi.fn().mockResolvedValue({ ok: true });
    const args = contractsAttachDocument.inputSchema.parse({ contractId: CID, documentId: DID });
    await contractsAttachDocument.handler(args, ctx(buildClient({ attachDocument: attach })));
    expect(attach).toHaveBeenCalledWith(CID, { documentId: DID });
  });
});

describe("contracts stats + recurring approval", () => {
  it("get_stats forwards contractId", async () => {
    const getStats = vi.fn().mockResolvedValue({ stats: {} });
    const client = fakeClient({ contracts: { ...emptyContractsSdk(), getStats } as never });
    const args = contractsGetStats.inputSchema.parse({ contractId: CID });
    await contractsGetStats.handler(args, { client, logger: fakeLogger(), downloads: fakeDownloads() });
    expect(getStats).toHaveBeenCalledWith(CID);
  });

  it("setup_recurring requires non-empty paymentTerms", () => {
    expect(() =>
      contractsSetupRecurring.inputSchema.parse({ contractId: CID, paymentTerms: [] }),
    ).toThrow();
  });

  it("setup_recurring forwards paymentTerms array", async () => {
    const setupRecurring = vi.fn().mockResolvedValue({ ok: true });
    const client = fakeClient({ contracts: { ...emptyContractsSdk(), setupRecurring } as never });
    const term = {
      type: "recurring" as const,
      name: "Monthly retainer",
      amount: "1000.00",
      frequency: "monthly" as const,
      dayOfPeriod: 1,
      startDate: "2026-06-01T00:00:00Z",
    };
    const args = contractsSetupRecurring.inputSchema.parse({
      contractId: CID,
      paymentTerms: [term],
    });
    await contractsSetupRecurring.handler(args, { client, logger: fakeLogger(), downloads: fakeDownloads() });
    expect(setupRecurring).toHaveBeenCalledWith(CID, { paymentTerms: [term] });
  });

  it("resend_recurring_approval forwards contractId", async () => {
    const resend = vi.fn().mockResolvedValue({ ok: true });
    const client = fakeClient({ contracts: { ...emptyContractsSdk(), resendRecurringApproval: resend } as never });
    const args = contractsResendRecurringApproval.inputSchema.parse({ contractId: CID });
    await contractsResendRecurringApproval.handler(args, { client, logger: fakeLogger(), downloads: fakeDownloads() });
    expect(resend).toHaveBeenCalledWith(CID);
  });

  it("cancel_recurring_approval forwards contractId", async () => {
    const cancel = vi.fn().mockResolvedValue({ ok: true });
    const client = fakeClient({ contracts: { ...emptyContractsSdk(), cancelRecurringApproval: cancel } as never });
    const args = contractsCancelRecurringApproval.inputSchema.parse({ contractId: CID });
    await contractsCancelRecurringApproval.handler(args, { client, logger: fakeLogger(), downloads: fakeDownloads() });
    expect(cancel).toHaveBeenCalledWith(CID);
  });
});

describe("contracts signing requests + business_sign", () => {
  it("list_signing_requests forwards contractId", async () => {
    const fn = vi.fn().mockResolvedValue({ signingRequests: [] });
    const client = fakeClient({ contracts: { ...emptyContractsSdk(), listSigningRequests: fn } as never });
    const args = contractsListSigningRequests.inputSchema.parse({ contractId: CID });
    await contractsListSigningRequests.handler(args, { client, logger: fakeLogger(), downloads: fakeDownloads() });
    expect(fn).toHaveBeenCalledWith(CID);
  });

  it("get_signing_request forwards both ids", async () => {
    const fn = vi.fn().mockResolvedValue({ signingRequest: {} });
    const client = fakeClient({ contracts: { ...emptyContractsSdk(), getSigningRequest: fn } as never });
    const args = contractsGetSigningRequest.inputSchema.parse({ contractId: CID, requestId: SRID });
    await contractsGetSigningRequest.handler(args, { client, logger: fakeLogger(), downloads: fakeDownloads() });
    expect(fn).toHaveBeenCalledWith(CID, SRID);
  });

  it("resend_signing_request forwards both ids", async () => {
    const fn = vi.fn().mockResolvedValue({ ok: true });
    const client = fakeClient({ contracts: { ...emptyContractsSdk(), resendSigningRequest: fn } as never });
    const args = contractsResendSigningRequest.inputSchema.parse({ contractId: CID, requestId: SRID });
    await contractsResendSigningRequest.handler(args, { client, logger: fakeLogger(), downloads: fakeDownloads() });
    expect(fn).toHaveBeenCalledWith(CID, SRID);
  });

  it("cancel_signing_request forwards both ids", async () => {
    const fn = vi.fn().mockResolvedValue({ ok: true });
    const client = fakeClient({ contracts: { ...emptyContractsSdk(), cancelSigningRequest: fn } as never });
    const args = contractsCancelSigningRequest.inputSchema.parse({ contractId: CID, requestId: SRID });
    await contractsCancelSigningRequest.handler(args, { client, logger: fakeLogger(), downloads: fakeDownloads() });
    expect(fn).toHaveBeenCalledWith(CID, SRID);
  });

  it("business_sign forwards signatureHash", async () => {
    const fn = vi.fn().mockResolvedValue({ success: true });
    const client = fakeClient({ contracts: { ...emptyContractsSdk(), businessSign: fn } as never });
    const args = contractsBusinessSign.inputSchema.parse({
      contractId: CID,
      requestId: SRID,
      signatureHash: "0xabc123",
    });
    await contractsBusinessSign.handler(args, { client, logger: fakeLogger(), downloads: fakeDownloads() });
    expect(fn).toHaveBeenCalledWith(CID, SRID, { signatureHash: "0xabc123" });
  });

  it("business_sign rejects empty signatureHash", () => {
    expect(() => contractsBusinessSign.inputSchema.parse({
      contractId: CID, requestId: SRID, signatureHash: "",
    })).toThrow();
  });
});
