import { describe, it, expect, vi } from "vitest";
import {
  documentsGet,
  documentsGetVersions,
  documentsSearch,
  documentsListShared,
  documentsGetActivity,
  documentsGetDownloads,
  documentsCommentsAdd,
  documentsCommentsList,
  documentsSendPublicLink,
} from "../../src/tools/documents.js";
import { fakeClient, fakeDownloads, fakeLogger } from "./_fakes.js";

const ID = "00000000-0000-0000-0000-000000000001";

function ctx(over: Record<string, ReturnType<typeof vi.fn>>) {
  const client = fakeClient({
    documents: {
      create: vi.fn(), update: vi.fn(), updateRights: vi.fn(),
      verify: vi.fn(), getVerificationStatus: vi.fn(),
      get: over["get"] ?? vi.fn(),
      getVersions: over["getVersions"] ?? vi.fn(),
      search: over["search"] ?? vi.fn(),
      listShared: over["listShared"] ?? vi.fn(),
      getActivity: over["getActivity"] ?? vi.fn(),
      getDownloads: over["getDownloads"] ?? vi.fn(),
    } as never,
  });
  return { client, logger: fakeLogger(), downloads: fakeDownloads() };
}

describe("documents read-only queries", () => {
  it("get forwards documentId", async () => {
    const get = vi.fn().mockResolvedValue({ id: ID });
    const c = ctx({ get });
    await documentsGet.handler(documentsGet.inputSchema.parse({ documentId: ID }), c);
    expect(get).toHaveBeenCalledWith(ID);
  });

  it("get rejects non-uuid", () => {
    expect(() => documentsGet.inputSchema.parse({ documentId: "nope" })).toThrow();
  });

  it("get_versions passes pagination", async () => {
    const getVersions = vi.fn().mockResolvedValue({ items: [] });
    const c = ctx({ getVersions });
    const args = documentsGetVersions.inputSchema.parse({ documentId: ID, pageNumber: 2, pageSize: 5 });
    await documentsGetVersions.handler(args, c);
    expect(getVersions).toHaveBeenCalledWith(ID, { pageNumber: 2, pageSize: 5 });
  });

  it("search forwards search/status/pagination", async () => {
    const search = vi.fn().mockResolvedValue({ documents: [] });
    const c = ctx({ search });
    const args = documentsSearch.inputSchema.parse({ search: "nda", status: "published", pageNumber: 1, pageSize: 20 });
    await documentsSearch.handler(args, c);
    expect(search).toHaveBeenCalledWith({ search: "nda", status: "published", pageNumber: 1, pageSize: 20 });
  });

  it("list_shared uses default pagination when empty", async () => {
    const listShared = vi.fn().mockResolvedValue({ documents: [] });
    const c = ctx({ listShared });
    const args = documentsListShared.inputSchema.parse({});
    await documentsListShared.handler(args, c);
    expect(listShared).toHaveBeenCalledWith({ pageNumber: 1, pageSize: 20 });
  });

  it("get_activity forwards documentId", async () => {
    const getActivity = vi.fn().mockResolvedValue({ events: [] });
    const c = ctx({ getActivity });
    await documentsGetActivity.handler(documentsGetActivity.inputSchema.parse({ documentId: ID }), c);
    expect(getActivity).toHaveBeenCalledWith(ID);
  });

  it("get_downloads forwards documentId", async () => {
    const getDownloads = vi.fn().mockResolvedValue({ events: [] });
    const c = ctx({ getDownloads });
    await documentsGetDownloads.handler(documentsGetDownloads.inputSchema.parse({ documentId: ID }), c);
    expect(getDownloads).toHaveBeenCalledWith(ID);
  });
});

describe("documents comments + public link", () => {
  it("comments_add forwards content", async () => {
    const add = vi.fn().mockResolvedValue({ id: "c_1" });
    const client = fakeClient({
      documents: {
        create: vi.fn(), update: vi.fn(), updateRights: vi.fn(),
        verify: vi.fn(), getVerificationStatus: vi.fn(),
        get: vi.fn(), getVersions: vi.fn(), search: vi.fn(), listShared: vi.fn(),
        getActivity: vi.fn(), getDownloads: vi.fn(),
        sendPublicLink: vi.fn(),
        comments: { add, list: vi.fn() },
      } as never,
    });
    const args = documentsCommentsAdd.inputSchema.parse({ documentId: ID, content: "looks good" });
    await documentsCommentsAdd.handler(args, { client, logger: fakeLogger(), downloads: fakeDownloads() });
    expect(add).toHaveBeenCalledWith(ID, { content: "looks good" });
  });

  it("comments_add rejects empty content", () => {
    expect(() => documentsCommentsAdd.inputSchema.parse({ documentId: ID, content: "" })).toThrow();
  });

  it("comments_list forwards pagination", async () => {
    const list = vi.fn().mockResolvedValue({ items: [] });
    const client = fakeClient({
      documents: {
        create: vi.fn(), update: vi.fn(), updateRights: vi.fn(),
        verify: vi.fn(), getVerificationStatus: vi.fn(),
        get: vi.fn(), getVersions: vi.fn(), search: vi.fn(), listShared: vi.fn(),
        getActivity: vi.fn(), getDownloads: vi.fn(),
        sendPublicLink: vi.fn(),
        comments: { add: vi.fn(), list },
      } as never,
    });
    const args = documentsCommentsList.inputSchema.parse({ documentId: ID, pageNumber: 1, pageSize: 50 });
    await documentsCommentsList.handler(args, { client, logger: fakeLogger(), downloads: fakeDownloads() });
    expect(list).toHaveBeenCalledWith(ID, { pageNumber: 1, pageSize: 50 });
  });

  it("send_public_link forwards email", async () => {
    const sendPublicLink = vi.fn().mockResolvedValue({ ok: true });
    const client = fakeClient({
      documents: {
        create: vi.fn(), update: vi.fn(), updateRights: vi.fn(),
        verify: vi.fn(), getVerificationStatus: vi.fn(),
        get: vi.fn(), getVersions: vi.fn(), search: vi.fn(), listShared: vi.fn(),
        getActivity: vi.fn(), getDownloads: vi.fn(),
        sendPublicLink,
        comments: { add: vi.fn(), list: vi.fn() },
      } as never,
    });
    const args = documentsSendPublicLink.inputSchema.parse({ documentId: ID, email: "a@b.com" });
    await documentsSendPublicLink.handler(args, { client, logger: fakeLogger(), downloads: fakeDownloads() });
    expect(sendPublicLink).toHaveBeenCalledWith(ID, { email: "a@b.com" });
  });

  it("send_public_link rejects invalid email", () => {
    expect(() => documentsSendPublicLink.inputSchema.parse({ documentId: ID, email: "nope" })).toThrow();
  });
});
