import { describe, it, expect, vi } from "vitest";
import {
  contractsCreateEmpty, contractsCreateMinimal, contractsImport,
  contractsUpdate, contractsDelete, contractsAttachDocument,
} from "../../src/tools/contracts.js";
import { fakeClient, fakeDownloads, fakeLogger } from "./_fakes.js";

const CID = "00000000-0000-0000-0000-000000000001";
const DID = "00000000-0000-0000-0000-000000000002";

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
