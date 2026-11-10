import { describe, it, expect, vi } from "vitest";
import {
  templatesList, templatesGet, templatesGetVersions,
  templatesCreate, templatesUpdate, templatesPublish,
  templatesArchive, templatesRestore, templatesDelete,
  templatesCreateDocument, templatesSendForSigning, templatesCreateContract,
} from "../../src/tools/templates.js";
import { fakeClient, fakeDownloads, fakeLogger } from "./_fakes.js";

const TID = "00000000-0000-0000-0000-000000000001";

function tplClient(fns: Record<string, ReturnType<typeof vi.fn>>) {
  return fakeClient({
    templates: {
      list: fns["list"] ?? vi.fn(),
      get: fns["get"] ?? vi.fn(),
      getVersions: fns["getVersions"] ?? vi.fn(),
      create: fns["create"] ?? vi.fn(),
      update: fns["update"] ?? vi.fn(),
      publish: fns["publish"] ?? vi.fn(),
      archive: fns["archive"] ?? vi.fn(),
      restore: fns["restore"] ?? vi.fn(),
      delete: fns["delete"] ?? vi.fn(),
      createDocument: vi.fn(),
      sendForSigning: vi.fn(),
      createContract: vi.fn(),
    } as never,
  });
}
const ctx = (client = tplClient({})) => ({ client, logger: fakeLogger(), downloads: fakeDownloads() });

describe("templates CRUD + lifecycle", () => {
  it("list forwards filters with defaults", async () => {
    const list = vi.fn().mockResolvedValue({ templates: [] });
    const args = templatesList.inputSchema.parse({});
    await templatesList.handler(args, ctx(tplClient({ list })));
    expect(list).toHaveBeenCalledWith({ page: 1, limit: 20 });
  });

  it("get forwards templateId", async () => {
    const get = vi.fn().mockResolvedValue({ template: {} });
    const args = templatesGet.inputSchema.parse({ templateId: TID });
    await templatesGet.handler(args, ctx(tplClient({ get })));
    expect(get).toHaveBeenCalledWith(TID);
  });

  it("get_versions forwards templateId", async () => {
    const getVersions = vi.fn().mockResolvedValue({ versions: [] });
    const args = templatesGetVersions.inputSchema.parse({ templateId: TID });
    await templatesGetVersions.handler(args, ctx(tplClient({ getVersions })));
    expect(getVersions).toHaveBeenCalledWith(TID);
  });

  it("create forwards name + category + content (new format)", async () => {
    const create = vi.fn().mockResolvedValue({ template: { id: TID } });
    const content = { version: 2 as const, mode: "template" as const, doc: { type: "doc", content: [] } };
    const args = templatesCreate.inputSchema.parse({ name: "NDA", category: "nda", content });
    await templatesCreate.handler(args, ctx(tplClient({ create })));
    expect(create).toHaveBeenCalledWith({ name: "NDA", category: "nda", content });
  });

  it("create refuses the old contentJson (not silently dropped)", () => {
    expect(() =>
      templatesCreate.inputSchema.parse({ name: "X", category: "nda", contentJson: { type: "doc" } }),
    ).toThrow();
  });

  it("create refuses document-mode content", () => {
    expect(() =>
      templatesCreate.inputSchema.parse({
        name: "X", category: "nda", content: { version: 2, mode: "document", doc: { type: "doc" } },
      }),
    ).toThrow();
  });

  it("create rejects unknown category", () => {
    expect(() => templatesCreate.inputSchema.parse({
      name: "X", category: "weird_category", content: { version: 2, mode: "template", doc: {} },
    })).toThrow();
  });

  it("update content needs the revision", () => {
    const content = { version: 2, mode: "template", doc: { type: "doc" } };
    expect(() => templatesUpdate.inputSchema.parse({ templateId: TID, content })).toThrow(/revision/);
  });

  it("update forwards content with its revision", async () => {
    const update = vi.fn().mockResolvedValue({ template: {} });
    const content = { version: 2 as const, mode: "template" as const, doc: { type: "doc" } };
    const args = templatesUpdate.inputSchema.parse({ templateId: TID, content, revision: 4 });
    await templatesUpdate.handler(args, ctx(tplClient({ update })));
    expect(update).toHaveBeenCalledWith(TID, { content, revision: 4 });
  });

  it("update partial — only name + category", async () => {
    const update = vi.fn().mockResolvedValue({ template: {} });
    const args = templatesUpdate.inputSchema.parse({
      templateId: TID, name: "Renamed", category: "contract",
    });
    await templatesUpdate.handler(args, ctx(tplClient({ update })));
    expect(update).toHaveBeenCalledWith(TID, { name: "Renamed", category: "contract" });
  });

  it("publish forwards changelog and revision", async () => {
    const publish = vi.fn().mockResolvedValue({ template: {} });
    const args = templatesPublish.inputSchema.parse({ templateId: TID, changelog: "v2", revision: 3 });
    await templatesPublish.handler(args, ctx(tplClient({ publish })));
    expect(publish).toHaveBeenCalledWith(TID, { changelog: "v2", revision: 3 });
  });

  it("publish passes undefined when no changelog", async () => {
    const publish = vi.fn().mockResolvedValue({ template: {} });
    const args = templatesPublish.inputSchema.parse({ templateId: TID });
    await templatesPublish.handler(args, ctx(tplClient({ publish })));
    expect(publish).toHaveBeenCalledWith(TID, undefined);
  });

  it("archive forwards templateId", async () => {
    const archive = vi.fn().mockResolvedValue({ template: {} });
    const args = templatesArchive.inputSchema.parse({ templateId: TID });
    await templatesArchive.handler(args, ctx(tplClient({ archive })));
    expect(archive).toHaveBeenCalledWith(TID);
  });

  it("restore forwards templateId", async () => {
    const restore = vi.fn().mockResolvedValue({ template: {} });
    const args = templatesRestore.inputSchema.parse({ templateId: TID });
    await templatesRestore.handler(args, ctx(tplClient({ restore })));
    expect(restore).toHaveBeenCalledWith(TID);
  });

  it("delete is permanent: refused without confirm, nothing is called", async () => {
    const del = vi.fn();
    const args = templatesDelete.inputSchema.parse({ templateId: TID });
    await expect(templatesDelete.handler(args, ctx(tplClient({ delete: del })))).rejects.toMatchObject({
      name: "ConfirmationRequiredError",
    });
    expect(del).not.toHaveBeenCalled();
  });

  it("delete forwards templateId once confirmed", async () => {
    const del = vi.fn().mockResolvedValue({ ok: true });
    const args = templatesDelete.inputSchema.parse({ templateId: TID, confirm: true });
    await templatesDelete.handler(args, ctx(tplClient({ delete: del })));
    expect(del).toHaveBeenCalledWith(TID);
  });
});

describe("templates runtime (new templates)", () => {
  const rt = (fns: Record<string, ReturnType<typeof vi.fn>>) =>
    ctx(fakeClient({ templates: fns as never }));

  it("create_document passes variables and is a draft shell", async () => {
    const createDocument = vi.fn().mockResolvedValue({ documentId: "d" });
    const args = templatesCreateDocument.inputSchema.parse({
      templateId: TID, documentName: "NDA", variables: { client: "Acme", paid: true },
    });
    await templatesCreateDocument.handler(args, rt({ createDocument }));
    expect(createDocument).toHaveBeenCalledWith(TID, { documentName: "NDA", variables: { client: "Acme", paid: true } });
  });

  it("send_for_signing fills slots by email and account", async () => {
    const sendForSigning = vi.fn().mockResolvedValue({ requestId: "r" });
    const args = templatesSendForSigning.inputSchema.parse({
      templateId: TID,
      documentName: "NDA",
      variables: {},
      slotAssignments: [{ signerKey: "client", email: "anna@example.com", account: { kind: "workspace", workspaceId: "w1" } }],
      deadline: "2027-01-01T00:00:00Z",
    });
    await templatesSendForSigning.handler(args, rt({ sendForSigning }));
    const [id, body] = sendForSigning.mock.calls[0]!;
    expect(id).toBe(TID);
    expect(body.slotAssignments).toEqual([
      { signerKey: "client", email: "anna@example.com", account: { kind: "workspace", workspaceId: "w1" } },
    ]);
    expect(body.deadline).toEqual(new Date("2027-01-01T00:00:00Z"));
  });

  it("send_for_signing refuses delegated signing and signerVariables", () => {
    const base = { templateId: TID, documentName: "NDA", variables: {}, deadline: "2027-01-01T00:00:00Z" };
    expect(() =>
      templatesSendForSigning.inputSchema.parse({
        ...base, slotAssignments: [{ signerKey: "c", email: "a@example.com", signingMethod: "delegated" }],
      }),
    ).toThrow();
    expect(() =>
      templatesSendForSigning.inputSchema.parse({
        ...base, slotAssignments: [{ signerKey: "c", email: "a@example.com", signerVariables: { x: "1" } }],
      }),
    ).toThrow();
  });

  it("create_contract maps the two slots to business and contragent", async () => {
    const createContract = vi.fn().mockResolvedValue({ contractId: "c" });
    const args = templatesCreateContract.inputSchema.parse({
      templateId: TID,
      variables: {},
      slotAssignments: [
        { signerKey: "us", role: "business" },
        { signerKey: "them", role: "contragent" },
      ],
      title: "MSA",
      contragent: { email: "ops@example.com", legalName: "Acme Ltd", vatNumber: "DE123", entityType: "company" },
      contragentAccount: { kind: "workspace", workspaceId: "w9" },
      deadline: "2027-01-01T00:00:00Z",
    });
    await templatesCreateContract.handler(args, rt({ createContract }));
    const body = createContract.mock.calls[0]![1];
    expect(body.contragent).toMatchObject({ legalName: "Acme Ltd", vatNumber: "DE123" });
    expect(body.contragentAccount).toEqual({ kind: "workspace", workspaceId: "w9" });
  });

  it("create_contract needs exactly two slots", () => {
    expect(() =>
      templatesCreateContract.inputSchema.parse({
        templateId: TID, variables: {}, slotAssignments: [{ signerKey: "us", role: "business" }],
        title: "MSA", contragent: { email: "ops@example.com" }, deadline: "2027-01-01T00:00:00Z",
      }),
    ).toThrow();
  });

  it("has no preview tools any more", async () => {
    const mod = await import("../../src/tools/templates.js");
    expect(Object.keys(mod).filter((k) => /preview/i.test(k))).toEqual([]);
  });
});
