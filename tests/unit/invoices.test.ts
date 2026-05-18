import { describe, it, expect, vi } from "vitest";
import {
  invoicesListAll,
  invoicesUpdate,
  invoicesCancel,
  invoicesDownloadPdf,
} from "../../src/tools/invoices.js";
import { fakeClient, fakeDownloads, fakeLogger } from "./_fakes.js";

const CID = "00000000-0000-0000-0000-000000000001";
const IID = "00000000-0000-0000-0000-000000000002";

function invClient(fns: Record<string, ReturnType<typeof vi.fn>>) {
  return fakeClient({
    invoices: {
      create: vi.fn(),
      list: vi.fn(),
      get: vi.fn(),
      send: vi.fn(),
      charge: vi.fn(),
      markPaid: vi.fn(),
      listAll: fns["listAll"] ?? vi.fn(),
      update: fns["update"] ?? vi.fn(),
      cancel: fns["cancel"] ?? vi.fn(),
      downloadPdf: fns["downloadPdf"] ?? vi.fn(),
    } as never,
  });
}
const ctx = (client = invClient({})) => ({
  client,
  logger: fakeLogger(),
  downloads: fakeDownloads(),
});

describe("invoices additions", () => {
  it("list_all forwards filters with defaults", async () => {
    const listAll = vi.fn().mockResolvedValue({ invoices: [] });
    const args = invoicesListAll.inputSchema.parse({});
    await invoicesListAll.handler(args, ctx(invClient({ listAll })));
    expect(listAll).toHaveBeenCalledWith({ page: 1, limit: 20 });
  });

  it("list_all forwards search + status", async () => {
    const listAll = vi.fn().mockResolvedValue({ invoices: [] });
    const args = invoicesListAll.inputSchema.parse({
      search: "Acme",
      status: "paid",
      overdue: false,
    });
    await invoicesListAll.handler(args, ctx(invClient({ listAll })));
    expect(listAll).toHaveBeenCalledWith({
      page: 1,
      limit: 20,
      search: "Acme",
      status: "paid",
      overdue: false,
    });
  });

  it("update partial forwards only provided fields", async () => {
    const update = vi.fn().mockResolvedValue({ invoice: {} });
    const args = invoicesUpdate.inputSchema.parse({
      contractId: CID,
      invoiceUuid: IID,
      title: "Renamed",
    });
    await invoicesUpdate.handler(args, ctx(invClient({ update })));
    expect(update).toHaveBeenCalledWith(CID, IID, { title: "Renamed" });
  });

  it("update rejects amount field (not in UpdateInvoiceParams)", () => {
    expect(() =>
      invoicesUpdate.inputSchema.parse({
        contractId: CID,
        invoiceUuid: IID,
        amount: "100.00",
      })
    ).toThrow();
  });

  it("cancel forwards both ids", async () => {
    const cancel = vi.fn().mockResolvedValue({ ok: true });
    const args = invoicesCancel.inputSchema.parse({
      contractId: CID,
      invoiceUuid: IID,
    });
    await invoicesCancel.handler(args, ctx(invClient({ cancel })));
    expect(cancel).toHaveBeenCalledWith(CID, IID);
  });

  it("download_pdf routes through adapter", async () => {
    const downloadPdf = vi
      .fn()
      .mockResolvedValue({
        data: new TextEncoder().encode("invoice-pdf").buffer,
        contentType: "application/pdf",
      });
    const args = invoicesDownloadPdf.inputSchema.parse({
      contractId: CID,
      invoiceUuid: IID,
    });
    const r = await invoicesDownloadPdf.handler(args, {
      client: invClient({ downloadPdf }),
      logger: fakeLogger(),
      downloads: fakeDownloads({ mode: "inline" }),
    });
    expect(downloadPdf).toHaveBeenCalledWith(CID, IID);
    expect((r as { kind: string }).kind).toBe("inline");
  });
});
