import { describe, it, expect, vi } from "vitest";
import {
  contragentsList,
  contragentsGet,
  contragentsCreate,
  contragentsUpdate,
  taxTreatmentsList,
  paymentInstructionsList,
  financeTools,
} from "../../src/tools/finance.js";
import { accountsLookup } from "../../src/tools/account.js";
import { allTools } from "../../src/tools/index.js";
import { zodToJsonSchema } from "../../src/util/zod-to-json-schema.js";
import { fakeClient, fakeDownloads, fakeLogger } from "./_fakes.js";

const XID = "00000000-0000-0000-0000-000000000001";

const ctx = (sdk: Record<string, unknown>) => ({
  client: fakeClient(sdk as never),
  logger: fakeLogger(),
  downloads: fakeDownloads(),
});

describe("accounts lookup", () => {
  it("looks emails up and returns the options", async () => {
    const lookup = vi.fn().mockResolvedValue({ results: [{ email: "anna@example.com", status: "options", options: [{ kind: "personal" }] }] });
    const args = accountsLookup.inputSchema.parse({ emails: ["anna@example.com"] });
    const out = await accountsLookup.handler(args, ctx({ accounts: { lookup } }));
    expect(lookup).toHaveBeenCalledWith({ emails: ["anna@example.com"] });
    expect(out).toMatchObject({ results: [{ status: "options" }] });
  });

  it("refuses an empty batch and one over 25", () => {
    expect(() => accountsLookup.inputSchema.parse({ emails: [] })).toThrow();
    const many = Array.from({ length: 26 }, (_, i) => `p${i}@example.com`);
    expect(() => accountsLookup.inputSchema.parse({ emails: many })).toThrow();
  });
});

describe("contragents", () => {
  it("list and get", async () => {
    const list = vi.fn().mockResolvedValue({ contragents: [] });
    const get = vi.fn().mockResolvedValue({ contragent: {} });
    await contragentsList.handler({}, ctx({ contragents: { list } }));
    await contragentsGet.handler(contragentsGet.inputSchema.parse({ contragentId: XID }), ctx({ contragents: { get } }));
    expect(list).toHaveBeenCalled();
    expect(get).toHaveBeenCalledWith(XID);
  });

  it("create forwards the legal identity", async () => {
    const create = vi.fn().mockResolvedValue({ contragentId: XID });
    const args = contragentsCreate.inputSchema.parse({
      email: "ops@example.com", legalName: "Acme Ltd", entityType: "company", vatNumber: "DE123456789",
      billingAddress: { line1: "1 Main St", city: "Berlin", postalCode: "10115", country: "DE" },
    });
    await contragentsCreate.handler(args, ctx({ contragents: { create } }));
    expect(create).toHaveBeenCalledWith(args);
  });

  it("create refuses an e-mail already in the book (409 passes through)", async () => {
    const conflict = Object.assign(new Error("Contragent exists"), { statusCode: 409 });
    const create = vi.fn().mockRejectedValue(conflict);
    await expect(
      contragentsCreate.handler(contragentsCreate.inputSchema.parse({ email: "ops@example.com" }), ctx({ contragents: { create } })),
    ).rejects.toBe(conflict);
  });

  it("update cannot assign payment details: the key is refused, not dropped", () => {
    expect(() =>
      contragentsUpdate.inputSchema.parse({ contragentId: XID, paymentInstructionId: XID }),
    ).toThrow();
  });

  it("update forwards only identity fields", async () => {
    const update = vi.fn().mockResolvedValue({});
    const args = contragentsUpdate.inputSchema.parse({ contragentId: XID, vatNumber: "DE1" });
    await contragentsUpdate.handler(args, ctx({ contragents: { update } }));
    expect(update).toHaveBeenCalledWith(XID, { vatNumber: "DE1" });
  });
});

describe("tax treatments", () => {
  it("lists them", async () => {
    const list = vi.fn().mockResolvedValue({ taxTreatments: [{ id: XID, code: "DE_19" }] });
    const out = await taxTreatmentsList.handler({}, ctx({ taxTreatments: { list } }));
    expect(out).toMatchObject({ taxTreatments: [{ code: "DE_19" }] });
  });
});

describe("payment instructions are READ ONLY", () => {
  it("lists the instructions", async () => {
    const list = vi.fn().mockResolvedValue({ paymentInstructions: [{ id: XID, type: "bank", isDefault: true }] });
    const out = await paymentInstructionsList.handler({}, ctx({ paymentInstructions: { list } }));
    expect(list).toHaveBeenCalled();
    expect(out).toMatchObject({ paymentInstructions: [{ type: "bank" }] });
  });

  it("no tool creates, updates, defaults or assigns payment instructions", () => {
    const names = allTools.map((t) => t.name);
    const touching = names.filter((n) => /payment_instruction/.test(n));
    expect(touching).toEqual(["chaindoc_payment_instructions_list"]);
    expect(names.filter((n) => /(create|update|set|assign|default|delete).*(payment_instruction|bank)|(payment_instruction|bank).*(create|update|set|assign|default|delete)/.test(n))).toEqual([]);
    expect(financeTools.map((t) => t.name).filter((n) => n.includes("payment_instruction"))).toEqual([
      "chaindoc_payment_instructions_list",
    ]);
  });

  it("no tool accepts a payment instruction (invoice, contract, contragent)", () => {
    for (const t of allTools) {
      const shape = JSON.stringify(zodToJsonSchema(t.inputSchema));
      expect(shape, t.name).not.toContain("paymentInstructionId");
    }
  });

  it("the description says it is read only and bank details are made in the app", () => {
    expect(paymentInstructionsList.description).toMatch(/READ ONLY/);
    expect(paymentInstructionsList.description).toMatch(/Chaindoc app/);
  });
});
