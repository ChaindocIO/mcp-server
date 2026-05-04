import { z } from "zod";
import { defineTool, type ToolDefinition } from "./types.js";

/**
 * Templates API
 *   POST /api/v1/templates/:templateId/documents
 *   POST /api/v1/templates/:templateId/signature-requests
 *   POST /api/v1/templates/:templateId/contracts
 */

const VariablesSchema = z.record(z.union([z.string(), z.number(), z.boolean()]));

const SigningMethodEnum = z.enum(["embedded", "delegated"]);

/**
 * Slot assignments for `chaindoc_templates_send_for_signing`. Each template
 * signer key is bound to a recipient email. `signingMethod` toggles whether
 * the recipient signs in the embedded iframe or is signed-for via the delegated API.
 */
const SigningSlotAssignmentSchema = z.object({
  signerKey: z.string().min(1),
  email: z.string().email(),
  signingMethod: SigningMethodEnum.optional(),
  signerVariables: VariablesSchema.optional(),
});

/**
 * Slot assignments for `chaindoc_templates_create_contract`. Each template signer
 * key is bound to a contract role — emails come from `contragent.email`
 * (contragent role) or the API key owner (business role).
 */
const ContractSlotAssignmentSchema = z.object({
  signerKey: z.string().min(1),
  role: z.enum(["business", "contragent"]),
  signerVariables: VariablesSchema.optional(),
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

const PaymentTermSchema = z.object({
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
});

const SigningPolicySchema = z.object({
  business: z.enum(["embedded", "delegated"]).optional(),
  contragent: z.literal("embedded").optional(),
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
  documentDescription: z.string().max(2000).optional(),
  variables: VariablesSchema,
  slotAssignments: z.array(SigningSlotAssignmentSchema).min(1),
  message: z.string().max(2000).optional(),
  deadline: z
    .string()
    .datetime({ offset: true })
    .describe("ISO-8601 datetime. Required by the backend."),
  isKycRequired: z.boolean().optional(),
});

const CreateContractSchema = z.object({
  templateId: z.string().uuid(),
  variables: VariablesSchema,
  slotAssignments: z.array(ContractSlotAssignmentSchema).min(1),
  title: z.string().min(1).max(200),
  description: z.string().max(2000).optional(),
  contragent: ContragentSchema,
  startDate: z.string().datetime({ offset: true }).optional(),
  endDate: z.string().datetime({ offset: true }).optional(),
  autoRenew: z.boolean().optional(),
  currencyCode: z.string().length(3).optional().describe("ISO-4217. Backend default: USD."),
  terminationType: z.enum(["mutual_approval", "one_side"]).optional(),
  noticePeriodDays: z.number().int().nonnegative().optional(),
  paymentTerms: z.array(PaymentTermSchema).optional(),
  signingPolicy: SigningPolicySchema.optional(),
  messageToSigners: z.string().max(2000).optional(),
  deadline: z
    .string()
    .datetime({ offset: true })
    .describe("ISO-8601 datetime. Required by the backend."),
  isKycRequired: z.boolean().optional(),
});

export const templatesCreateDocument = defineTool({
  name: "chaindoc_templates_create_document",
  description:
    "Render a published template into a new DRAFT document with the provided variables. Produces only the document shell (no signing).",
  inputSchema: CreateDocumentSchema,
  handler: (args, { client }) => {
    const { templateId, ...rest } = args;
    return client.run("chaindoc_templates_create_document", (sdk) => {
      const payload: Parameters<typeof sdk.templates.createDocument>[1] = {
        documentName: rest.documentName,
        variables: rest.variables,
      };
      if (rest.documentDescription !== undefined) {
        payload.documentDescription = rest.documentDescription;
      }
      return sdk.templates.createDocument(templateId, payload);
    });
  },
});

export const templatesSendForSigning = defineTool({
  name: "chaindoc_templates_send_for_signing",
  description:
    "Render a template, create the document, and send it for signing in one call. " +
    "Each `slotAssignments` entry binds a template signer key to a recipient email.",
  inputSchema: SendForSigningSchema,
  handler: (args, { client }) => {
    const { templateId, deadline, ...rest } = args;
    return client.run("chaindoc_templates_send_for_signing", (sdk) => {
      const payload: Parameters<typeof sdk.templates.sendForSigning>[1] = {
        documentName: rest.documentName,
        variables: rest.variables,
        slotAssignments: rest.slotAssignments,
        deadline: new Date(deadline),
      };
      if (rest.documentDescription !== undefined) {
        payload.documentDescription = rest.documentDescription;
      }
      if (rest.message !== undefined) payload.message = rest.message;
      if (rest.isKycRequired !== undefined) payload.isKycRequired = rest.isKycRequired;
      return sdk.templates.sendForSigning(templateId, payload);
    });
  },
});

export const templatesCreateContract = defineTool({
  name: "chaindoc_templates_create_contract",
  description:
    "Render a contract template with variables + contragent info, create the contract, and send it for signing in one call. " +
    "Each `slotAssignments` entry binds a template signer key to a contract role (business or contragent).",
  inputSchema: CreateContractSchema,
  handler: (args, { client }) => {
    const { templateId, deadline, ...rest } = args;
    return client.run("chaindoc_templates_create_contract", (sdk) => {
      const payload: Parameters<typeof sdk.templates.createContract>[1] = {
        variables: rest.variables,
        slotAssignments: rest.slotAssignments,
        title: rest.title,
        contragent: rest.contragent,
        deadline: new Date(deadline),
      };
      if (rest.description !== undefined) payload.description = rest.description;
      if (rest.startDate !== undefined) payload.startDate = rest.startDate;
      if (rest.endDate !== undefined) payload.endDate = rest.endDate;
      if (rest.autoRenew !== undefined) payload.autoRenew = rest.autoRenew;
      if (rest.currencyCode !== undefined) payload.currencyCode = rest.currencyCode;
      if (rest.terminationType !== undefined) payload.terminationType = rest.terminationType;
      if (rest.noticePeriodDays !== undefined) payload.noticePeriodDays = rest.noticePeriodDays;
      if (rest.paymentTerms !== undefined) payload.paymentTerms = rest.paymentTerms;
      if (rest.signingPolicy !== undefined) payload.signingPolicy = rest.signingPolicy;
      if (rest.messageToSigners !== undefined) payload.messageToSigners = rest.messageToSigners;
      if (rest.isKycRequired !== undefined) payload.isKycRequired = rest.isKycRequired;
      return sdk.templates.createContract(templateId, payload);
    });
  },
});

export const templatesTools: ToolDefinition<unknown>[] = [
  templatesCreateDocument as ToolDefinition<unknown>,
  templatesSendForSigning as ToolDefinition<unknown>,
  templatesCreateContract as ToolDefinition<unknown>,
];
