import { describe, it, expect, vi } from "vitest";
import { transactionsGetPaymentMix, transactionsGetFeeEstimate } from "../../src/tools/transactions.js";
import { fakeClient, fakeDownloads, fakeLogger } from "./_fakes.js";

function txClient(fns: Record<string, ReturnType<typeof vi.fn>>) {
  return fakeClient({
    transactions: {
      listByContract: vi.fn(),
      get: vi.fn(),
      getPaymentMix: fns["getPaymentMix"] ?? vi.fn(),
      getFeeEstimate: fns["getFeeEstimate"] ?? vi.fn(),
    } as never,
  });
}

const ctx = (client = txClient({})) => ({
  client,
  logger: fakeLogger(),
  downloads: fakeDownloads(),
});

describe("transactions analytics", () => {
  it("get_payment_mix requires from + to", () => {
    expect(() => transactionsGetPaymentMix.inputSchema.parse({})).toThrow();
    expect(() =>
      transactionsGetPaymentMix.inputSchema.parse({
        from: "2026-01-01T00:00:00Z",
      }),
    ).toThrow();
  });

  it("get_payment_mix forwards filters", async () => {
    const fn = vi.fn().mockResolvedValue({ methods: [] });
    const args = transactionsGetPaymentMix.inputSchema.parse({
      from: "2026-01-01T00:00:00Z",
      to: "2026-12-31T23:59:59Z",
      currencyCode: "USD",
    });
    await transactionsGetPaymentMix.handler(args, ctx(txClient({ getPaymentMix: fn })));
    expect(fn).toHaveBeenCalledWith({
      from: "2026-01-01T00:00:00Z",
      to: "2026-12-31T23:59:59Z",
      currencyCode: "USD",
    });
  });

  it("get_fee_estimate takes amount as NUMBER", async () => {
    const fn = vi.fn().mockResolvedValue({ methods: [] });
    const args = transactionsGetFeeEstimate.inputSchema.parse({
      amount: 100.5,
      currency: "USD",
    });
    await transactionsGetFeeEstimate.handler(args, ctx(txClient({ getFeeEstimate: fn })));
    expect(fn).toHaveBeenCalledWith({ amount: 100.5, currency: "USD" });
  });

  it("get_fee_estimate rejects negative amount", () => {
    expect(() =>
      transactionsGetFeeEstimate.inputSchema.parse({
        amount: -10,
        currency: "USD",
      }),
    ).toThrow();
  });
});
