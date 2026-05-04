import { z } from "zod";
import { defineTool, type ToolDefinition } from "./types.js";

/**
 * Templates API
 *   POST /templates/:templateId/documents
 *   POST /templates/:templateId/signature-requests
 *   POST /templates/:templateId/contracts
 */

const VariablesSchema = z.record(z.union([z.string(), z.number(), z.boolean()]));

const SlotAssignmentSchema = z.object({
  signerKey: z.string().min(1),
  email: z.string().email().optional(),
  role: z.enum(["business", "contragent"]).optional(),
  signingMethod: z.enum(["email", "embedded"]).optional(),
  signerVariables: VariablesSchema.optional(),
});

const ContragentSchema = z.object({
  email: z.string().email(),
  name: z.string().optional(),
});

const PaymentTermSchema = z.object({
  type: z.enum(["one_time", "recurring", "deposit"]),
  name: z.string(),
  amount: z.string().regex(/^\d+(\.\d{1,2})?$/),
  frequency: z.enum(["weekly", "biweekly", "monthly", "quarterly", "yearly"]).optional(),
  dayOfPeriod: z.number().int().min(1).max(28).optional(),
  dueDate: z.string().datetime({ offset: true }).optional(),
  autoCharge: z.boolean().optional(),
});

const CreateDocumentSchema = z.object({
  templateId: z.string().uuid(),
  documentName: z.string().min(1).max(200),
  documentDescription: z.string().max(2000).optional(),
  variables: VariablesSchema,
});

const SendForSigningSchema = z.object({
  templateId: z.string().uuid(),
  documentName: z.string().min(1).max(200),
  variables: VariablesSchema,
  slotAssignments: z.array(SlotAssignmentSchema).min(1),
  message: z.string().max(2000).optional(),
  deadline: z.string().datetime({ offset: true }).optional(),
  isKycRequired: z.boolean().optional(),
});

const CreateContractSchema = z.object({
  templateId: z.string().uuid(),
  variables: VariablesSchema,
  slotAssignments: z.array(SlotAssignmentSchema).min(1),
  title: z.string().min(1).max(200),
  description: z.string().max(2000).optional(),
  contragent: ContragentSchema,
  startDate: z.string().datetime({ offset: true }).optional(),
  endDate: z.string().datetime({ offset: true }).optional(),
  currencyCode: z.string().length(3),
  terminationType: z.enum(["mutual_approval", "one_side"]).optional(),
  noticePeriodDays: z.number().int().nonnegative().optional(),
  paymentTerms: z.array(PaymentTermSchema).optional(),
  messageToSigners: z.string().max(2000).optional(),
  deadline: z.string().datetime({ offset: true }).optional(),
  isKycRequired: z.boolean().optional(),
});

export const templatesCreateDocument = defineTool({
  name: "chaindoc_templates_create_document",
  description:
    "Render a published template into a new DRAFT document with the provided variables. Produces only the document shell (no signing).",
  inputSchema: CreateDocumentSchema,
  handler: (args, { client }) => {
    const { templateId, ...payload } = args;
    return client.run("chaindoc_templates_create_document", (sdk) =>
      sdk.templates.createDocument(templateId, payload),
    );
  },
});

export const templatesSendForSigning = defineTool({
  name: "chaindoc_templates_send_for_signing",
  description:
    "Render a template, create the document, and send it for signing in one call. " +
    "slotAssignments bind template signer keys to real recipient emails.",
  inputSchema: SendForSigningSchema,
  handler: (args, { client }) => {
    const { templateId, deadline, ...rest } = args;
    return client.run("chaindoc_templates_send_for_signing", (sdk) => {
      const payload: Parameters<typeof sdk.templates.sendForSigning>[1] = {
        documentName: rest.documentName,
        variables: rest.variables,
        slotAssignments: rest.slotAssignments,
      };
      if (rest.message !== undefined) payload.message = rest.message;
      if (rest.isKycRequired !== undefined) payload.isKycRequired = rest.isKycRequired;
      if (deadline !== undefined) payload.deadline = new Date(deadline);
      return sdk.templates.sendForSigning(templateId, payload);
    });
  },
});

export const templatesCreateContract = defineTool({
  name: "chaindoc_templates_create_contract",
  description:
    "Render a contract template with variables + contragent info, create the contract, and send it for signing in one call.",
  inputSchema: CreateContractSchema,
  handler: (args, { client }) => {
    const { templateId, deadline, ...rest } = args;
    return client.run("chaindoc_templates_create_contract", (sdk) => {
      const payload: Parameters<typeof sdk.templates.createContract>[1] = {
        variables: rest.variables,
        slotAssignments: rest.slotAssignments,
        title: rest.title,
        contragent: rest.contragent,
        currencyCode: rest.currencyCode,
      };
      if (rest.description !== undefined) payload.description = rest.description;
      if (rest.startDate !== undefined) payload.startDate = rest.startDate;
      if (rest.endDate !== undefined) payload.endDate = rest.endDate;
      if (rest.terminationType !== undefined) payload.terminationType = rest.terminationType;
      if (rest.noticePeriodDays !== undefined) payload.noticePeriodDays = rest.noticePeriodDays;
      if (rest.paymentTerms !== undefined) payload.paymentTerms = rest.paymentTerms;
      if (rest.messageToSigners !== undefined) payload.messageToSigners = rest.messageToSigners;
      if (rest.isKycRequired !== undefined) payload.isKycRequired = rest.isKycRequired;
      if (deadline !== undefined) payload.deadline = new Date(deadline);
      return sdk.templates.createContract(templateId, payload);
    });
  },
});

export const templatesTools: ToolDefinition<unknown>[] = [
  templatesCreateDocument as ToolDefinition<unknown>,
  templatesSendForSigning as ToolDefinition<unknown>,
  templatesCreateContract as ToolDefinition<unknown>,
];
