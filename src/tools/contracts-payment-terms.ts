import { z } from "zod";
import { defineTool, type ToolDefinition } from "./types.js";

// strict() rejects unknown keys (esp. currencyCode, which is inherited).
const PaymentTermCreateSchema = z
  .object({
    contractId: z.string().uuid(),
    type: z.enum(["deposit", "recurring", "one_time"]),
    name: z.string(),
    description: z.string().optional(),
    amount: z.string().regex(/^\d+(\.\d{1,2})?$/),
    frequency: z.enum(["weekly", "biweekly", "monthly", "quarterly", "yearly"]).optional(),
    dayOfPeriod: z.number().int().min(1).max(28).optional(),
    startDate: z.string().datetime({ offset: true }).optional(),
    endDate: z.string().datetime({ offset: true }).optional(),
    totalPayments: z.number().int().positive().optional(),
    dueDate: z.string().datetime({ offset: true }).optional(),
    autoCharge: z.boolean().optional(),
  })
  .strict();

// strict() rejects unknown keys (esp. `type` and `currencyCode`).
const PaymentTermUpdateSchema = z
  .object({
    contractId: z.string().uuid(),
    termId: z.string().uuid(),
    name: z.string().optional(),
    amount: z.string().regex(/^\d+(\.\d{1,2})?$/).optional(),
    description: z.string().optional(),
    frequency: z.enum(["weekly", "biweekly", "monthly", "quarterly", "yearly"]).optional(),
    dayOfPeriod: z.number().int().min(1).max(28).optional(),
    startDate: z.string().datetime({ offset: true }).optional(),
    endDate: z.string().datetime({ offset: true }).optional(),
    totalPayments: z.number().int().positive().optional(),
    dueDate: z.string().datetime({ offset: true }).optional(),
    autoCharge: z.boolean().optional(),
    isActive: z.boolean().optional(),
  })
  .strict();

const PaymentTermDeleteSchema = z.object({
  contractId: z.string().uuid(),
  termId: z.string().uuid(),
});

export const contractsPaymentTermsList = defineTool({
  name: "chaindoc_contracts_payment_terms_list",
  description: "List all payment terms on a contract.",
  inputSchema: z.object({ contractId: z.string().uuid() }),
  handler: (args, { client }) =>
    client.run("chaindoc_contracts_payment_terms_list", (sdk) =>
      sdk.contracts.paymentTerms.list(args.contractId),
    ),
});

export const contractsPaymentTermsCreate = defineTool({
  name: "chaindoc_contracts_payment_terms_create",
  description:
    "Add a payment term to a DRAFT contract. currencyCode is inherited from the contract and not accepted. " +
    "one_time terms typically need amount + dueDate. Preconditions: contract must be in DRAFT.",
  inputSchema: PaymentTermCreateSchema,
  handler: (args, { client }) => {
    const { contractId, ...payload } = args;
    return client.run("chaindoc_contracts_payment_terms_create", (sdk) =>
      sdk.contracts.paymentTerms.create(contractId, payload),
    );
  },
});

export const contractsPaymentTermsUpdate = defineTool({
  name: "chaindoc_contracts_payment_terms_update",
  description:
    "Partial update of a payment term. `type` cannot be changed. Preconditions: parent contract must be in DRAFT.",
  inputSchema: PaymentTermUpdateSchema,
  handler: (args, { client }) => {
    const { contractId, termId, ...patch } = args;
    return client.run("chaindoc_contracts_payment_terms_update", (sdk) =>
      sdk.contracts.paymentTerms.update(contractId, termId, patch),
    );
  },
});

export const contractsPaymentTermsDelete = defineTool({
  name: "chaindoc_contracts_payment_terms_delete",
  description: "Delete a payment term. Preconditions: parent contract must be in DRAFT.",
  inputSchema: PaymentTermDeleteSchema,
  handler: (args, { client }) =>
    client.run("chaindoc_contracts_payment_terms_delete", (sdk) =>
      sdk.contracts.paymentTerms.delete(args.contractId, args.termId),
    ),
});

export const contractsPaymentTermsTools: ToolDefinition<unknown>[] = [
  contractsPaymentTermsList as ToolDefinition<unknown>,
  contractsPaymentTermsCreate as ToolDefinition<unknown>,
  contractsPaymentTermsUpdate as ToolDefinition<unknown>,
  contractsPaymentTermsDelete as ToolDefinition<unknown>,
];
