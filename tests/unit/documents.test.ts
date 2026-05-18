import { describe, it, expect, vi } from "vitest";
import {
  documentsGet,
  documentsGetVersions,
  documentsSearch,
  documentsListShared,
  documentsGetActivity,
  documentsGetDownloads,
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
