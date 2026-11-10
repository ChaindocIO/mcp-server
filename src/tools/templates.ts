import { z } from "zod";
import type { DocumentContent } from "@chaindoc_io/server-sdk";
import { defineTool, type ToolDefinition } from "./types.js";
import { requireConfirmation, confirmField } from "./confirm.js";
import {
  AccountChoiceSchema,
  ContragentInfoSchema,
  DecimalString,
  DocumentContentSchema,
} from "./schemas.js";

/**
 * Templates API (new format only: `content` + `revision`).
 *   CRUD:      GET/POST/PATCH /api/v1/templates
 *   Lifecycle: publish / archive / restore / delete
 *   Runtime:   POST /api/v1/templates/:templateId/documents          (always a draft)
 *              POST /api/v1/templates/:templateId/signature-requests
 *              POST /api/v1/templates/:templateId/contracts
 *
 * Old-format templates answer 410 TEMPLATE_RETIRED. There are no previews.
 */

const TemplateCategoryEnum = z.enum([
  "contract", "agreement", "invoice", "nda", "proposal", "letter", "other",
]);
const TemplateStatusEnum = z.enum(["draft", "published", "archived"]);

const TemplateListInputSchema = z.object({
  page: z.number().int().positive().default(1),
  limit: z.number().int().positive().max(100).default(20),
  status: TemplateStatusEnum.optional(),
  search: z.string().optional(),
});

const TemplateIdSchema = z.object({ templateId: z.string().uuid() });

const TemplateContentSchema = DocumentContentSchema.refine((c) => c.mode === "template", {
  message: "A template's content must have mode 'template'.",
});

const TemplateCreateSchema = z.object({
  name: z.string().min(1).max(200),
  description: z.string().max(2000).optional(),
  category: TemplateCategoryEnum,
  content: TemplateContentSchema.describe(
    "Engine content { version: 2, mode: 'template', doc }. Fields are chips with definitions in doc.attrs.fields; signer slots are doc.attrs.signers.",
  ),
  meta: z.array(z.string()).optional(),
}).strict(); // the old `contentJson` is refused, not dropped

const TemplateUpdateSchema = z
  .object({
    templateId: z.string().uuid(),
    name: z.string().min(1).max(200).optional(),
    description: z.string().max(2000).optional(),
    category: TemplateCategoryEnum.optional(),
    content: TemplateContentSchema.optional(),
    revision: z
      .number()
      .int()
      .nonnegative()
      .optional()
      .describe("The working copy's revision you read (chaindoc_templates_get -> template.workingCopy.revision). Required with `content`."),
    allowEmpty: z.boolean().optional().describe("Permit saving an empty document (an intentional revert)."),
  })
  .strict()
  .superRefine((v, ctx) => {
    if (v.content !== undefined && v.revision === undefined) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "`content` needs `revision` (TEMPLATE_REVISION_REQUIRED): read it from chaindoc_templates_get.",
      });
    }
  });

const TemplatePublishSchema = z.object({
  templateId: z.string().uuid(),
  changelog: z.string().max(1000).optional(),
  revision: z.number().int().nonnegative().optional().describe("The working-copy revision you saw (else a moved copy is 409)."),
});

export const templatesList = defineTool({
  name: "chaindoc_templates_list",
  description: "Paginated list of the workspace's templates with optional status and search filters.",
  inputSchema: TemplateListInputSchema,
  handler: (args, { client }) =>
    client.run("chaindoc_templates_list", (sdk) => sdk.templates.list(args)),
});

export const templatesGet = defineTool({
  name: "chaindoc_templates_get",
  description:
    "Fetch one template: current + last-published version (variablesSchema, signerSlots with their `signerKey`) and, " +
    "for a key that may edit, `workingCopy` { content, revision } - the `revision` is what chaindoc_templates_update " +
    "and chaindoc_templates_publish need. An old-format template answers 410 TEMPLATE_RETIRED.",
  inputSchema: TemplateIdSchema,
  handler: (args, { client }) =>
    client.run("chaindoc_templates_get", (sdk) => sdk.templates.get(args.templateId)),
});

export const templatesGetVersions = defineTool({
  name: "chaindoc_templates_get_versions",
  description: "Published version history for a template. Each version carries its own variablesSchema and signer slots.",
  inputSchema: TemplateIdSchema,
  handler: (args, { client }) =>
    client.run("chaindoc_templates_get_versions", (sdk) => sdk.templates.getVersions(args.templateId)),
});

export const templatesCreate = defineTool({
  name: "chaindoc_templates_create",
  description:
    "Create a template as a DRAFT held in its working copy. Give `content` (engine content v2 with mode 'template'); " +
    "variables and signer slots are read off the content. Publish it with chaindoc_templates_publish before using it. " +
    "The old `contentJson` format is refused (TEMPLATE_FORMAT_RETIRED).",
  inputSchema: TemplateCreateSchema,
  handler: (args, { client }) =>
    client.run("chaindoc_templates_create", (sdk) =>
      sdk.templates.create({
        name: args.name,
        category: args.category,
        content: args.content as DocumentContent,
        ...(args.description !== undefined && { description: args.description }),
        ...(args.meta !== undefined && { meta: args.meta }),
      }),
    ),
});

export const templatesUpdate = defineTool({
  name: "chaindoc_templates_update",
  description:
    "Update a non-archived template. Name, description and category save at once. `content` goes into the working copy " +
    "and MUST name the `revision` you read (TEMPLATE_REVISION_REQUIRED otherwise; 409 TEMPLATE_WORKING_COPY_MOVED if " +
    "someone changed it: read it again and redo). Changes are not live until chaindoc_templates_publish.",
  inputSchema: TemplateUpdateSchema,
  handler: (args, { client }) => {
    const { templateId, content, ...rest } = args;
    return client.run("chaindoc_templates_update", (sdk) =>
      sdk.templates.update(templateId, {
        ...rest,
        ...(content !== undefined && { content: content as DocumentContent }),
      }),
    );
  },
});

export const templatesPublish = defineTool({
  name: "chaindoc_templates_publish",
  description:
    "Publish the working copy as the template's next version; the published version is what documents, signature " +
    "requests and contracts are made from. Pass the `revision` you saw. Optional `changelog`. Archived templates must " +
    "be restored first (TEMPLATE_ARCHIVED); nothing to publish is TEMPLATE_NOTHING_TO_PUBLISH.",
  inputSchema: TemplatePublishSchema,
  handler: (args, { client }) => {
    const { templateId, ...params } = args;
    return client.run("chaindoc_templates_publish", (sdk) =>
      sdk.templates.publish(templateId, Object.keys(params).length > 0 ? params : undefined),
    );
  },
});

export const templatesArchive = defineTool({
  name: "chaindoc_templates_archive",
  description: "Archive a template: hidden from default listings and not usable until restored. Reversible with chaindoc_templates_restore.",
  inputSchema: TemplateIdSchema,
  handler: (args, { client }) =>
    client.run("chaindoc_templates_archive", (sdk) => sdk.templates.archive(args.templateId)),
});

export const templatesRestore = defineTool({
  name: "chaindoc_templates_restore",
  description:
    "Restore an ARCHIVED template: back to PUBLISHED when it has a published version, to DRAFT when it was never published.",
  inputSchema: TemplateIdSchema,
  handler: (args, { client }) =>
    client.run("chaindoc_templates_restore", (sdk) => sdk.templates.restore(args.templateId)),
});

export const templatesDelete = defineTool({
  name: "chaindoc_templates_delete",
  description:
    "PERMANENTLY delete a template: it cannot be recovered and every later call on it answers 404. " +
    "Prefer chaindoc_templates_archive. Ask the user first; pass confirm=true only after they said yes.",
  inputSchema: TemplateIdSchema.extend({ confirm: confirmField }),
  handler: async (args, { client }) => {
    requireConfirmation(args.confirm, `Permanently deleting template ${args.templateId}`);
    return client.run("chaindoc_templates_delete", (sdk) => sdk.templates.delete(args.templateId));
  },
});

// ---------------------------------------------------------------------------
// Runtime: documents, signature requests and contracts from a published template
// ---------------------------------------------------------------------------

const VariablesSchema = z
  .record(z.union([z.string(), z.number(), z.boolean()]))
  .describe("Values by field key: yes/no fields true/false, numbers as numbers, dates 'YYYY-MM-DD'.");

const SigningSlotAssignmentSchema = z.object({
  signerKey: z.string().min(1).describe("A slot key from chaindoc_templates_get (signerSlots[].signerKey)."),
  email: z.string().email(),
  account: AccountChoiceSchema.optional(),
  signingMethod: z.literal("embedded").optional(),
}).strict(); // delegated signing and signerVariables are refused (TEMPLATE_SLOT_NOT_SUPPORTED), not dropped

const ContractSlotAssignmentSchema = z.object({
  signerKey: z.string().min(1),
  role: z.enum(["business", "contragent"]),
});

const PaymentTermSchema = z.object({
  type: z.enum(["deposit", "recurring", "one_time"]),
  name: z.string(),
  description: z.string().optional(),
  amount: DecimalString,
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

const SendForSigningSchema = CreateDocumentSchema.extend({
  slotAssignments: z.array(SigningSlotAssignmentSchema).min(1),
  message: z.string().max(2000).optional(),
  deadline: z.string().datetime({ offset: true }).describe("ISO-8601 datetime. Required."),
  isKycRequired: z.boolean().optional(),
});

const CreateContractSchema = z.object({
  templateId: z.string().uuid(),
  variables: VariablesSchema,
  slotAssignments: z.array(ContractSlotAssignmentSchema).min(2).max(2),
  title: z.string().min(1).max(200),
  description: z.string().max(2000).optional(),
  contragent: ContragentInfoSchema,
  contragentAccount: AccountChoiceSchema.optional(),
  startDate: z.string().datetime({ offset: true }).optional(),
  endDate: z.string().datetime({ offset: true }).optional(),
  autoRenew: z.boolean().optional(),
  currencyCode: z.string().length(3).optional().describe("ISO-4217. Backend default: USD."),
  terminationType: z.enum(["mutual_approval", "one_side"]).optional(),
  noticePeriodDays: z.number().int().nonnegative().optional(),
  paymentTerms: z.array(PaymentTermSchema).optional(),
  signingPolicy: SigningPolicySchema.optional(),
  messageToSigners: z.string().max(2000).optional(),
  deadline: z.string().datetime({ offset: true }).describe("ISO-8601 datetime. Required."),
  isKycRequired: z.boolean().optional(),
});

export const templatesCreateDocument = defineTool({
  name: "chaindoc_templates_create_document",
  description:
    "Print a PUBLISHED template with `variables` into a new DRAFT document (never sent, never published). " +
    "A required value left empty stays on the draft as its field; a value its field cannot hold is TEMPLATE_VALUES_REFUSED.",
  inputSchema: CreateDocumentSchema,
  handler: (args, { client }) => {
    const { templateId, ...params } = args;
    return client.run("chaindoc_templates_create_document", (sdk) =>
      sdk.templates.createDocument(templateId, params),
    );
  },
});

export const templatesSendForSigning = defineTool({
  name: "chaindoc_templates_send_for_signing",
  description:
    "Print a published template and send it for signature in one call: a signature request is created and the " +
    "signers are emailed. Fill EVERY signer slot exactly once with `slotAssignments` ({ signerKey, email, account? }); " +
    "TEMPLATE_SLOTS_REFUSED otherwise. A required value left empty is TEMPLATE_VALUES_MISSING. Signers fill their own " +
    "fields as they sign: delegated signing and per-signer variables are not supported. Confirm the recipients with the user first.",
  inputSchema: SendForSigningSchema,
  handler: (args, { client }) => {
    const { templateId, deadline, ...rest } = args;
    return client.run("chaindoc_templates_send_for_signing", (sdk) =>
      sdk.templates.sendForSigning(templateId, { ...rest, deadline: new Date(deadline) }),
    );
  },
});

export const templatesCreateContract = defineTool({
  name: "chaindoc_templates_create_contract",
  description:
    "Print a published CONTRACT template as the paper of a new contract with `contragent` and start its signing. " +
    "The template must hold exactly two signer slots: map one to role 'business' and the other to 'contragent' in " +
    "`slotAssignments` ({ signerKey, role }). Use `contragentAccount` (from chaindoc_accounts_lookup) to propose a " +
    "workspace to the counterparty. The counterparty is emailed: confirm the details with the user first.",
  inputSchema: CreateContractSchema,
  handler: (args, { client }) => {
    const { templateId, deadline, ...rest } = args;
    return client.run("chaindoc_templates_create_contract", (sdk) =>
      sdk.templates.createContract(templateId, { ...rest, deadline: new Date(deadline) }),
    );
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
