import { z } from "zod";
import { defineTool, type ToolDefinition } from "./types.js";

/**
 * Templates API
 *   CRUD:      GET/POST/PATCH /api/v1/templates
 *   Lifecycle: publish/archive/restore/delete
 *   Render:    POST /api/v1/templates/:templateId/documents
 *              POST /api/v1/templates/:templateId/signature-requests
 *              POST /api/v1/templates/:templateId/contracts
 */

// ---------------------------------------------------------------------------
// CRUD + lifecycle schemas
// ---------------------------------------------------------------------------

const TemplateCategoryEnum = z.enum([
  "contract", "agreement", "invoice", "nda", "proposal", "letter", "other",
]);
const TemplateStatusEnum = z.enum(["draft", "published", "archived"]);
const TemplateVariableDataTypeEnum = z.enum(["text", "long_text", "date", "number", "boolean"]);
const TemplateVariableScopeEnum = z.enum(["document", "signer"]);

const TemplateVariableInputSchema = z.object({
  key: z.string().min(1),
  label: z.string(),
  dataType: TemplateVariableDataTypeEnum,
  scope: TemplateVariableScopeEnum.optional(),
  signerKey: z.string().optional(),
  systemKey: z.string().optional(),
  required: z.boolean(),
  defaultValue: z.union([z.string(), z.number(), z.boolean()]).optional(),
  description: z.string().optional(),
});

// Pass-through for richly typed SDK shapes we don't need to fully model.
const PassThroughObject = z.record(z.unknown());
const PassThroughArray = z.array(z.record(z.unknown()));

const TemplateListInputSchema = z.object({
  page: z.number().int().positive().default(1),
  limit: z.number().int().positive().max(100).default(20),
  status: TemplateStatusEnum.optional(),
  search: z.string().optional(),
});

const TemplateIdSchema = z.object({ templateId: z.string().uuid() });

const TemplateCreateSchema = z.object({
  name: z.string().min(1).max(200),
  description: z.string().max(2000).optional(),
  category: TemplateCategoryEnum,
  contentJson: PassThroughObject.describe("Tiptap document JSON; passed through as-is."),
  variablesSchema: z.array(TemplateVariableInputSchema).optional(),
  signatureRequirements: PassThroughArray.optional(),
  signerSlots: PassThroughArray.optional(),
  renderConfig: PassThroughObject.optional(),
  meta: z.array(z.object({ key: z.string(), value: z.string() })).optional(),
});

const TemplateUpdateSchema = z.object({
  templateId: z.string().uuid(),
  name: z.string().min(1).max(200).optional(),
  description: z.string().max(2000).optional(),
  category: TemplateCategoryEnum.optional(),
  contentJson: PassThroughObject.optional(),
  variablesSchema: z.array(TemplateVariableInputSchema).optional(),
  signatureRequirements: PassThroughArray.optional(),
  signerSlots: PassThroughArray.optional(),
  renderConfig: PassThroughObject.optional(),
});

const TemplatePublishSchema = z.object({
  templateId: z.string().uuid(),
  changelog: z.string().max(2000).optional(),
});

// ---------------------------------------------------------------------------
// CRUD + lifecycle tool exports
// ---------------------------------------------------------------------------

export const templatesList = defineTool({
  name: "chaindoc_templates_list",
  description: "Paginated list of owned templates with optional status and search filters.",
  inputSchema: TemplateListInputSchema,
  handler: (args, { client }) =>
    client.run("chaindoc_templates_list", (sdk) => sdk.templates.list(args)),
});

export const templatesGet = defineTool({
  name: "chaindoc_templates_get",
  description:
    "Fetch one template's detail: current + last-published version, variablesSchema, signer slots.",
  inputSchema: TemplateIdSchema,
  handler: (args, { client }) =>
    client.run("chaindoc_templates_get", (sdk) => sdk.templates.get(args.templateId)),
});

export const templatesGetVersions = defineTool({
  name: "chaindoc_templates_get_versions",
  description: "Version history for a template. Each version carries its own variablesSchema.",
  inputSchema: TemplateIdSchema,
  handler: (args, { client }) =>
    client.run("chaindoc_templates_get_versions", (sdk) => sdk.templates.getVersions(args.templateId)),
});

export const templatesCreate = defineTool({
  name: "chaindoc_templates_create",
  description:
    "Create a template (DRAFT). Provide name, category, contentJson (Tiptap document JSON), and optional " +
    "variablesSchema / signerSlots / signatureRequirements.",
  inputSchema: TemplateCreateSchema,
  handler: (args, { client }) =>
    client.run("chaindoc_templates_create", (sdk) => {
      const payload: Parameters<typeof sdk.templates.create>[0] = {
        name: args.name,
        category: args.category,
        contentJson: args.contentJson,
      };
      if (args.description !== undefined) payload.description = args.description;
      if (args.variablesSchema !== undefined) payload.variablesSchema = args.variablesSchema;
      if (args.signatureRequirements !== undefined)
        payload.signatureRequirements =
          args.signatureRequirements as unknown as Parameters<typeof sdk.templates.create>[0]["signatureRequirements"];
      if (args.signerSlots !== undefined)
        payload.signerSlots =
          args.signerSlots as unknown as Parameters<typeof sdk.templates.create>[0]["signerSlots"];
      if (args.renderConfig !== undefined)
        payload.renderConfig =
          args.renderConfig as Parameters<typeof sdk.templates.create>[0]["renderConfig"];
      if (args.meta !== undefined) payload.meta = args.meta;
      return sdk.templates.create(payload);
    }),
});

export const templatesUpdate = defineTool({
  name: "chaindoc_templates_update",
  description:
    "Partial update. Editing a PUBLISHED template forks a new draft version while the last-published " +
    "version remains the renderable one until the next publish.",
  inputSchema: TemplateUpdateSchema,
  handler: (args, { client }) => {
    const { templateId, ...rest } = args;
    return client.run("chaindoc_templates_update", (sdk) => {
      const patch: Parameters<typeof sdk.templates.update>[1] = {};
      if (rest.name !== undefined) patch.name = rest.name;
      if (rest.description !== undefined) patch.description = rest.description;
      if (rest.category !== undefined) patch.category = rest.category;
      if (rest.contentJson !== undefined) patch.contentJson = rest.contentJson;
      if (rest.variablesSchema !== undefined) patch.variablesSchema = rest.variablesSchema;
      if (rest.signatureRequirements !== undefined)
        patch.signatureRequirements =
          rest.signatureRequirements as unknown as Parameters<typeof sdk.templates.update>[1]["signatureRequirements"];
      if (rest.signerSlots !== undefined)
        patch.signerSlots =
          rest.signerSlots as unknown as Parameters<typeof sdk.templates.update>[1]["signerSlots"];
      if (rest.renderConfig !== undefined)
        patch.renderConfig =
          rest.renderConfig as Parameters<typeof sdk.templates.update>[1]["renderConfig"];
      return sdk.templates.update(templateId, patch);
    });
  },
});

export const templatesPublish = defineTool({
  name: "chaindoc_templates_publish",
  description:
    "Publish a DRAFT template (or its current draft version). Archived templates must be restored first. " +
    "Optional `changelog` is recorded against the new published version.",
  inputSchema: TemplatePublishSchema,
  handler: (args, { client }) => {
    const payload = args.changelog !== undefined ? { changelog: args.changelog } : undefined;
    return client.run("chaindoc_templates_publish", (sdk) =>
      sdk.templates.publish(args.templateId, payload),
    );
  },
});

export const templatesArchive = defineTool({
  name: "chaindoc_templates_archive",
  description: "Move a template to ARCHIVED.",
  inputSchema: TemplateIdSchema,
  handler: (args, { client }) =>
    client.run("chaindoc_templates_archive", (sdk) => sdk.templates.archive(args.templateId)),
});

export const templatesRestore = defineTool({
  name: "chaindoc_templates_restore",
  description: "Restore an ARCHIVED template back to DRAFT.",
  inputSchema: TemplateIdSchema,
  handler: (args, { client }) =>
    client.run("chaindoc_templates_restore", (sdk) => sdk.templates.restore(args.templateId)),
});

export const templatesDelete = defineTool({
  name: "chaindoc_templates_delete",
  description: "Delete a template.",
  inputSchema: TemplateIdSchema,
  handler: (args, { client }) =>
    client.run("chaindoc_templates_delete", (sdk) => sdk.templates.delete(args.templateId)),
});

// ---------------------------------------------------------------------------
// Render-style schemas (existing)
// ---------------------------------------------------------------------------

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
  templatesList as ToolDefinition<unknown>,
  templatesGet as ToolDefinition<unknown>,
  templatesGetVersions as ToolDefinition<unknown>,
  templatesCreate as ToolDefinition<unknown>,
  templatesUpdate as ToolDefinition<unknown>,
  templatesPublish as ToolDefinition<unknown>,
  templatesArchive as ToolDefinition<unknown>,
  templatesRestore as ToolDefinition<unknown>,
  templatesDelete as ToolDefinition<unknown>,
  templatesCreateDocument as ToolDefinition<unknown>,
  templatesSendForSigning as ToolDefinition<unknown>,
  templatesCreateContract as ToolDefinition<unknown>,
];
