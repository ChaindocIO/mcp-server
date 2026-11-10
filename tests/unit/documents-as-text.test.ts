import { describe, it, expect, vi } from "vitest";
import {
  documentsCreate,
  documentsCreateFromFile,
  documentsCreateFromStorage,
  documentsUpdate,
  documentsGetContent,
  documentsConvert,
  documentsAddSignatureBlock,
  documentsUpdateRights,
} from "../../src/tools/documents.js";
import { conversionsGet, conversionsWait } from "../../src/tools/conversions.js";
import { storageUploadFile } from "../../src/tools/media.js";
import { toChaindocMcpError } from "../../src/core/errors.js";
import { fakeClient, fakeDownloads, fakeLogger } from "./_fakes.js";

const DID = "00000000-0000-0000-0000-000000000001";
const VID = "00000000-0000-0000-0000-000000000002";
const content = { version: 2 as const, mode: "template" as const, doc: { type: "doc", content: [] } };

const ctx = (sdk: Record<string, unknown>) => ({
  client: fakeClient(sdk as never),
  logger: fakeLogger(),
  downloads: fakeDownloads(),
});

describe("documents are text", () => {
  it("create sends content (a text document), not media", async () => {
    const create = vi.fn().mockResolvedValue({ documentId: DID });
    const args = documentsCreate.inputSchema.parse({ name: "NDA", status: "draft", content });
    await documentsCreate.handler(args, ctx({ documents: { create } }));
    expect(create).toHaveBeenCalledWith({ name: "NDA", status: "draft", content });
  });

  it("create refuses the old media handle instead of dropping it", () => {
    expect(() =>
      documentsCreate.inputSchema.parse({ name: "NDA", status: "draft", content, media: { key: "k" } }),
    ).toThrow();
  });

  it("create_from_file uploads through Storage and answers the 202 conversion", async () => {
    const createFromFile = vi.fn().mockResolvedValue({ conversion: { id: "cv1", status: "converting" } });
    const args = documentsCreateFromFile.inputSchema.parse({
      name: "Contract",
      file: { kind: "inline", name: "c.pdf", mimeType: "application/pdf", base64Content: Buffer.from("%PDF-1.4").toString("base64") },
    });
    const out = await documentsCreateFromFile.handler(args, ctx({ documents: { createFromFile } }));
    expect(out).toEqual({ conversion: { id: "cv1", status: "converting" } });
    const [blob, params, options] = createFromFile.mock.calls[0]!;
    expect(blob.size).toBe(8);
    expect(params).toEqual({ name: "Contract" });
    expect(options).toEqual({ filename: "c.pdf" });
    expect(documentsCreateFromFile.description).toContain("chaindoc_conversions_wait");
  });

  it("create_from_storage forwards the storage file", async () => {
    const createFromStorage = vi.fn().mockResolvedValue({ conversion: { id: "cv2" } });
    const args = documentsCreateFromStorage.inputSchema.parse({ storageFileId: "sf1", name: "X" });
    await documentsCreateFromStorage.handler(args, ctx({ documents: { createFromStorage } }));
    expect(createFromStorage).toHaveBeenCalledWith({ storageFileId: "sf1", name: "X" });
  });

  it("storage upload returns the storageFileId", async () => {
    const uploadChunked = vi.fn().mockResolvedValue({ storageFileId: "sf9" });
    const args = storageUploadFile.inputSchema.parse({
      file: { kind: "inline", name: "a.pdf", mimeType: "application/pdf", base64Content: "AAAA" },
    });
    expect(await storageUploadFile.handler(args, ctx({ media: { uploadChunked } }))).toEqual({ storageFileId: "sf9" });
    expect(uploadChunked.mock.calls[0]![1]).toEqual({ filename: "a.pdf" });
  });

  it("update from text needs baseVersionId", () => {
    expect(() =>
      documentsUpdate.inputSchema.parse({ documentId: DID, name: "N", status: "draft", content }),
    ).toThrow(/baseVersionId/);
  });

  it("update takes exactly one of content or storageFileId", () => {
    expect(() =>
      documentsUpdate.inputSchema.parse({
        documentId: DID, name: "N", status: "draft", content, baseVersionId: VID, storageFileId: "sf",
      }),
    ).toThrow(/exactly one/);
    expect(() => documentsUpdate.inputSchema.parse({ documentId: DID, name: "N", status: "draft" })).toThrow();
  });

  it("update from a file lands as a draft only", () => {
    expect(() =>
      documentsUpdate.inputSchema.parse({ documentId: DID, name: "N", status: "published", storageFileId: "sf" }),
    ).toThrow(/draft/);
  });

  it("update from text names the version it read", async () => {
    const update = vi.fn().mockResolvedValue({ success: true });
    const args = documentsUpdate.inputSchema.parse({
      documentId: DID, name: "N", status: "draft", content, baseVersionId: VID,
    });
    await documentsUpdate.handler(args, ctx({ documents: { update } }));
    expect(update).toHaveBeenCalledWith(DID, { name: "N", status: "draft", content, baseVersionId: VID });
  });

  it("update from a file starts a conversion", async () => {
    const update = vi.fn().mockResolvedValue({ conversion: { id: "cv3" } });
    const args = documentsUpdate.inputSchema.parse({ documentId: DID, name: "N", status: "draft", storageFileId: "sf" });
    await documentsUpdate.handler(args, ctx({ documents: { update } }));
    expect(update).toHaveBeenCalledWith(DID, { name: "N", status: "draft", storageFileId: "sf" });
  });

  it("get_content forwards the version", async () => {
    const getContent = vi.fn().mockResolvedValue({ roles: [] });
    await documentsGetContent.handler(
      documentsGetContent.inputSchema.parse({ documentId: DID, versionId: VID }),
      ctx({ documents: { getContent } }),
    );
    expect(getContent).toHaveBeenCalledWith(DID, { versionId: VID });
  });

  it("convert starts the 202 conversion of a file document", async () => {
    const convert = vi.fn().mockResolvedValue({ conversion: { id: "cv4" } });
    await documentsConvert.handler(documentsConvert.inputSchema.parse({ documentId: DID }), ctx({ documents: { convert } }));
    expect(convert).toHaveBeenCalledWith(DID, undefined);
  });

  it("add_signature_block adds roles", async () => {
    const addSignatureBlock = vi.fn().mockResolvedValue({ versionId: VID, roles: ["client"] });
    const args = documentsAddSignatureBlock.inputSchema.parse({ documentId: DID, roles: [{ key: "client", name: "Client" }] });
    await documentsAddSignatureBlock.handler(args, ctx({ documents: { addSignatureBlock } }));
    expect(addSignatureBlock).toHaveBeenCalledWith(DID, { roles: [{ key: "client", name: "Client" }] });
  });

  it("rights: team audience and account grants, no role audiences", async () => {
    const updateRights = vi.fn().mockResolvedValue({});
    const args = documentsUpdateRights.inputSchema.parse({
      documentId: DID,
      accessType: "restricted",
      accessEmails: [{ email: "anna@example.com", level: "read", account: { kind: "workspace", workspaceId: "w1" } }],
    });
    await documentsUpdateRights.handler(args, ctx({ documents: { updateRights } }));
    expect(updateRights).toHaveBeenCalledWith(DID, {
      accessType: "restricted",
      accessEmails: [{ email: "anna@example.com", level: "read", account: { kind: "workspace", workspaceId: "w1" } }],
    });
    expect(documentsUpdateRights.inputSchema.parse({ documentId: DID, accessType: "team" })).toBeTruthy();
  });
});

describe("conversions", () => {
  it("get reads one conversion", async () => {
    const get = vi.fn().mockResolvedValue({ conversion: { id: "cv", status: "converting" } });
    await conversionsGet.handler({ conversionId: "cv" }, ctx({ conversions: { get } }));
    expect(get).toHaveBeenCalledWith("cv");
  });

  it("wait returns the made document and version when ready", async () => {
    const wait = vi.fn().mockResolvedValue({ id: "cv", status: "ready", documentId: DID, versionId: VID });
    const out = (await conversionsWait.handler(
      conversionsWait.inputSchema.parse({ conversionId: "cv", timeoutMs: 5000 }),
      ctx({ conversions: { wait } }),
    )) as { status: string; documentId: string; versionId: string };
    expect(out).toMatchObject({ status: "ready", documentId: DID, versionId: VID });
    expect(wait).toHaveBeenCalledWith("cv", { timeoutMs: 5000 });
  });

  it("wait reports a timeout as a state, with the real state read back", async () => {
    const timeout = Object.assign(new Error("still converting"), { name: "ChaindocConversionTimeoutError" });
    const wait = vi.fn().mockRejectedValue(timeout);
    const get = vi.fn().mockResolvedValue({ conversion: { id: "cv", status: "converting" } });
    const out = (await conversionsWait.handler(
      conversionsWait.inputSchema.parse({ conversionId: "cv" }),
      ctx({ conversions: { wait, get } }),
    )) as { status: string; timedOut: boolean; hint: string };
    expect(out).toMatchObject({ status: "converting", timedOut: true });
    expect(out.hint).toContain("again");
  });

  it("wait lets a failed conversion through as a typed error with the failure code", async () => {
    const failed = Object.assign(new Error("Conversion cv failed: AI_LIMIT_REACHED"), {
      name: "ChaindocConversionFailedError",
      errorKey: "DOCUMENT_CONVERSION_FAILED",
      response: { errorKey: "DOCUMENT_CONVERSION_FAILED", failure: { code: "AI_LIMIT_REACHED" } },
    });
    const wait = vi.fn().mockRejectedValue(failed);
    await expect(
      conversionsWait.handler(conversionsWait.inputSchema.parse({ conversionId: "cv" }), ctx({ conversions: { wait } })),
    ).rejects.toBe(failed);
    const mapped = toChaindocMcpError(failed);
    expect(mapped.errorKey).toBe("DOCUMENT_CONVERSION_FAILED");
    expect(mapped.details).toMatchObject({ failure: { code: "AI_LIMIT_REACHED" } });
  });
});
