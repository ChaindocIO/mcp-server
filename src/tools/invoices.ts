import { z } from "zod";
import { defineTool, type ToolDefinition } from "./types.js";
import { deliverDownload } from "../core/downloads.js";
import { confirmField, requireConfirmation } from "./confirm.js";
import { DecimalString } from "./schemas.js";

/**
 * Contract Invoices API
 *   POST   /api/v1/contracts/:contractId/invoices
 *   GET    /api/v1/contracts/:contractId/invoices              (paginated)
 *   GET    /api/v1/contracts/:contractId/invoices/:invoiceUuid
 *   POST   /api/v1/contracts/:contractId/invoices/:invoiceUuid/send
 *   POST   /api/v1/contracts/:contractId/invoices/:invoiceUuid/charge
 *   POST   /api/v1/contracts/:contractId/invoices/:invoiceUuid/mark-paid
 */

const InvoiceStatus = z.enum([
  "draft",
  "pending",
  "unpaid",
  "paid",
  "partially_paid",
  "overdue",
  "cancelled",
  "refunded",
]);

const LineItemSchema = z.object({
  description: z.string(),
  quantity: z.number().positive(),
  unitPrice: z.string().regex(/^\d+(\.\d{1,2})?$/),
});

const DiscountSchema = z.object({
  type: z.enum(["fixed", "percent"]),
  value: DecimalString.describe("A money amount for 'fixed', a 0-100 percentage for 'percent'. Applied before tax."),
});

const CreateInputSchema = z.object({
  contractId: z.string().uuid(),
  title: z.string().min(1).max(200),
  description: z.string().max(2000).optional(),
  amount: DecimalString,
  currencyCode: z.string().length(3).optional().describe("ISO-4217; omit for the contract's currency."),
  dueDate: z.string().datetime({ offset: true }),
  lineItems: z.array(LineItemSchema).max(50).optional(),
  discount: DiscountSchema.optional(),
  taxTreatmentId: z
    .string()
    .uuid()
    .optional()
    .describe("Id from chaindoc_tax_treatments_list. Omit for the counterparty's VAT setting, else the business default."),
  stripePaymentAllowed: z
    .boolean()
    .optional()
    .describe("Omit to inherit; false makes this invoice deliberately manual (no card payment)."),
  showUnpaid: z.boolean().optional().describe("Print what the partner still owes on other open invoices. Default true."),
  takePaidAhead: z.boolean().optional().describe("Take the partner's paid-ahead amount when sent. Default true."),
  sendImmediately: z.boolean().default(false),
  autoCharge: z.boolean().default(false),
  confirm: confirmField.describe(
    "Required (true) ONLY when autoCharge=true, because that charges the customer's saved payment method. " +
      "Set it only after the user confirmed the amount and customer.",
  ),
}).strict();

const ListInputSchema = z.object({
  contractId: z.string().uuid(),
  page: z.number().int().positive().default(1),
  limit: z.number().int().positive().max(100).default(10),
  status: InvoiceStatus.optional(),
  type: z.enum(["automatic", "manual"]).optional(),
  overdue: z.boolean().optional(),
});

const InvoiceIdInputSchema = z.object({
  contractId: z.string().uuid(),
  invoiceUuid: z.string().uuid(),
});

const SendInputSchema = z.object({
  contractId: z.string().uuid(),
  invoiceUuid: z.string().uuid(),
  autoCharge: z.boolean().default(false),
  confirm: confirmField.describe(
    "Required (true) ONLY when autoCharge=true (it charges the customer). Only after the user confirmed.",
  ),
});

const ChargeInputSchema = InvoiceIdInputSchema.extend({ confirm: confirmField });

const MarkPaidInputSchema = z.object({
  contractId: z.string().uuid(),
  invoiceUuid: z.string().uuid(),
  note: z.string().max(2000).optional(),
  paidAt: z.string().datetime({ offset: true }).optional().describe("When the money was received; defaults to now."),
  method: z.enum(["bank-transfer", "cash", "other"]).optional().describe("How the money came, as the record names it."),
  confirm: confirmField,
});

const CreditNoteInputSchema = z.object({
  contractId: z.string().uuid(),
  invoiceUuid: z.string().uuid(),
  lines: z
    .array(
      z.object({
        description: z.string().min(1),
        quantity: z.number().positive(),
        unitPrice: DecimalString,
        sourceLineIndex: z
          .number()
          .int()
          .nonnegative()
          .optional()
          .describe("The invoice line this reverses (its index); omit for a whole-invoice credit."),
      }),
    )
    .min(1)
    .max(50),
  reason: z.string().max(2000).optional(),
  confirm: confirmField,
});

export const invoicesCreate = defineTool({
  name: "chaindoc_invoices_create",
  description:
    "Create a manual invoice on an ACTIVE contract. Optional: `discount`, `taxTreatmentId` (chaindoc_tax_treatments_list), " +
    "`stripePaymentAllowed`, `showUnpaid`, `takePaidAhead`. Where the customer pays is never chosen here: the cascade " +
    "(contract > counterparty > business default) decides, and bank details are chosen in the Chaindoc app. " +
    "sendImmediately=true emails it right away. autoCharge=true CHARGES the customer's saved payment method: MONEY - " +
    "ask the user first and pass confirm=true only after they said yes.",
  inputSchema: CreateInputSchema,
  handler: async (args, { client }) => {
    const { contractId, confirm, ...payload } = args;
    if (payload.autoCharge) {
      requireConfirmation(confirm, `Creating invoice "${payload.title}" with autoCharge (charges the customer ${payload.amount})`);
    }
    return client.run("chaindoc_invoices_create", (sdk) => sdk.invoices.create(contractId, payload));
  },
});

export const invoicesList = defineTool({
  name: "chaindoc_invoices_list",
  description:
    "List invoices for a contract with pagination and optional status/type/overdue filters. Each invoice carries " +
    "creditedAmount, paidAheadAmount, canCancel, taxSummary and buyer/seller.",
  inputSchema: ListInputSchema,
  handler: (args, { client }) => {
    const { contractId, ...rest } = args;
    return client.run("chaindoc_invoices_list", (sdk) => sdk.invoices.list(contractId, rest));
  },
});

export const invoicesGet = defineTool({
  name: "chaindoc_invoices_get",
  description:
    "Fetch full invoice details: line items, transactions (with method and paidOn), the amounts (creditedAmount, " +
    "paidAheadAmount, remainingAmount), canCancel, tax summary, buyer/seller, and Stripe checkoutUrl if applicable. ",
  inputSchema: InvoiceIdInputSchema,
  handler: (args, { client }) =>
    client.run("chaindoc_invoices_get", (sdk) =>
      sdk.invoices.get(args.contractId, args.invoiceUuid),
    ),
});

export const invoicesSend = defineTool({
  name: "chaindoc_invoices_send",
  description:
    "Send a DRAFT invoice to the customer (emails it). autoCharge=true also CHARGES their saved payment method: MONEY - " +
    "ask the user first and pass confirm=true only after they said yes. Without autoCharge, confirm is not needed.",
  inputSchema: SendInputSchema,
  handler: async (args, { client }) => {
    if (args.autoCharge) {
      requireConfirmation(args.confirm, `Sending invoice ${args.invoiceUuid} with autoCharge (charges the customer)`);
    }
    return client.run("chaindoc_invoices_send", (sdk) =>
      sdk.invoices.send(args.contractId, args.invoiceUuid, { autoCharge: args.autoCharge }),
    );
  },
});

export const invoicesCharge = defineTool({
  name: "chaindoc_invoices_charge",
  description:
    "CHARGE an already-sent invoice to the customer's saved payment method (MONEY MOVES). Ask the user first: say which " +
    "invoice, the amount and the customer, and pass confirm=true only after they explicitly said yes. Not retried " +
    "automatically: after an uncertain failure read the invoice (chaindoc_invoices_get) before trying again. " +
    "Card payment switched off for the invoice/contract/partner is refused (STRIPE_NOT_ALLOWED_BY_CASCADE).",
  inputSchema: ChargeInputSchema,
  handler: async (args, { client }) => {
    requireConfirmation(args.confirm, `Charging invoice ${args.invoiceUuid}`);
    return client.run("chaindoc_invoices_charge", (sdk) =>
      sdk.invoices.charge(args.contractId, args.invoiceUuid),
    );
  },
});

export const invoicesMarkPaid = defineTool({
  name: "chaindoc_invoices_mark_paid",
  description:
    "Record that an invoice was paid OFFLINE (bank transfer, cash...). It books a payment on the ledger and settles the " +
    "invoice, so it is MONEY: ask the user first (which invoice, how much, when, how it came) and pass confirm=true only " +
    "after they explicitly said yes. `method`: 'bank-transfer' | 'cash' | 'other'; `paidAt`: when the money was received. " +
    "Not retried automatically; a payment recorded by mistake is removed in the Chaindoc app.",
  inputSchema: MarkPaidInputSchema,
  handler: async (args, { client }) => {
    requireConfirmation(args.confirm, `Marking invoice ${args.invoiceUuid} as paid`);
    const payload: { note?: string; paidAt?: string; method?: "bank-transfer" | "cash" | "other" } = {};
    if (args.note !== undefined) payload.note = args.note;
    if (args.paidAt !== undefined) payload.paidAt = args.paidAt;
    if (args.method !== undefined) payload.method = args.method;
    return client.run("chaindoc_invoices_mark_paid", (sdk) =>
      sdk.invoices.markPaid(args.contractId, args.invoiceUuid, payload),
    );
  },
});

export const invoicesListCreditNotes = defineTool({
  name: "chaindoc_invoices_list_credit_notes",
  description: "List the credit notes issued against an invoice (number, amount, lines, reason).",
  inputSchema: InvoiceIdInputSchema,
  handler: (args, { client }) =>
    client.run("chaindoc_invoices_list_credit_notes", (sdk) =>
      sdk.invoices.listCreditNotes(args.contractId, args.invoiceUuid),
    ),
});

export const invoicesCreateCreditNote = defineTool({
  name: "chaindoc_invoices_create_credit_note",
  description:
    "Credit an ISSUED invoice, in full or in part, with `lines` (sourceLineIndex reverses one invoice line; omit for a " +
    "whole-invoice credit). The invoice itself is not rewritten; money already paid in excess is REFUNDED on the original " +
    "rail, so this is MONEY: ask the user first (invoice, amount, reason) and pass confirm=true only after they explicitly " +
    "said yes. Not retried automatically: after an uncertain failure list the credit notes before trying again. " +
    "Use this instead of cancelling an invoice that money or a credit note already reached (INVOICE_MONEY_OR_CREDIT_NOTE).",
  inputSchema: CreditNoteInputSchema,
  handler: async (args, { client }) => {
    requireConfirmation(args.confirm, `Issuing a credit note on invoice ${args.invoiceUuid}`);
    const { contractId, invoiceUuid, lines, reason } = args;
    return client.run("chaindoc_invoices_create_credit_note", (sdk) =>
      sdk.invoices.createCreditNote(contractId, invoiceUuid, {
        lines,
        ...(reason !== undefined && { reason }),
      }),
    );
  },
});

const InvoiceTypeEnum = z.enum(["automatic", "manual"]);

const InvoiceListAllSchema = z.object({
  page: z.number().int().positive().default(1),
  limit: z.number().int().positive().max(100).default(20),
  status: InvoiceStatus.optional(),
  type: InvoiceTypeEnum.optional(),
  overdue: z.boolean().optional(),
  dueDateFrom: z.string().datetime({ offset: true }).optional(),
  dueDateTo: z.string().datetime({ offset: true }).optional(),
  search: z.string().optional(),
});

// strict() rejects unknown keys (esp. `amount`, which the SDK does not accept).
const InvoiceUpdateSchema = z
  .object({
    contractId: z.string().uuid(),
    invoiceUuid: z.string().uuid(),
    title: z.string().min(1).max(200).optional(),
    description: z.string().max(2000).optional(),
    dueDate: z.string().datetime({ offset: true }).optional(),
    lineItems: z.array(LineItemSchema).max(50).optional(),
    showUnpaid: z.boolean().optional(),
    takePaidAhead: z.boolean().optional(),
  })
  .strict();

export const invoicesListAll = defineTool({
  name: "chaindoc_invoices_list_all",
  description:
    "List invoices across all of the key owner's contracts. Response includes aggregate status counts.",
  inputSchema: InvoiceListAllSchema,
  handler: (args, { client }) =>
    client.run("chaindoc_invoices_list_all", (sdk) => sdk.invoices.listAll(args)),
});

export const invoicesUpdate = defineTool({
  name: "chaindoc_invoices_update",
  description:
    "Partial update of a DRAFT invoice. Supplied lineItems REPLACE the existing set. " +
    "Preconditions: invoice must be DRAFT. (Total amount is derived from line items; cannot be set directly.)",
  inputSchema: InvoiceUpdateSchema,
  handler: (args, { client }) => {
    const { contractId, invoiceUuid, ...patch } = args;
    return client.run("chaindoc_invoices_update", (sdk) =>
      sdk.invoices.update(contractId, invoiceUuid, patch),
    );
  },
});

export const invoicesCancel = defineTool({
  name: "chaindoc_invoices_cancel",
  description:
    "Cancel a draft / unpaid / overdue invoice. Voids any open Stripe checkout sessions. Check `canCancel` on the invoice " +
    "first: once money or a credit note reached it, this is refused (INVOICE_MONEY_OR_CREDIT_NOTE) - use " +
    "chaindoc_invoices_create_credit_note instead.",
  inputSchema: InvoiceIdInputSchema,
  handler: (args, { client }) =>
    client.run("chaindoc_invoices_cancel", (sdk) =>
      sdk.invoices.cancel(args.contractId, args.invoiceUuid),
    ),
});

export const invoicesDownloadPdf = defineTool({
  name: "chaindoc_invoices_download_pdf",
  description:
    "Download the invoice PDF. The PDF exists only after the invoice has been sent (404 for a draft).",
  inputSchema: InvoiceIdInputSchema,
  handler: (args, { client, downloads }) =>
    client.run("chaindoc_invoices_download_pdf", async (sdk) =>
      deliverDownload(downloads, await sdk.invoices.downloadPdf(args.contractId, args.invoiceUuid), {
        tool: "chaindoc_invoices_download_pdf",
      }),
    ),
});

export const invoicesTools: ToolDefinition<unknown>[] = [
  invoicesCreate as ToolDefinition<unknown>,
  invoicesList as ToolDefinition<unknown>,
  invoicesGet as ToolDefinition<unknown>,
  invoicesSend as ToolDefinition<unknown>,
  invoicesCharge as ToolDefinition<unknown>,
  invoicesMarkPaid as ToolDefinition<unknown>,
  invoicesListCreditNotes as ToolDefinition<unknown>,
  invoicesCreateCreditNote as ToolDefinition<unknown>,
  invoicesListAll as ToolDefinition<unknown>,
  invoicesUpdate as ToolDefinition<unknown>,
  invoicesCancel as ToolDefinition<unknown>,
  invoicesDownloadPdf as ToolDefinition<unknown>,
];
