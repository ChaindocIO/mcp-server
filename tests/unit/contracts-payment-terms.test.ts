import { describe, it, expect, vi } from "vitest";
import {
  contractsPaymentTermsList,
  contractsPaymentTermsCreate,
  contractsPaymentTermsUpdate,
  contractsPaymentTermsDelete,
} from "../../src/tools/contracts-payment-terms.js";
import { fakeClient, fakeDownloads, fakeLogger } from "./_fakes.js";

const CID = "00000000-0000-0000-0000-000000000001";
const TID = "00000000-0000-0000-0000-000000000002";

function ptClient(fns: Record<string, ReturnType<typeof vi.fn>>) {
  return fakeClient({
    contracts: {
      paymentTerms: {
        list: fns["list"] ?? vi.fn(),
        create: fns["create"] ?? vi.fn(),
        update: fns["update"] ?? vi.fn(),
        delete: fns["delete"] ?? vi.fn(),
      },
    } as never,
  });
}
const ctx = (client = ptClient({})) => ({ client, logger: fakeLogger(), downloads: fakeDownloads() });

describe("contracts payment terms", () => {
  it("list forwards contractId", async () => {
    const list = vi.fn().mockResolvedValue({ items: [] });
    const args = contractsPaymentTermsList.inputSchema.parse({ contractId: CID });
    await contractsPaymentTermsList.handler(args, ctx(ptClient({ list })));
    expect(list).toHaveBeenCalledWith(CID);
  });

  it("create forwards term body (no currencyCode)", async () => {
    const create = vi.fn().mockResolvedValue({ paymentTerm: {} });
    const args = contractsPaymentTermsCreate.inputSchema.parse({
      contractId: CID,
      type: "one_time",
      name: "Deposit",
      amount: "500.00",
      dueDate: "2026-06-01T00:00:00Z",
    });
    await contractsPaymentTermsCreate.handler(args, ctx(ptClient({ create })));
    expect(create).toHaveBeenCalledWith(CID, {
      type: "one_time",
      name: "Deposit",
      amount: "500.00",
      dueDate: "2026-06-01T00:00:00Z",
    });
  });

  it("create rejects unknown `currencyCode` key", () => {
    expect(() =>
      contractsPaymentTermsCreate.inputSchema.parse({
        contractId: CID,
        type: "one_time",
        name: "Deposit",
        amount: "500.00",
        dueDate: "2026-06-01T00:00:00Z",
        currencyCode: "USD",
      }),
    ).toThrow();
  });

  it("update is partial — only name", async () => {
    const update = vi.fn().mockResolvedValue({ paymentTerm: {} });
    const args = contractsPaymentTermsUpdate.inputSchema.parse({
      contractId: CID,
      termId: TID,
      name: "Renamed",
    });
    await contractsPaymentTermsUpdate.handler(args, ctx(ptClient({ update })));
    expect(update).toHaveBeenCalledWith(CID, TID, { name: "Renamed" });
  });

  it("update rejects `type` field (not allowed in update)", () => {
    expect(() =>
      contractsPaymentTermsUpdate.inputSchema.parse({
        contractId: CID,
        termId: TID,
        type: "recurring",
      }),
    ).toThrow();
  });

  it("delete forwards both ids", async () => {
    const del = vi.fn().mockResolvedValue({ ok: true });
    const args = contractsPaymentTermsDelete.inputSchema.parse({ contractId: CID, termId: TID });
    await contractsPaymentTermsDelete.handler(args, ctx(ptClient({ delete: del })));
    expect(del).toHaveBeenCalledWith(CID, TID);
  });
});
