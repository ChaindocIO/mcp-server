import { z } from "zod";
import { defineTool, type ToolDefinition } from "./types.js";

/**
 * Transactions API
 *   GET /contracts/:contractId/transactions
 *   GET /transactions/:transactionUuid
 *
 * Read-only inspection of payment transactions. Statuses:
 * INITIALISED, PENDING, SUCCESS, FAILED, CANCELLED.
 */

const ListInputSchema = z.object({
  contractId: z.string().uuid(),
  pageNumber: z.number().int().positive().default(1),
  pageSize: z.number().int().positive().max(100).default(10),
});

const GetInputSchema = z.object({
  transactionUuid: z.string().uuid(),
});

export const transactionsListByContract = defineTool({
  name: "chaindoc_transactions_list_by_contract",
  description: "List all transactions for a contract across its invoices.",
  inputSchema: ListInputSchema,
  handler: (args, { client }) =>
    client.run("chaindoc_transactions_list_by_contract", (sdk) =>
      sdk.transactions.listByContract(args.contractId, {
        pageNumber: args.pageNumber,
        pageSize: args.pageSize,
      }),
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
