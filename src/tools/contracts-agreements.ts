import { z } from "zod";
import { defineTool, type ToolDefinition } from "./types.js";

const PaymentTermModificationSchema = z.object({
  action: z.enum(["add", "update", "deactivate"]),
  paymentTermId: z.string().uuid().optional(),
  type: z.enum(["deposit", "recurring", "one_time"]).optional(),
  name: z.string().optional(),
  description: z.string().optional(),
  amount: z.string().regex(/^\d+(\.\d{1,2})?$/).optional(),
  frequency: z.enum(["weekly", "biweekly", "monthly", "quarterly", "yearly"]).optional(),
  dayOfPeriod: z.number().int().min(1).max(28).optional(),
  startDate: z.string().datetime({ offset: true }).optional(),
  endDate: z.string().datetime({ offset: true }).optional(),
  totalPayments: z.number().int().positive().optional(),
  dueDate: z.string().datetime({ offset: true }).optional(),
  autoCharge: z.boolean().optional(),
});

const AgreementCreateSchema = z.object({
  contractId: z.string().uuid(),
  documentId: z.string().uuid(),
  title: z.string().min(1).max(200),
  description: z.string().max(2000).optional(),
  effectiveDate: z.string().datetime({ offset: true }).optional(),
  modifiesPaymentTerms: z.boolean().optional(),
  paymentTermModifications: z.array(PaymentTermModificationSchema).optional(),
});

const AgreementIdSchema = z.object({
  contractId: z.string().uuid(),
  agreementId: z.string().uuid(),
});

const AgreementInitiateSchema = z.object({
  contractId: z.string().uuid(),
  agreementId: z.string().uuid(),
  messageToSigners: z.string().max(2000).optional(),
  deadline: z.string().datetime({ offset: true }).optional(),
  isKycRequired: z.boolean().optional(),
  notifyContragent: z.boolean().optional(),
});

export const contractsAgreementsCreate = defineTool({
  name: "chaindoc_contracts_agreements_create",
  description:
    "Create an additional agreement (amendment) on an existing contract, in DRAFT. " +
    "Document must be owned by the key owner. May carry paymentTermModifications that apply once signed.",
  inputSchema: AgreementCreateSchema,
  handler: (args, { client }) => {
    const { contractId, ...payload } = args;
    return client.run("chaindoc_contracts_agreements_create", (sdk) =>
      sdk.contracts.agreements.create(contractId, payload),
    );
  },
});

export const contractsAgreementsList = defineTool({
  name: "chaindoc_contracts_agreements_list",
  description: "List all amendments (additional agreements) on a contract.",
  inputSchema: z.object({ contractId: z.string().uuid() }),
  handler: (args, { client }) =>
    client.run("chaindoc_contracts_agreements_list", (sdk) =>
      sdk.contracts.agreements.list(args.contractId),
    ),
});

export const contractsAgreementsGet = defineTool({
  name: "chaindoc_contracts_agreements_get",
  description: "Retrieve a contract amendment or agreement by its identifier.",
  inputSchema: AgreementIdSchema,
  handler: (args, { client }) =>
    client.run("chaindoc_contracts_agreements_get", (sdk) =>
      sdk.contracts.agreements.get(args.contractId, args.agreementId),
    ),
});

export const contractsAgreementsInitiateSigning = defineTool({
  name: "chaindoc_contracts_agreements_initiate_signing",
  description:
    "Send a DRAFT amendment for signing. Preconditions: parent contract must be ACTIVE; amendment must be in DRAFT.",
  inputSchema: AgreementInitiateSchema,
  handler: (args, { client }) => {
    const hasAny =
      args.messageToSigners !== undefined ||
      args.deadline !== undefined ||
      args.isKycRequired !== undefined ||
      args.notifyContragent !== undefined;
    const payload: {
      messageToSigners?: string;
      deadline?: Date;
      isKycRequired?: boolean;
      notifyContragent?: boolean;
    } | undefined = hasAny ? {} : undefined;
    if (payload !== undefined) {
      if (args.messageToSigners !== undefined) payload.messageToSigners = args.messageToSigners;
      if (args.deadline !== undefined) payload.deadline = new Date(args.deadline);
      if (args.isKycRequired !== undefined) payload.isKycRequired = args.isKycRequired;
      if (args.notifyContragent !== undefined) payload.notifyContragent = args.notifyContragent;
    }
    return client.run("chaindoc_contracts_agreements_initiate_signing", (sdk) =>
      sdk.contracts.agreements.initiateSigning(args.contractId, args.agreementId, payload),
    );
  },
});

export const contractsAgreementsDelete = defineTool({
  name: "chaindoc_contracts_agreements_delete",
  description: "Delete a DRAFT amendment. Preconditions: amendment must be in DRAFT.",
  inputSchema: AgreementIdSchema,
  handler: (args, { client }) =>
    client.run("chaindoc_contracts_agreements_delete", (sdk) =>
      sdk.contracts.agreements.delete(args.contractId, args.agreementId),
    ),
});

export const contractsAgreementsTools: ToolDefinition<unknown>[] = [
  contractsAgreementsCreate as ToolDefinition<unknown>,
  contractsAgreementsList as ToolDefinition<unknown>,
  contractsAgreementsGet as ToolDefinition<unknown>,
  contractsAgreementsInitiateSigning as ToolDefinition<unknown>,
  contractsAgreementsDelete as ToolDefinition<unknown>,
];
