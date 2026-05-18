import { describe, it, expect, vi } from "vitest";
import {
  contractsTerminationGet,
  contractsTerminationGetStatus,
  contractsTerminationGetHistory,
  contractsTerminationApprove,
  contractsTerminationReject,
  contractsTerminationCancel,
} from "../../src/tools/contracts-termination.js";
import { fakeClient, fakeDownloads, fakeLogger } from "./_fakes.js";

const CID = "00000000-0000-0000-0000-000000000001";

function termClient(fns: Record<string, ReturnType<typeof vi.fn>>) {
  return fakeClient({
    contracts: {
      termination: {
        get: fns["get"] ?? vi.fn(),
        getStatus: fns["getStatus"] ?? vi.fn(),
        getHistory: fns["getHistory"] ?? vi.fn(),
        approve: fns["approve"] ?? vi.fn(),
        reject: fns["reject"] ?? vi.fn(),
        cancel: fns["cancel"] ?? vi.fn(),
      },
    } as never,
  });
}
const ctx = (client = termClient({})) => ({ client, logger: fakeLogger(), downloads: fakeDownloads() });

describe("contracts termination", () => {
  it("get forwards contractId", async () => {
    const get = vi.fn().mockResolvedValue({ terminationRequest: null });
    const args = contractsTerminationGet.inputSchema.parse({ contractId: CID });
    await contractsTerminationGet.handler(args, ctx(termClient({ get })));
    expect(get).toHaveBeenCalledWith(CID);
  });

  it("get_status forwards contractId", async () => {
    const getStatus = vi.fn().mockResolvedValue({ status: {} });
    const args = contractsTerminationGetStatus.inputSchema.parse({ contractId: CID });
    await contractsTerminationGetStatus.handler(args, ctx(termClient({ getStatus })));
    expect(getStatus).toHaveBeenCalledWith(CID);
  });

  it("get_history forwards contractId", async () => {
    const getHistory = vi.fn().mockResolvedValue({ items: [], total: 0 });
    const args = contractsTerminationGetHistory.inputSchema.parse({ contractId: CID });
    await contractsTerminationGetHistory.handler(args, ctx(termClient({ getHistory })));
    expect(getHistory).toHaveBeenCalledWith(CID);
  });

  it("approve forwards optional comment", async () => {
    const approve = vi.fn().mockResolvedValue({ ok: true });
    const args = contractsTerminationApprove.inputSchema.parse({ contractId: CID, comment: "ok by us" });
    await contractsTerminationApprove.handler(args, ctx(termClient({ approve })));
    expect(approve).toHaveBeenCalledWith(CID, { comment: "ok by us" });
  });

  it("approve passes undefined when comment absent", async () => {
    const approve = vi.fn().mockResolvedValue({ ok: true });
    const args = contractsTerminationApprove.inputSchema.parse({ contractId: CID });
    await contractsTerminationApprove.handler(args, ctx(termClient({ approve })));
    expect(approve).toHaveBeenCalledWith(CID, undefined);
  });

  it("reject requires non-empty reason", () => {
    expect(() =>
      contractsTerminationReject.inputSchema.parse({ contractId: CID, reason: "" }),
    ).toThrow();
  });

  it("reject forwards reason", async () => {
    const reject = vi.fn().mockResolvedValue({ ok: true });
    const args = contractsTerminationReject.inputSchema.parse({
      contractId: CID,
      reason: "outstanding invoices",
    });
    await contractsTerminationReject.handler(args, ctx(termClient({ reject })));
    expect(reject).toHaveBeenCalledWith(CID, { reason: "outstanding invoices" });
  });

  it("cancel forwards contractId", async () => {
    const cancel = vi.fn().mockResolvedValue({ ok: true });
    const args = contractsTerminationCancel.inputSchema.parse({ contractId: CID });
    await contractsTerminationCancel.handler(args, ctx(termClient({ cancel })));
    expect(cancel).toHaveBeenCalledWith(CID);
  });
});
