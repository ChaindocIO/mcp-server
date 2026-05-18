import { describe, it, expect, vi } from "vitest";
import {
  contractsAgreementsCreate,
  contractsAgreementsList,
  contractsAgreementsGet,
  contractsAgreementsInitiateSigning,
  contractsAgreementsDelete,
} from "../../src/tools/contracts-agreements.js";
import { fakeClient, fakeDownloads, fakeLogger } from "./_fakes.js";

const CID = "00000000-0000-0000-0000-000000000001";
const AID = "00000000-0000-0000-0000-000000000002";
const DID = "00000000-0000-0000-0000-000000000003";

function agClient(fns: Record<string, ReturnType<typeof vi.fn>>) {
  return fakeClient({
    contracts: {
      agreements: {
        create: fns["create"] ?? vi.fn(),
        list: fns["list"] ?? vi.fn(),
        get: fns["get"] ?? vi.fn(),
        initiateSigning: fns["initiateSigning"] ?? vi.fn(),
        delete: fns["delete"] ?? vi.fn(),
      },
    } as never,
  });
}
const ctx = (client = agClient({})) => ({ client, logger: fakeLogger(), downloads: fakeDownloads() });

describe("contracts agreements", () => {
  it("create forwards documentId + title", async () => {
    const create = vi.fn().mockResolvedValue({ agreement: {} });
    const args = contractsAgreementsCreate.inputSchema.parse({
      contractId: CID,
      documentId: DID,
      title: "Amendment #1",
    });
    await contractsAgreementsCreate.handler(args, ctx(agClient({ create })));
    expect(create).toHaveBeenCalledWith(CID, {
      documentId: DID,
      title: "Amendment #1",
    });
  });

  it("create rejects invalid documentId", () => {
    expect(() =>
      contractsAgreementsCreate.inputSchema.parse({
        contractId: CID, documentId: "nope", title: "x",
      }),
    ).toThrow();
  });

  it("list forwards contractId", async () => {
    const list = vi.fn().mockResolvedValue({ agreements: [] });
    const args = contractsAgreementsList.inputSchema.parse({ contractId: CID });
    await contractsAgreementsList.handler(args, ctx(agClient({ list })));
    expect(list).toHaveBeenCalledWith(CID);
  });

  it("get forwards both ids", async () => {
    const get = vi.fn().mockResolvedValue({ agreement: {} });
    const args = contractsAgreementsGet.inputSchema.parse({ contractId: CID, agreementId: AID });
    await contractsAgreementsGet.handler(args, ctx(agClient({ get })));
    expect(get).toHaveBeenCalledWith(CID, AID);
  });

  it("initiate_signing converts deadline string to Date", async () => {
    const initiate = vi.fn().mockResolvedValue({ ok: true });
    const args = contractsAgreementsInitiateSigning.inputSchema.parse({
      contractId: CID,
      agreementId: AID,
      deadline: "2026-12-31T23:59:59Z",
      messageToSigners: "please sign",
    });
    await contractsAgreementsInitiateSigning.handler(args, ctx(agClient({ initiateSigning: initiate })));
    const called = initiate.mock.calls[0];
    expect(called?.[0]).toBe(CID);
    expect(called?.[1]).toBe(AID);
    expect(called?.[2]?.deadline).toBeInstanceOf(Date);
    expect(called?.[2]?.messageToSigners).toBe("please sign");
  });

  it("initiate_signing passes undefined when no params", async () => {
    const initiate = vi.fn().mockResolvedValue({ ok: true });
    const args = contractsAgreementsInitiateSigning.inputSchema.parse({
      contractId: CID, agreementId: AID,
    });
    await contractsAgreementsInitiateSigning.handler(args, ctx(agClient({ initiateSigning: initiate })));
    expect(initiate).toHaveBeenCalledWith(CID, AID, undefined);
  });

  it("delete forwards both ids", async () => {
    const del = vi.fn().mockResolvedValue({ ok: true });
    const args = contractsAgreementsDelete.inputSchema.parse({ contractId: CID, agreementId: AID });
    await contractsAgreementsDelete.handler(args, ctx(agClient({ delete: del })));
    expect(del).toHaveBeenCalledWith(CID, AID);
  });
});
