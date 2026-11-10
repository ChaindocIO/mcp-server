import { z } from "zod";
import { defineTool, type ToolDefinition } from "./types.js";
import { BillingAddressSchema } from "./schemas.js";

/**
 * Counterparties, tax treatments and payment instructions.
 *
 *   GET/POST /api/v1/contragents, GET/PATCH /api/v1/contragents/:id
 *   GET      /api/v1/tax-treatments
 *   GET      /api/v1/payment-instructions            (READ ONLY here)
 *
 * Payment instructions (bank details, crypto wallets) are READ ONLY in this server: nothing creates, changes,
 * defaults or assigns them. Where invoices get paid is the owner's decision, made in the Chaindoc app.
 */

const ContragentIdSchema = z.object({ contragentId: z.string().uuid() });

const EntityTypeSchema = z.enum(["person", "company"]);

const ContragentFields = {
  name: z.string().optional(),
  legalName: z.string().optional(),
  entityType: EntityTypeSchema.optional(),
  phone: z.string().optional(),
  billingAddress: BillingAddressSchema.optional(),
  taxId: z.string().optional(),
  vatNumber: z.string().optional(),
  registrationNumber: z.string().optional(),
};

const ContragentCreateSchema = z.object({
  email: z.string().email(),
  ...ContragentFields,
});

// strict(): a payment-instruction assignment (or any unknown key) is refused, not dropped.
const ContragentUpdateSchema = z
  .object({
    contragentId: z.string().uuid(),
    ...ContragentFields,
  })
  .strict();

export const contragentsList = defineTool({
  name: "chaindoc_contragents_list",
  description:
    "List the business's counterparties (the address book invoices and contracts bill): id, email, legal identity, " +
    "billing address, VAT/tax ids, tax treatment, payment terms. Use the `id` with the other contragent tools.",
  inputSchema: z.object({}),
  handler: (_args, { client }) => client.run("chaindoc_contragents_list", (sdk) => sdk.contragents.list()),
});

export const contragentsGet = defineTool({
  name: "chaindoc_contragents_get",
  description: "Fetch one counterparty by id: legal identity, billing address, tax treatment, payment-instruction override, terms.",
  inputSchema: ContragentIdSchema,
  handler: (args, { client }) =>
    client.run("chaindoc_contragents_get", (sdk) => sdk.contragents.get(args.contragentId)),
});

export const contragentsCreate = defineTool({
  name: "chaindoc_contragents_create",
  description:
    "Add a counterparty to the address book. An e-mail already in it is refused with 409 (never silently reused): " +
    "find it with chaindoc_contragents_list. Its legal identity (legalName, entityType, vatNumber, registrationNumber, " +
    "billingAddress) is what prints on its invoices and decides VAT.",
  inputSchema: ContragentCreateSchema,
  handler: (args, { client }) =>
    client.run("chaindoc_contragents_create", (sdk) => sdk.contragents.create(args)),
});

export const contragentsUpdate = defineTool({
  name: "chaindoc_contragents_update",
  description:
    "Change a counterparty's identity fields (the e-mail cannot change). Applies to invoices issued from now on, not " +
    "to ones already sent. Payment details cannot be set here: they are the owner's, set in the Chaindoc app.",
  inputSchema: ContragentUpdateSchema,
  handler: (args, { client }) => {
    const { contragentId, ...patch } = args;
    return client.run("chaindoc_contragents_update", (sdk) => sdk.contragents.update(contragentId, patch));
  },
});

export const taxTreatmentsList = defineTool({
  name: "chaindoc_tax_treatments_list",
  description:
    "List the tax treatments an invoice can name (code, label, rate, country, whether a buyer/seller VAT number is " +
    "required, which is the business default). Pass the `id` as `taxTreatmentId` of chaindoc_invoices_create. Omitted, " +
    "the counterparty's own setting applies, else the default.",
  inputSchema: z.object({}),
  handler: (_args, { client }) => client.run("chaindoc_tax_treatments_list", (sdk) => sdk.taxTreatments.list()),
});

export const paymentInstructionsList = defineTool({
  name: "chaindoc_payment_instructions_list",
  description:
    "READ ONLY. List the business's payment instructions (bank accounts, crypto wallets, other), default first: id, type, " +
    "label, currencyCode (null = any currency), isDefault and the details as they print on invoices. Bank details " +
    "cannot be created, changed, made default, assigned or chosen for an invoice " +
    "through this server - if the user wants that, tell them to do it in the Chaindoc app. Never ask the user to type " +
    "bank details into the chat for use here.",
  inputSchema: z.object({}),
  handler: (_args, { client }) =>
    client.run("chaindoc_payment_instructions_list", (sdk) => sdk.paymentInstructions.list()),
});

export const financeTools: ToolDefinition<unknown>[] = [
  contragentsList as ToolDefinition<unknown>,
  contragentsGet as ToolDefinition<unknown>,
  contragentsCreate as ToolDefinition<unknown>,
  contragentsUpdate as ToolDefinition<unknown>,
  taxTreatmentsList as ToolDefinition<unknown>,
  paymentInstructionsList as ToolDefinition<unknown>,
];
