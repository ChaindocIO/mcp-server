import { z } from "zod";
import { defineTool, type ToolDefinition } from "./types.js";

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

const CreateInputSchema = z.object({
  contractId: z.string().uuid(),
  title: z.string().min(1).max(200),
  description: z.string().max(2000).optional(),
  amount: z.string().regex(/^\d+(\.\d{1,2})?$/),
  currencyCode: z.string().length(3),
  dueDate: z.string().datetime({ offset: true }),
  lineItems: z.array(LineItemSchema).max(50).optional(),
  sendImmediately: z.boolean().default(false),
  autoCharge: z.boolean().default(false),
});

const ListInputSchema = z.object({
  contractId: z.string().uuid(),
  page: z.number().int().positive().default(1),
  limit: z.number().int().positive().max(100).default(10),
  status: InvoiceStatus.optional(),
});

const InvoiceIdInputSchema = z.object({
  contractId: z.string().uuid(),
  invoiceUuid: z.string().uuid(),
});

const SendInputSchema = z.object({
  contractId: z.string().uuid(),
  invoiceUuid: z.string().uuid(),
  autoCharge: z.boolean().default(false),
});

const MarkPaidInputSchema = z.object({
  contractId: z.string().uuid(),
  invoiceUuid: z.string().uuid(),
  note: z.string().max(2000).optional(),
  paidAt: z.string().datetime({ offset: true }).optional(),
});

export const invoicesCreate = defineTool({
  name: "chaindoc_invoices_create",
  description:
    "Create a manual invoice on an ACTIVE contract. Set sendImmediately=true to dispatch right away, " +
    "and autoCharge=true to charge the contragent's saved payment method on send.",
  inputSchema: CreateInputSchema,
  handler: (args, { client }) => {
    const { contractId, ...payload } = args;
    return client.run("chaindoc_invoices_create", (sdk) =>
      sdk.invoices.create(contractId, payload),
    );
  },
});

export const invoicesList = defineTool({
  name: "chaindoc_invoices_list",
  description: "List invoices for a contract with pagination and optional status filter.",
  inputSchema: ListInputSchema,
  handler: (args, { client }) => {
    const { contractId, ...rest } = args;
    return client.run("chaindoc_invoices_list", (sdk) => sdk.invoices.list(contractId, rest));
  },
});

export const invoicesGet = defineTool({
  name: "chaindoc_invoices_get",
  description:
    "Fetch full invoice details: line items, transactions, and Stripe checkoutUrl if applicable.",
  inputSchema: InvoiceIdInputSchema,
  handler: (args, { client }) =>
    client.run("chaindoc_invoices_get", (sdk) =>
      sdk.invoices.get(args.contractId, args.invoiceUuid),
    ),
});

export const invoicesSend = defineTool({
  name: "chaindoc_invoices_send",
  description:
    "Send a DRAFT invoice. autoCharge=true attempts immediate charge of the saved payment method.",
  inputSchema: SendInputSchema,
  handler: (args, { client }) =>
    client.run("chaindoc_invoices_send", (sdk) =>
      sdk.invoices.send(args.contractId, args.invoiceUuid, { autoCharge: args.autoCharge }),
    ),
});

export const invoicesCharge = defineTool({
  name: "chaindoc_invoices_charge",
  description:
    "Charge an already-sent invoice using the contragent's saved payment method. Useful for retrying failed payments.",
  inputSchema: InvoiceIdInputSchema,
  handler: (args, { client }) =>
    client.run("chaindoc_invoices_charge", (sdk) =>
      sdk.invoices.charge(args.contractId, args.invoiceUuid),
    ),
});

export const invoicesMarkPaid = defineTool({
  name: "chaindoc_invoices_mark_paid",
  description:
    "Record an offline settlement (wire transfer, cash, etc.). Creates a manual transaction for audit.",
  inputSchema: MarkPaidInputSchema,
  handler: (args, { client }) => {
    const payload: { note?: string; paidAt?: string } = {};
    if (args.note !== undefined) payload.note = args.note;
    if (args.paidAt !== undefined) payload.paidAt = args.paidAt;
    return client.run("chaindoc_invoices_mark_paid", (sdk) =>
      sdk.invoices.markPaid(args.contractId, args.invoiceUuid, payload),
    );
  },
});

export const invoicesTools: ToolDefinition<unknown>[] = [
  invoicesCreate as ToolDefinition<unknown>,
  invoicesList as ToolDefinition<unknown>,
  invoicesGet as ToolDefinition<unknown>,
  invoicesSend as ToolDefinition<unknown>,
  invoicesCharge as ToolDefinition<unknown>,
  invoicesMarkPaid as ToolDefinition<unknown>,
];
