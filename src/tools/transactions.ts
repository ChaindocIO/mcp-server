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

export const transactionsTools: ToolDefinition<unknown>[] = [
  transactionsListByContract as ToolDefinition<unknown>,
  transactionsGet as ToolDefinition<unknown>,
];
