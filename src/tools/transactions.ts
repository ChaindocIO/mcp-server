import { z } from "zod";
import { defineTool, type ToolDefinition } from "./types.js";

/**
 * Transactions API
 *   GET /api/v1/contracts/:contractId/transactions
 *   GET /api/v1/transactions/:transactionUuid
 *
 * Read-only inspection of payment transactions. Statuses:
 * INITIALISED, PENDING, SUCCESS, FAILED, CANCELLED.
 */

const ListInputSchema = z.object({
  contractId: z.string().uuid(),
});

const GetInputSchema = z.object({
  transactionUuid: z.string().uuid(),
});

export const transactionsListByContract = defineTool({
  name: "chaindoc_transactions_list_by_contract",
  description:
    "List all transactions for a contract across its invoices. " +
    "The endpoint is non-paginated — all transactions are returned in a single response.",
  inputSchema: ListInputSchema,
  handler: (args, { client }) =>
    client.run("chaindoc_transactions_list_by_contract", (sdk) =>
      sdk.transactions.listByContract(args.contractId),
    ),
});

export const transactionsGet = defineTool({
  name: "chaindoc_transactions_get",
  description:
    "Fetch one transaction by UUID with full details: amounts, fees, retry metadata, Stripe receipt URL.",
  inputSchema: GetInputSchema,
  handler: (args, { client }) =>
    client.run("chaindoc_transactions_get", (sdk) => sdk.transactions.get(args.transactionUuid)),
});

const TransactionStatusEnum = z.enum([
  "INITIALISED",
  "PENDING",
  "SUCCESS",
  "FAILED",
  "CANCELLED",
]);

const PaymentMixSchema = z.object({
  from: z.string().datetime({ offset: true }),
  to: z.string().datetime({ offset: true }),
  status: TransactionStatusEnum.optional(),
  contractUuid: z.string().uuid().optional(),
  currencyCode: z.string().length(3).optional(),
});

const FeeEstimateSchema = z.object({
  amount: z.number().nonnegative(),
  currency: z.string().length(3),
  platformFeePercent: z.number().min(0).max(100).optional(),
});

export const transactionsGetPaymentMix = defineTool({
  name: "chaindoc_transactions_get_payment_mix",
  description:
    "Analytics: payment totals grouped by payment-method type for a date range. " +
    "`from` and `to` are REQUIRED ISO datetimes.",
  inputSchema: PaymentMixSchema,
  handler: (args, { client }) =>
    client.run("chaindoc_transactions_get_payment_mix", (sdk) =>
      sdk.transactions.getPaymentMix(args),
    ),
});

export const transactionsGetFeeEstimate = defineTool({
  name: "chaindoc_transactions_get_fee_estimate",
  description:
    "Pure calculator: Stripe + platform fee per payment method for { amount, currency, platformFeePercent? }. " +
    "No contract data involved. `amount` is a numeric value (not a string).",
  inputSchema: FeeEstimateSchema,
  handler: (args, { client }) =>
    client.run("chaindoc_transactions_get_fee_estimate", (sdk) =>
      sdk.transactions.getFeeEstimate(args),
    ),
});

export const transactionsTools: ToolDefinition<unknown>[] = [
  transactionsListByContract as ToolDefinition<unknown>,
  transactionsGet as ToolDefinition<unknown>,
  transactionsGetPaymentMix as ToolDefinition<unknown>,
  transactionsGetFeeEstimate as ToolDefinition<unknown>,
];
