import { z } from "zod";
import { defineTool, type ToolDefinition } from "./types.js";

// An amendment carries no money: the server refuses `modifiesPaymentTerms: true` and any `paymentTermModifications`
// (422 AMENDMENT_CARRIES_NO_MONEY), so they are not offered here; strict() refuses them by name instead of dropping them.
const AgreementCreateSchema = z
  .object({
    contractId: z.string().uuid(),
    documentId: z.string().uuid(),
    title: z.string().min(1).max(200),
    description: z.string().max(2000).optional(),
    effectiveDate: z.string().datetime({ offset: true }).optional(),
  })
  .strict();

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
    "Create an additional agreement (amendment) on an existing contract, in DRAFT, from a TEXT document owned by the " +
    "key owner. An amendment carries no money: payment terms change through invoices and series in the Chaindoc app. " +
    "Before chaindoc_contracts_agreements_initiate_signing its text needs the roles `business` and `contragent` " +
    "(chaindoc_documents_add_signature_block).",
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
    "Send a DRAFT amendment for signing. Preconditions: parent contract must be ACTIVE; amendment must be in DRAFT; its " +
    "text holds the roles `business` and `contragent` with their Signature chips. Refusals as chaindoc_contracts_send: " +
    "409 SETUP_BLOCKED (`details.blockers`), 400 SIGNATURE_ROLE_UNKNOWN, 422 DOCUMENT_FILE_CONVERTS, 400 KYC_NOT_VERIFIED.",
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
