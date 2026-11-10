import { describe, it, expect, vi } from "vitest";
import { allPrompts } from "../../src/prompts/index.js";
import { allTools } from "../../src/tools/index.js";
import { listResources, readResource, WORKSPACE_LINKS_GUIDE } from "../../src/resources/index.js";
import { fakeClient } from "./_fakes.js";

const buildAll = () =>
  allPrompts.map((p) => ({
    name: p.name,
    text: p.build(Object.fromEntries(p.arguments.map((a) => [a.name, "X"]))).map((m) => m.content.text).join("\n"),
  }));

describe("prompts", () => {
  it("every tool a prompt names exists", () => {
    const names = new Set(allTools.map((t) => t.name));
    for (const p of buildAll()) {
      for (const m of p.text.matchAll(/chaindoc_[a-z][a-z0-9_]*/g)) {
        expect(names.has(m[0]), `${p.name} names ${m[0]}`).toBe(true);
      }
    }
  });

  it("nothing teaches previews, Tiptap or coordinate fields", () => {
    for (const p of buildAll()) {
      expect(p.text, p.name).not.toMatch(/Tiptap|contentJson|preview_(html|pdf)|xPct|pageIndex/);
    }
  });

  it("money prompts make the agent ask first", () => {
    for (const name of ["record_offline_payment", "credit_an_invoice"]) {
      const text = buildAll().find((p) => p.name === name)!.text;
      expect(text).toMatch(/confirm/i);
      expect(text).toContain("confirm=true");
    }
  });

  it("app links are workspace links", () => {
    for (const p of buildAll()) {
      expect(p.text, p.name).not.toMatch(/(^|[\s(])\/(documents|contracts|invoices|templates)\//);
    }
    expect(buildAll().some((p) => p.text.includes("/w/{workspaceUuid}/"))).toBe(true);
  });

  it("covers files, templates, money and processes", () => {
    const names = allPrompts.map((p) => p.name);
    for (const n of ["send_file_for_signature", "send_from_template", "record_offline_payment", "credit_an_invoice", "start_a_process"]) {
      expect(names).toContain(n);
    }
  });
});

describe("resources", () => {
  it("a source that fails is listed with its reason, not swallowed", async () => {
    const refused = Object.assign(new Error("Business plan needed"), { statusCode: 403, errorKey: "INTEGRATIONS_NOT_IN_PLAN" });
    const client = fakeClient({
      signatures: { getMyRequests: vi.fn().mockRejectedValue(refused) } as never,
      contracts: { list: vi.fn().mockResolvedValue({ contracts: [{ id: "c1", title: "MSA", status: "active" }] }) } as never,
      templates: { list: vi.fn().mockResolvedValue({ templates: [] }) } as never,
    });
    const items = await listResources(client);
    const failure = items.find((i) => i.uri.startsWith("chaindoc://errors/"));
    expect(failure?.description).toContain("INTEGRATIONS_NOT_IN_PLAN");
    expect(items.some((i) => i.uri === "chaindoc://contracts/c1")).toBe(true);
  });

  it("the workspace guide uses the app's real paths", async () => {
    const r = await readResource("chaindoc://guide/workspace-links", fakeClient({}));
    expect(r.text).toBe(WORKSPACE_LINKS_GUIDE);
    for (const p of ["/documents/{documentId}", "/contracts/{contractId}", "/invoices/{invoiceId}", "/templates/{templateId}", "/process-cases/{caseUuid}", "/settings/payment-details"]) {
      expect(r.text).toContain(p);
    }
    expect(r.text).toContain("/w/{workspaceUuid}");
  });

  it("payment instructions are exposed read only", async () => {
    const list = vi.fn().mockResolvedValue({ paymentInstructions: [] });
    const r = await readResource("chaindoc://payment-instructions", fakeClient({ paymentInstructions: { list } as never }));
    expect(list).toHaveBeenCalled();
    expect(JSON.parse(r.text)).toEqual({ paymentInstructions: [] });
  });

  it("an unknown URI is a 404", async () => {
    await expect(readResource("chaindoc://nope", fakeClient({}))).rejects.toMatchObject({ status: 404 });
  });
});
