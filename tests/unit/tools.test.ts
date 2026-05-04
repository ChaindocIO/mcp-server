import { describe, expect, it, vi } from "vitest";
import type { Logger } from "pino";
import { documentsCreate, documentsVerify } from "../../src/tools/documents.js";
import { signaturesCreateRequest } from "../../src/tools/signatures.js";
import { embeddedCreateSession } from "../../src/tools/embedded.js";
import type { ChaindocClient, ChaindocSdkLike } from "../../src/core/client.js";

function fakeLogger(): Logger {
  const noop = () => undefined;
  return {
    debug: noop,
    info: noop,
    warn: noop,
    error: noop,
    fatal: noop,
    trace: noop,
    child: () => fakeLogger(),
  } as unknown as Logger;
}

function fakeClient(sdk: Partial<ChaindocSdkLike>): ChaindocClient {
  return {
    config: {
      apiKey: "sk_test",
      environment: "staging",
      maxRps: 0.166, // 10/60s
      logger: fakeLogger(),
    },
    run: async (_name: string, fn: (sdk: ChaindocSdkLike) => unknown) => fn(sdk as ChaindocSdkLike),
    staticApi: async () => ({ webhooks: { verify: vi.fn() } }),
  } as unknown as ChaindocClient;
}

describe("documentsCreate", () => {
  it("validates input and forwards to sdk.documents.create", async () => {
    const create = vi.fn().mockResolvedValue({ documentId: "doc_1", document: { id: "doc_1" } });
    const client = fakeClient({
      documents: {
        create,
        update: vi.fn(),
        updateRights: vi.fn(),
        verify: vi.fn(),
        getVerificationStatus: vi.fn(),
      },
    });

    const args = documentsCreate.inputSchema.parse({
      name: "Service Agreement",
      media: { type: "document", key: "/temp/x.pdf" },
      hashtags: ["#nda"],
      status: "published",
      meta: [{ key: "author", value: "John" }],
      isForSigning: true,
    });
    const result = await documentsCreate.handler(args, { client, logger: fakeLogger() });
    expect(create).toHaveBeenCalledWith(
      expect.objectContaining({
        name: "Service Agreement",
        media: { type: "document", key: "/temp/x.pdf" },
        hashtags: ["#nda"],
        status: "published",
        meta: [{ key: "author", value: "John" }],
        isForSigning: true,
      }),
    );
    expect(result).toEqual({ documentId: "doc_1", document: { id: "doc_1" } });
  });

  it("rejects invalid hash format on verify", () => {
    expect(() => documentsVerify.inputSchema.parse({ versionHash: "not-a-hash" })).toThrow();
  });

  it("requires at least one of versionHash or certificateHash", () => {
    expect(() => documentsVerify.inputSchema.parse({})).toThrow();
  });
});

describe("signaturesCreateRequest", () => {
  it("converts deadline string to Date and forwards placed fields", async () => {
    const createRequest = vi
      .fn()
      .mockResolvedValue({ requestId: "sr_1", signatureRequest: { id: "sr_1", status: "pending", versionId: "v_1", signers: [] } });
    const client = fakeClient({
      signatures: {
        createRequest,
        getRequestStatus: vi.fn(),
        sign: vi.fn(),
        getMyRequests: vi.fn(),
        getSignatures: vi.fn(),
      },
    });

    const args = signaturesCreateRequest.inputSchema.parse({
      versionId: "00000000-0000-0000-0000-000000000001",
      recipients: [{ email: "alice@example.com", signingMethod: "embedded" }],
      deadline: "2026-12-31T23:59:59Z",
      embeddedFlow: true,
      fields: [
        {
          signerEmail: "alice@example.com",
          fieldType: "signature",
          pageIndex: 0,
          xPct: 0.1,
          yPct: 0.8,
          wPct: 0.2,
          hPct: 0.05,
        },
      ],
    });
    await signaturesCreateRequest.handler(args, { client, logger: fakeLogger() });
    const calledWith = createRequest.mock.calls[0]?.[0];
    expect(calledWith.deadline).toBeInstanceOf(Date);
    expect(calledWith.embeddedFlow).toBe(true);
    expect(calledWith.fields).toHaveLength(1);
  });
});

describe("embeddedCreateSession", () => {
  it("requires a valid email", () => {
    expect(() =>
      embeddedCreateSession.inputSchema.parse({ email: "nope", metadata: {} }),
    ).toThrow();
  });

  it("rejects empty metadata", () => {
    expect(() =>
      embeddedCreateSession.inputSchema.parse({ email: "a@b.com", metadata: {} }),
    ).toThrow();
  });

  it("accepts contractId-only metadata", () => {
    const args = embeddedCreateSession.inputSchema.parse({
      email: "a@b.com",
      metadata: { contractId: "00000000-0000-0000-0000-000000000001" },
    });
    expect(args.metadata.contractId).toBeDefined();
  });

  it("accepts documentId+signatureRequestId metadata", () => {
    const args = embeddedCreateSession.inputSchema.parse({
      email: "a@b.com",
      metadata: {
        documentId: "00000000-0000-0000-0000-000000000001",
        signatureRequestId: "00000000-0000-0000-0000-000000000002",
      },
    });
    expect(args.metadata.documentId).toBeDefined();
  });
});
