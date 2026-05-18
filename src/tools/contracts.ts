import { z } from "zod";
import { defineTool, type ToolDefinition } from "./types.js";

/**
 * Contracts API
 *   POST   /api/v1/contracts
 *   GET    /api/v1/contracts                              (paginated)
 *   GET    /api/v1/contracts/:contractId
 *   GET    /api/v1/contracts/:contractId/status
 *   GET    /api/v1/contracts/:contractId/activities
 *   POST   /api/v1/contracts/:contractId/payment-setup
 *   POST   /api/v1/contracts/:contractId/send
 *   POST   /api/v1/contracts/:contractId/cancel
 *   POST   /api/v1/contracts/:contractId/terminate
 */

const PreferredPaymentMethodEnum = z.enum(["card", "bank_transfer"]);

const PaymentTermSchema = z.object({
  type: z.enum(["deposit", "recurring", "one_time"]),
  name: z.string(),
  description: z.string().optional(),
  amount: z.string().regex(/^\d+(\.\d{1,2})?$/, "decimal string e.g. '5000.00'"),
  frequency: z.enum(["weekly", "biweekly", "monthly", "quarterly", "yearly"]).optional(),
  dayOfPeriod: z.number().int().min(1).max(28).optional(),
  startDate: z.string().datetime({ offset: true }).optional(),
  endDate: z.string().datetime({ offset: true }).optional(),
  totalPayments: z.number().int().positive().optional(),
  dueDate: z.string().datetime({ offset: true }).optional(),
  autoCharge: z.boolean().optional(),
});

const ContragentSchema = z.object({
  email: z.string().email(),
  name: z.string().optional(),
  phone: z.string().optional(),
  taxId: z.string().optional(),
  billingAddress: z
    .object({
      line1: z.string(),
      line2: z.string().optional(),
      city: z.string(),
      state: z.string().optional(),
      postalCode: z.string(),
      country: z.string().length(2).describe("ISO-3166-1 alpha-2"),
    })
    .optional(),
});

/**
 * Contract signing policy. The contragent slot is always 'embedded' — only the
 * business slot can be 'delegated' (signed via API by the key owner).
 */
const SigningPolicySchema = z.object({
  business: z.enum(["embedded", "delegated"]).optional(),
  contragent: z.literal("embedded").optional(),
});

const CreateInputSchema = z.object({
  documentId: z.string().uuid(),
  title: z.string().min(1).max(200),
  description: z.string().max(2000).optional(),
  contragent: ContragentSchema,
  startDate: z.string().datetime({ offset: true }).optional(),
  endDate: z.string().datetime({ offset: true }).optional(),
  autoRenew: z.boolean().optional(),
  currencyCode: z.string().length(3).describe("ISO-4217, e.g. USD"),
  terminationType: z.enum(["mutual_approval", "one_side"]).optional(),
  noticePeriodDays: z.number().int().nonnegative().optional(),
  paymentTerms: z.array(PaymentTermSchema).optional(),
  paymentMethodRequired: z.boolean().optional(),
  preferredPaymentMethodType: PreferredPaymentMethodEnum.optional(),
  signingPolicy: SigningPolicySchema.optional(),
});

const ContractStatus = z.enum([
  "draft",
  "pending_signature",
  "active",
  "pending_amendment",
  "suspended",
  "termination_pending",
  "terminated",
  "expired",
  "rejected",
]);

const ListInputSchema = z.object({
  page: z.number().int().positive().default(1),
  limit: z.number().int().positive().max(100).default(10),
  status: ContractStatus.optional(),
  search: z.string().optional(),
});

const IdInputSchema = z.object({ contractId: z.string().uuid() });

const ActivitiesInputSchema = z.object({
  contractId: z.string().uuid(),
  page: z.number().int().positive().default(1),
  limit: z.number().int().positive().max(100).default(20),
});

const PaymentSetupInputSchema = z.object({
  contractId: z.string().uuid(),
  startDate: z.string().datetime({ offset: true }).describe("Required by the backend; min 24h from now."),
  endDate: z.string().datetime({ offset: true }).optional(),
  currencyCode: z.string().length(3).optional(),
  paymentMethodRequired: z.boolean().optional(),
  preferredPaymentMethodType: PreferredPaymentMethodEnum.optional(),
  paymentTerms: z.array(PaymentTermSchema),
});

const SendInputSchema = z.object({
  contractId: z.string().uuid(),
  messageToSigners: z.string().max(2000).optional(),
  deadline: z.string().datetime({ offset: true }).optional(),
  isKycRequired: z.boolean().optional(),
});

const TerminateInputSchema = z.object({
  contractId: z.string().uuid(),
  reason: z.string().max(2000).optional(),
});

export const contractsCreate = defineTool({
  name: "chaindoc_contracts_create",
  description:
    "Create a contract in DRAFT status from an existing document, with contragent info and optional payment terms. " +
    "Payment-enabled contracts require a Stripe Connect account to be configured for the workspace.",
  inputSchema: CreateInputSchema,
  handler: (args, { client }) =>
    client.run("chaindoc_contracts_create", (sdk) => sdk.contracts.create(args)),
});

export const contractsList = defineTool({
  name: "chaindoc_contracts_list",
  description:
    "List contracts created via the API with pagination and optional status/search filters.",
  inputSchema: ListInputSchema,
  handler: (args, { client }) =>
    client.run("chaindoc_contracts_list", (sdk) => sdk.contracts.list(args)),
});

export const contractsGet = defineTool({
  name: "chaindoc_contracts_get",
  description:
    "Fetch full contract details including payment terms, signing status, and contragent info.",
  inputSchema: IdInputSchema,
  handler: (args, { client }) =>
    client.run("chaindoc_contracts_get", (sdk) => sdk.contracts.get(args.contractId)),
});

export const contractsGetStatus = defineTool({
  name: "chaindoc_contracts_get_status",
  description:
    "Lightweight contract status: lifecycle state, signing progress, and payment summary. " +
    "Prefer this over chaindoc_contracts_get for polling.",
  inputSchema: IdInputSchema,
  handler: (args, { client }) =>
    client.run("chaindoc_contracts_get_status", (sdk) => sdk.contracts.getStatus(args.contractId)),
});

export const contractsGetActivities = defineTool({
  name: "chaindoc_contracts_get_activities",
  description:
    "Paginated activity log for a contract (created, sent, signed, amended, terminated). " +
    "Useful for audit and webhook reconciliation.",
  inputSchema: ActivitiesInputSchema,
  handler: (args, { client }) =>
    client.run("chaindoc_contracts_get_activities", (sdk) =>
      sdk.contracts.getActivities(args.contractId, { page: args.page, limit: args.limit }),
    ),
});

export const contractsAddPaymentSetup = defineTool({
  name: "chaindoc_contracts_add_payment_setup",
  description:
    "Attach or replace payment terms on a DRAFT contract. Only valid before sending.",
  inputSchema: PaymentSetupInputSchema,
  handler: (args, { client }) => {
    const { contractId, ...payload } = args;
    return client.run("chaindoc_contracts_add_payment_setup", (sdk) =>
      sdk.contracts.addPaymentSetup(contractId, payload),
    );
  },
});

export const contractsSend = defineTool({
  name: "chaindoc_contracts_send",
  description:
    "Transition a DRAFT contract to PENDING_SIGNATURE and notify both parties. " +
    "All body fields are optional.",
  inputSchema: SendInputSchema,
  handler: (args, { client }) => {
    const { contractId, ...rest } = args;
    return client.run("chaindoc_contracts_send", (sdk) => {
      const payload: Parameters<typeof sdk.contracts.send>[1] = {};
      if (rest.messageToSigners !== undefined) payload.messageToSigners = rest.messageToSigners;
      if (rest.deadline !== undefined) payload.deadline = new Date(rest.deadline);
      if (rest.isKycRequired !== undefined) payload.isKycRequired = rest.isKycRequired;
      return sdk.contracts.send(contractId, payload);
    });
  },
});

export const contractsCancel = defineTool({
  name: "chaindoc_contracts_cancel",
  description:
    "Cancel a DRAFT contract (never sent) or a PENDING_SIGNATURE contract before anyone signs. Irreversible.",
  inputSchema: IdInputSchema,
  handler: (args, { client }) =>
    client.run("chaindoc_contracts_cancel", (sdk) => sdk.contracts.cancel(args.contractId)),
});

export const contractsTerminate = defineTool({
  name: "chaindoc_contracts_terminate",
  description:
    "Terminate an ACTIVE contract. mutual_approval contracts initiate a termination_pending flow; one_side contracts terminate immediately.",
  inputSchema: TerminateInputSchema,
  handler: (args, { client }) =>
    client.run("chaindoc_contracts_terminate", (sdk) =>
      sdk.contracts.terminate(args.contractId, args.reason !== undefined ? { reason: args.reason } : undefined),
    ),
});

const CreateEmptySchema = z.object({
  title: z.string().min(1).max(200),
  description: z.string().max(2000).optional(),
  contragentEmail: z.string().email(),
  contragentName: z.string().optional(),
  currencyCode: z.string().length(3).optional(),
});

const CreateMinimalSchema = z.object({
  documentId: z.string().uuid(),
  title: z.string().min(1).max(200),
  description: z.string().max(2000).optional(),
  contragentEmail: z.string().email(),
  contragentName: z.string().optional(),
  skipPaymentSetup: z.boolean().optional(),
});

const ImportSchema = z.object({
  documentId: z.string().uuid(),
  title: z.string().min(1).max(200),
  description: z.string().max(2000).optional(),
  contragentEmail: z.string().email(),
  contragentName: z.string().optional(),
  currencyCode: z.string().length(3).optional(),
  startDate: z.string().datetime({ offset: true }).optional(),
  endDate: z.string().datetime({ offset: true }).optional(),
});

const UpdateSchema = z.object({
  contractId: z.string().uuid(),
  title: z.string().min(1).max(200).optional(),
  description: z.string().max(2000).optional(),
  startDate: z.string().datetime({ offset: true }).optional(),
  endDate: z.string().datetime({ offset: true }).optional(),
  autoRenew: z.boolean().optional(),
  terminationType: z.enum(["mutual_approval", "one_side"]).optional(),
  noticePeriodDays: z.number().int().nonnegative().optional(),
});

const AttachDocumentSchema = z.object({
  contractId: z.string().uuid(),
  documentId: z.string().uuid(),
});

export const contractsCreateEmpty = defineTool({
  name: "chaindoc_contracts_create_empty",
  description:
    "Create an invoice-only contract. Activates immediately (status='active', origin='invoice_only'); " +
    "no document attached, no signing flow. Use for manual invoicing relationships. " +
    "Preconditions: workspace must have Stripe Connect ready.",
  inputSchema: CreateEmptySchema,
  handler: (args, { client }) =>
    client.run("chaindoc_contracts_create_empty", (sdk) => sdk.contracts.createEmpty(args)),
});

export const contractsCreateMinimal = defineTool({
  name: "chaindoc_contracts_create_minimal",
  description:
    "Create a DRAFT contract from a document + contragent email + title. Add payment setup / send later. " +
    "Preconditions: workspace must have Stripe Connect ready.",
  inputSchema: CreateMinimalSchema,
  handler: (args, { client }) =>
    client.run("chaindoc_contracts_create_minimal", (sdk) => sdk.contracts.createMinimal(args)),
});

export const contractsImport = defineTool({
  name: "chaindoc_contracts_import",
  description:
    "Register an off-platform-signed contract. Activates immediately, skips the in-app signing flow. " +
    "Preconditions: workspace must have Stripe Connect ready.",
  inputSchema: ImportSchema,
  handler: (args, { client }) =>
    client.run("chaindoc_contracts_import", (sdk) => sdk.contracts.import(args)),
});

export const contractsUpdate = defineTool({
  name: "chaindoc_contracts_update",
  description:
    "Partial update of a DRAFT contract. Only provided fields apply. " +
    "Preconditions: contract must be in DRAFT. State mismatches return code='wrong_state'.",
  inputSchema: UpdateSchema,
  handler: (args, { client }) => {
    const { contractId, ...patch } = args;
    return client.run("chaindoc_contracts_update", (sdk) => sdk.contracts.update(contractId, patch));
  },
});

export const contractsDelete = defineTool({
  name: "chaindoc_contracts_delete",
  description:
    "Delete a DRAFT contract. Preconditions: must be in DRAFT (returns 403/code='forbidden' or 'wrong_state' otherwise). " +
    "Decrements workspace usage atomically.",
  inputSchema: z.object({ contractId: z.string().uuid() }),
  handler: (args, { client }) =>
    client.run("chaindoc_contracts_delete", (sdk) => sdk.contracts.delete(args.contractId)),
});

export const contractsAttachDocument = defineTool({
  name: "chaindoc_contracts_attach_document",
  description:
    "Attach a document to a doc-less DRAFT contract. The document must be owned by the key owner (404 if foreign). " +
    "Preconditions: contract must be in DRAFT and not already have a document attached.",
  inputSchema: AttachDocumentSchema,
  handler: (args, { client }) =>
    client.run("chaindoc_contracts_attach_document", (sdk) =>
      sdk.contracts.attachDocument(args.contractId, { documentId: args.documentId }),
    ),
});

export const contractsTools: ToolDefinition<unknown>[] = [
  contractsCreate as ToolDefinition<unknown>,
  contractsList as ToolDefinition<unknown>,
  contractsGet as ToolDefinition<unknown>,
  contractsGetStatus as ToolDefinition<unknown>,
  contractsGetActivities as ToolDefinition<unknown>,
  contractsAddPaymentSetup as ToolDefinition<unknown>,
  contractsSend as ToolDefinition<unknown>,
  contractsCancel as ToolDefinition<unknown>,
  contractsTerminate as ToolDefinition<unknown>,
  contractsCreateEmpty as ToolDefinition<unknown>,
  contractsCreateMinimal as ToolDefinition<unknown>,
  contractsImport as ToolDefinition<unknown>,
  contractsUpdate as ToolDefinition<unknown>,
  contractsDelete as ToolDefinition<unknown>,
  contractsAttachDocument as ToolDefinition<unknown>,
];
