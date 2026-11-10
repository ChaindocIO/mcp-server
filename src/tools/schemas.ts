import { z } from "zod";

/** Where a person is addressed: an option returned by chaindoc_accounts_lookup, passed back unchanged. */
export const AccountChoiceSchema = z
  .union([
    z.object({ kind: z.literal("personal") }),
    z.object({ kind: z.literal("workspace"), workspaceId: z.string().min(1) }),
  ])
  .describe(
    "Optional. Where this person is addressed: one of the `options` from chaindoc_accounts_lookup " +
      "({kind:'personal'} or {kind:'workspace', workspaceId}). Omit for the person's personal account.",
  );

/**
 * A text document: the engine's content, version 2. Fields and signer roles live in the text as chips; a
 * `template` mode text holds the field definitions (`doc.attrs.fields`) and the signer roles (`doc.attrs.signers`).
 */
export const DocumentContentSchema = z
  .object({
    version: z.literal(2),
    mode: z.enum(["document", "template"]),
    doc: z.record(z.unknown()),
  })
  .describe(
    "Engine content v2: { version: 2, mode: 'document' | 'template', doc: { type: 'doc', content: [...] } }. " +
      "Read an existing one with chaindoc_documents_get_content and edit that tree rather than inventing node types.",
  );

export const MetaTagSchema = z.object({ key: z.string(), value: z.string() });

export const AccessEmailSchema = z.object({
  email: z.string().email(),
  level: z.enum(["read", "write"]).optional().describe("Defaults to read."),
  account: AccountChoiceSchema.optional(),
});

export const AccessTypeSchema = z
  .enum(["private", "public", "restricted", "team"])
  .describe(
    "'private' only me, 'restricted' the people in accessEmails, 'team' the whole workspace, 'public' anyone with the link.",
  );

export const BillingAddressSchema = z.object({
  line1: z.string(),
  line2: z.string().optional(),
  city: z.string(),
  state: z.string().optional(),
  postalCode: z.string(),
  country: z.string().length(2).describe("ISO-3166-1 alpha-2"),
});

export const ContragentInfoSchema = z.object({
  email: z.string().email(),
  name: z.string().optional(),
  legalName: z.string().optional().describe("Registered legal name, distinct from the display name."),
  entityType: z.enum(["person", "company"]).optional(),
  phone: z.string().optional(),
  billingAddress: BillingAddressSchema.optional(),
  taxId: z.string().optional(),
  vatNumber: z.string().optional(),
  registrationNumber: z.string().optional(),
});

export const DecimalString = z
  .string()
  .regex(/^\d+(\.\d{1,2})?$/, "decimal string with at most 2 places, e.g. '5000.00'");
