import { describe, it, expect, vi } from "vitest";
import {
  invoicesCharge,
  invoicesMarkPaid,
  invoicesCreateCreditNote,
  invoicesListCreditNotes,
  invoicesCreate,
  invoicesSend,
  invoicesUpdate,
} from "../../src/tools/invoices.js";
import { ConfirmationRequiredError, toChaindocMcpError } from "../../src/core/errors.js";
import { fakeClient, fakeDownloads, fakeLogger } from "./_fakes.js";

const CID = "00000000-0000-0000-0000-000000000001";
const IID = "00000000-0000-0000-0000-000000000002";
const PID = "00000000-0000-0000-0000-000000000003";

const ctx = (invoices: Record<string, unknown>) => ({
  client: fakeClient({ invoices: invoices as never }),
  logger: fakeLogger(),
  downloads: fakeDownloads(),
});

describe("money tools refuse without the user's confirmation", () => {
  it("charge: refused, nothing is called", async () => {
    const charge = vi.fn();
    const args = invoicesCharge.inputSchema.parse({ contractId: CID, invoiceUuid: IID });
    expect(args.confirm).toBe(false);
    await expect(invoicesCharge.handler(args, ctx({ charge }))).rejects.toMatchObject({ name: "ConfirmationRequiredError" });
    expect(charge).not.toHaveBeenCalled();
  });

  it("charge: runs once confirmed", async () => {
    const charge = vi.fn().mockResolvedValue({ success: true });
    const args = invoicesCharge.inputSchema.parse({ contractId: CID, invoiceUuid: IID, confirm: true });
    await invoicesCharge.handler(args, ctx({ charge }));
    expect(charge).toHaveBeenCalledWith(CID, IID);
  });

  it("mark_paid: refused without confirm", async () => {
    const markPaid = vi.fn();
    const args = invoicesMarkPaid.inputSchema.parse({ contractId: CID, invoiceUuid: IID, method: "cash" });
    await expect(invoicesMarkPaid.handler(args, ctx({ markPaid }))).rejects.toMatchObject({ name: "ConfirmationRequiredError" });
    expect(markPaid).not.toHaveBeenCalled();
  });

  it("mark_paid: forwards method, paidAt and note once confirmed", async () => {
    const markPaid = vi.fn().mockResolvedValue({ success: true });
    const args = invoicesMarkPaid.inputSchema.parse({
      contractId: CID, invoiceUuid: IID, method: "bank-transfer", paidAt: "2026-11-01T00:00:00Z", note: "wire", confirm: true,
    });
    await invoicesMarkPaid.handler(args, ctx({ markPaid }));
    expect(markPaid).toHaveBeenCalledWith(CID, IID, { method: "bank-transfer", paidAt: "2026-11-01T00:00:00Z", note: "wire" });
  });

  it("mark_paid rejects a method the record does not know", () => {
    expect(() => invoicesMarkPaid.inputSchema.parse({ contractId: CID, invoiceUuid: IID, method: "bitcoin" })).toThrow();
  });

  it("credit note: refused without confirm", async () => {
    const createCreditNote = vi.fn();
    const args = invoicesCreateCreditNote.inputSchema.parse({
      contractId: CID, invoiceUuid: IID, lines: [{ description: "Refund", quantity: 1, unitPrice: "50.00" }],
    });
    await expect(invoicesCreateCreditNote.handler(args, ctx({ createCreditNote }))).rejects.toMatchObject({
      name: "ConfirmationRequiredError",
    });
    expect(createCreditNote).not.toHaveBeenCalled();
  });

  it("credit note: forwards lines and reason once confirmed", async () => {
    const createCreditNote = vi.fn().mockResolvedValue({ id: "cn" });
    const args = invoicesCreateCreditNote.inputSchema.parse({
      contractId: CID, invoiceUuid: IID, reason: "Returned",
      lines: [{ description: "Refund", quantity: 1, unitPrice: "50.00", sourceLineIndex: 0 }],
      confirm: true,
    });
    await invoicesCreateCreditNote.handler(args, ctx({ createCreditNote }));
    expect(createCreditNote).toHaveBeenCalledWith(CID, IID, {
      lines: [{ description: "Refund", quantity: 1, unitPrice: "50.00", sourceLineIndex: 0 }],
      reason: "Returned",
    });
  });

  it("list credit notes needs no confirmation", async () => {
    const listCreditNotes = vi.fn().mockResolvedValue([]);
    await invoicesListCreditNotes.handler(
      invoicesListCreditNotes.inputSchema.parse({ contractId: CID, invoiceUuid: IID }),
      ctx({ listCreditNotes }),
    );
    expect(listCreditNotes).toHaveBeenCalledWith(CID, IID);
  });

  it("autoCharge on send needs confirmation; a plain send does not", async () => {
    const send = vi.fn().mockResolvedValue({ success: true });
    const charging = invoicesSend.inputSchema.parse({ contractId: CID, invoiceUuid: IID, autoCharge: true });
    await expect(invoicesSend.handler(charging, ctx({ send }))).rejects.toMatchObject({ name: "ConfirmationRequiredError" });
    expect(send).not.toHaveBeenCalled();
    await invoicesSend.handler(invoicesSend.inputSchema.parse({ contractId: CID, invoiceUuid: IID }), ctx({ send }));
    expect(send).toHaveBeenCalledWith(CID, IID, { autoCharge: false });
  });

  it("autoCharge on create needs confirmation", async () => {
    const create = vi.fn().mockResolvedValue({ success: true });
    const args = invoicesCreate.inputSchema.parse({
      contractId: CID, title: "T", amount: "10.00", dueDate: "2027-01-01T00:00:00Z", autoCharge: true,
    });
    await expect(invoicesCreate.handler(args, ctx({ create }))).rejects.toMatchObject({ name: "ConfirmationRequiredError" });
    expect(create).not.toHaveBeenCalled();
  });

  it("the refusal tells the agent to ask the user", () => {
    const mapped = toChaindocMcpError(new ConfirmationRequiredError("Charging invoice X"));
    expect(mapped.code).toBe("confirmation_required");
    expect(mapped.hint).toMatch(/ask the user/i);
  });

  it("every money tool description tells the agent to ask the user first", () => {
    for (const t of [invoicesCharge, invoicesMarkPaid, invoicesCreateCreditNote]) {
      expect(t.description, t.name).toMatch(/ask the user/i);
      expect(t.description, t.name).toContain("confirm=true");
    }
  });
});

describe("new invoice fields", () => {
  it("create forwards discount, tax treatment and flags", async () => {
    const create = vi.fn().mockResolvedValue({ success: true });
    const args = invoicesCreate.inputSchema.parse({
      contractId: CID,
      title: "T",
      amount: "100.00",
      dueDate: "2027-01-01T00:00:00Z",
      discount: { type: "percent", value: "10" },
      taxTreatmentId: PID,
      stripePaymentAllowed: false,
      showUnpaid: false,
      takePaidAhead: false,
    });
    await invoicesCreate.handler(args, ctx({ create }));
    expect(create.mock.calls[0]![1]).toMatchObject({
      discount: { type: "percent", value: "10" },
      taxTreatmentId: PID,
      stripePaymentAllowed: false,
      showUnpaid: false,
      takePaidAhead: false,
      autoCharge: false,
    });
  });

  it("neither create nor update takes a payment instruction (bank details are read only here)", () => {
    expect(() =>
      invoicesCreate.inputSchema.parse({
        contractId: CID,
        title: "T",
        amount: "100.00",
        dueDate: "2027-01-01T00:00:00Z",
        paymentInstructionId: PID,
      }),
    ).toThrow();
    expect(() =>
      invoicesUpdate.inputSchema.parse({ contractId: CID, invoiceUuid: IID, paymentInstructionId: null }),
    ).toThrow();
  });
});

describe("money refusals carry the server's errorKey and a hint", () => {
  it("INVOICE_MONEY_OR_CREDIT_NOTE points at credit notes", () => {
    const err = Object.assign(new Error("Money already reached this invoice"), {
      statusCode: 409,
      errorKey: "INVOICE_MONEY_OR_CREDIT_NOTE",
    });
    const mapped = toChaindocMcpError(err);
    expect(mapped.errorKey).toBe("INVOICE_MONEY_OR_CREDIT_NOTE");
    expect(mapped.hint).toContain("credit note");
  });

  it("a Stripe cascade refusal passes its key", () => {
    const err = Object.assign(new Error("Card payment is off"), { statusCode: 400, errorKey: "STRIPE_NOT_ALLOWED_BY_CASCADE" });
    expect(toChaindocMcpError(err)).toMatchObject({ errorKey: "STRIPE_NOT_ALLOWED_BY_CASCADE", httpStatus: 400 });
  });
});
