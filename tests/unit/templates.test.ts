import { describe, it, expect, vi } from "vitest";
import {
  templatesList, templatesGet, templatesGetVersions,
  templatesCreate, templatesUpdate, templatesPublish,
  templatesArchive, templatesRestore, templatesDelete,
  templatesPreviewPdf, templatesPreviewHtml, templatesPreviewUnsavedPdf,
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
      previewPdf: vi.fn(),
      previewHtml: vi.fn(),
      previewUnsavedPdf: vi.fn(),
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

  it("create forwards name + category + contentJson", async () => {
    const create = vi.fn().mockResolvedValue({ template: { id: TID } });
    const args = templatesCreate.inputSchema.parse({
      name: "NDA",
      category: "nda",
      contentJson: { type: "doc", content: [] },
    });
    await templatesCreate.handler(args, ctx(tplClient({ create })));
    expect(create).toHaveBeenCalledWith({
      name: "NDA",
      category: "nda",
      contentJson: { type: "doc", content: [] },
    });
  });

  it("create rejects unknown category", () => {
    expect(() => templatesCreate.inputSchema.parse({
      name: "X", category: "weird_category", contentJson: {},
    })).toThrow();
  });

  it("update partial — only name + category", async () => {
    const update = vi.fn().mockResolvedValue({ template: {} });
    const args = templatesUpdate.inputSchema.parse({
      templateId: TID, name: "Renamed", category: "contract",
    });
    await templatesUpdate.handler(args, ctx(tplClient({ update })));
    expect(update).toHaveBeenCalledWith(TID, { name: "Renamed", category: "contract" });
  });

  it("publish forwards optional changelog", async () => {
    const publish = vi.fn().mockResolvedValue({ template: {} });
    const args = templatesPublish.inputSchema.parse({ templateId: TID, changelog: "v2" });
    await templatesPublish.handler(args, ctx(tplClient({ publish })));
    expect(publish).toHaveBeenCalledWith(TID, { changelog: "v2" });
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

  it("delete forwards templateId", async () => {
    const del = vi.fn().mockResolvedValue({ ok: true });
    const args = templatesDelete.inputSchema.parse({ templateId: TID });
    await templatesDelete.handler(args, ctx(tplClient({ delete: del })));
    expect(del).toHaveBeenCalledWith(TID);
  });
});

describe("templates previews", () => {
  it("preview_pdf routes through adapter", async () => {
    const previewPdf = vi.fn().mockResolvedValue({
      data: new TextEncoder().encode("pdf").buffer,
      contentType: "application/pdf",
    });
    const client = fakeClient({
      templates: {
        list: vi.fn(), get: vi.fn(), getVersions: vi.fn(),
        create: vi.fn(), update: vi.fn(), publish: vi.fn(),
        archive: vi.fn(), restore: vi.fn(), delete: vi.fn(),
        previewPdf, previewHtml: vi.fn(), previewUnsavedPdf: vi.fn(),
        createDocument: vi.fn(), sendForSigning: vi.fn(), createContract: vi.fn(),
      } as never,
    });
    const args = templatesPreviewPdf.inputSchema.parse({
      templateId: TID, variables: { name: "Acme" },
    });
    const r = await templatesPreviewPdf.handler(args, {
      client, logger: fakeLogger(), downloads: fakeDownloads({ mode: "inline" }),
    });
    expect(previewPdf).toHaveBeenCalledWith(TID, { variables: { name: "Acme" } });
    expect((r as { kind: string }).kind).toBe("inline");
  });

  it("preview_pdf passes undefined when no variables", async () => {
    const previewPdf = vi.fn().mockResolvedValue({
      data: new TextEncoder().encode("p").buffer, contentType: "application/pdf",
    });
    const client = fakeClient({
      templates: {
        list: vi.fn(), get: vi.fn(), getVersions: vi.fn(),
        create: vi.fn(), update: vi.fn(), publish: vi.fn(),
        archive: vi.fn(), restore: vi.fn(), delete: vi.fn(),
        previewPdf, previewHtml: vi.fn(), previewUnsavedPdf: vi.fn(),
        createDocument: vi.fn(), sendForSigning: vi.fn(), createContract: vi.fn(),
      } as never,
    });
    const args = templatesPreviewPdf.inputSchema.parse({ templateId: TID });
    await templatesPreviewPdf.handler(args, {
      client, logger: fakeLogger(), downloads: fakeDownloads({ mode: "inline" }),
    });
    expect(previewPdf).toHaveBeenCalledWith(TID, undefined);
  });

  it("preview_html returns { html } as-is (not adapter)", async () => {
    const previewHtml = vi.fn().mockResolvedValue({ success: true, html: "<p>Hi</p>" });
    const client = fakeClient({
      templates: {
        list: vi.fn(), get: vi.fn(), getVersions: vi.fn(),
        create: vi.fn(), update: vi.fn(), publish: vi.fn(),
        archive: vi.fn(), restore: vi.fn(), delete: vi.fn(),
        previewPdf: vi.fn(), previewHtml, previewUnsavedPdf: vi.fn(),
        createDocument: vi.fn(), sendForSigning: vi.fn(), createContract: vi.fn(),
      } as never,
    });
    const args = templatesPreviewHtml.inputSchema.parse({ templateId: TID });
    const r = await templatesPreviewHtml.handler(args, { client, logger: fakeLogger(), downloads: fakeDownloads() });
    expect(previewHtml).toHaveBeenCalledWith(TID, undefined);
    expect((r as { html: string }).html).toBe("<p>Hi</p>");
  });

  it("preview_unsaved_pdf forwards contentJson and routes through adapter", async () => {
    const previewUnsavedPdf = vi.fn().mockResolvedValue({
      data: new TextEncoder().encode("u").buffer, contentType: "application/pdf",
    });
    const client = fakeClient({
      templates: {
        list: vi.fn(), get: vi.fn(), getVersions: vi.fn(),
        create: vi.fn(), update: vi.fn(), publish: vi.fn(),
        archive: vi.fn(), restore: vi.fn(), delete: vi.fn(),
        previewPdf: vi.fn(), previewHtml: vi.fn(), previewUnsavedPdf,
        createDocument: vi.fn(), sendForSigning: vi.fn(), createContract: vi.fn(),
      } as never,
    });
    const args = templatesPreviewUnsavedPdf.inputSchema.parse({
      contentJson: { type: "doc", content: [] },
      variables: { x: 1 },
    });
    const r = await templatesPreviewUnsavedPdf.handler(args, {
      client, logger: fakeLogger(), downloads: fakeDownloads({ mode: "inline" }),
    });
    expect(previewUnsavedPdf).toHaveBeenCalledWith({
      contentJson: { type: "doc", content: [] },
      variables: { x: 1 },
    });
    expect((r as { kind: string }).kind).toBe("inline");
  });
});
