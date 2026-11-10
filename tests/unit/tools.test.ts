import { describe, it, expect } from "vitest";
import { z } from "zod";
import { allTools } from "../../src/tools/index.js";
import { zodToJsonSchema } from "../../src/util/zod-to-json-schema.js";

describe("tool catalog health", () => {
  it("every tool has a unique name", () => {
    const names = allTools.map((t) => t.name);
    const unique = new Set(names);
    expect(unique.size).toBe(names.length);
  });

  it("every tool has a non-trivial description", () => {
    for (const t of allTools) {
      expect(t.description, `${t.name} description`).toBeTruthy();
      expect(t.description.length, `${t.name} description length`).toBeGreaterThanOrEqual(40);
    }
  });

  it("every tool input schema is a Zod type", () => {
    for (const t of allTools) {
      expect(t.inputSchema, `${t.name} inputSchema`).toBeInstanceOf(z.ZodType);
    }
  });

  it("every tool name follows the chaindoc_ prefix", () => {
    for (const t of allTools) {
      expect(t.name).toMatch(/^chaindoc_[a-z][a-z0-9_]*$/);
    }
  });

  it("catalog size matches the v0.3.0 surface", () => {
    // 103 (0.2.0) - 3 template previews + 24 new tools (documents-as-text 5, conversions 2, storage upload 1,
    // signature resend 1, accounts lookup 1, credit notes 2, contragents/tax/payment instructions 6, processes 6) = 124.
    expect(allTools.length).toBe(124);
  });

  it("every tool schema converts to a JSON object schema", () => {
    for (const t of allTools) {
      const schema = zodToJsonSchema(t.inputSchema);
      expect(schema["type"], `${t.name} schema type`).toBe("object");
    }
  });

  it("no tool names another tool that does not exist", () => {
    const names = new Set(allTools.map((t) => t.name));
    for (const t of allTools) {
      for (const m of t.description.matchAll(/chaindoc_[a-z][a-z0-9_]*/g)) {
        expect(names.has(m[0]), `${t.name} mentions ${m[0]}`).toBe(true);
      }
    }
  });

  it("no tool teaches the removed template previews or the old template format", () => {
    for (const t of allTools) {
      expect(t.name, t.name).not.toMatch(/preview_(pdf|html|unsaved)/);
      expect(t.description, t.name).not.toMatch(/Tiptap|preview_html|preview_pdf/);
      if (/contentJson/.test(t.description)) expect(t.description, t.name).toMatch(/refused|gone/);
    }
  });

  it("no tool takes coordinate fields or a media handle for a document", () => {
    for (const t of allTools) {
      if (t.name === "chaindoc_signatures_create_signature") continue; // a saved-signature IMAGE handle
      const json = JSON.stringify(zodToJsonSchema(t.inputSchema));
      expect(json, t.name).not.toMatch(/"xPct"|"pageIndex"|"signerEmail"/);
      if (t.name.startsWith("chaindoc_documents_")) expect(json, t.name).not.toContain('"media"');
    }
  });

  it("every tool that moves money (or deletes for good) takes a confirm argument and says to ask the user", () => {
    const money = [
      "chaindoc_invoices_charge",
      "chaindoc_invoices_mark_paid",
      "chaindoc_invoices_create_credit_note",
      "chaindoc_templates_delete",
    ];
    for (const name of money) {
      const t = allTools.find((x) => x.name === name);
      expect(t, name).toBeDefined();
      const props = (zodToJsonSchema(t!.inputSchema)["properties"] ?? {}) as Record<string, unknown>;
      expect(Object.keys(props), name).toContain("confirm");
      expect(t!.description, name).toMatch(/ask the user/i);
    }
  });

  it("any tool with a confirm argument tells the agent not to set it on its own", () => {
    for (const t of allTools) {
      const props = (zodToJsonSchema(t.inputSchema)["properties"] ?? {}) as Record<string, { description?: string }>;
      if (props["confirm"]) {
        expect(JSON.stringify(props["confirm"]), t.name).toMatch(/USER|user/);
      }
    }
  });

  it("an unconfirmed call is a typed refusal, not a validation error (confirm defaults to false)", () => {
    for (const name of ["chaindoc_invoices_charge", "chaindoc_invoices_mark_paid"]) {
      const t = allTools.find((x) => x.name === name)!;
      const parsed = t.inputSchema.safeParse({
        contractId: "00000000-0000-0000-0000-000000000001",
        invoiceUuid: "00000000-0000-0000-0000-000000000002",
      });
      expect(parsed.success, name).toBe(true);
    }
  });
});
