import { afterEach, describe, expect, it, vi } from "vitest";
import { toChaindocMcpError } from "../../src/core/errors.js";
import { ERROR_KEY_HINTS } from "../../src/core/error-keys.js";
import { loadConfig } from "../../src/core/config.js";
import { documentsCreate, documentsUpdate } from "../../src/tools/documents.js";
import { templatesCreate, templatesUpdate } from "../../src/tools/templates.js";
import { contractsAgreementsCreate } from "../../src/tools/contracts-agreements.js";

/**
 * What an agent met when the server was driven through this MCP against a live backend, held here so it
 * does not come back. Bodies are the ones the server answered (the SDK keeps the body on `response`).
 */

/** A refusal as the server SDK throws it: `statusCode`, `errorKey`, and the answer body on `response`. */
const sdkRefusal = (statusCode: number, body: Record<string, unknown>) =>
  Object.assign(new Error(String(body["message"])), {
    name: "ChaindocError",
    statusCode,
    errorKey: body["errorKey"],
    response: body,
  });

describe("the facts the server sends beside its key reach the agent in `details`", () => {
  it("SETUP_BLOCKED: `details.blockers` (the hint promises them)", () => {
    const blockers = [
      { kind: "signature-field-missing", section: "fields", subject: "recipient-0", subjects: ["recipient-0", "recipient-1"] },
    ];
    const e = toChaindocMcpError(
      sdkRefusal(409, { statusCode: 409, error: "Conflict", errorKey: "SETUP_BLOCKED", message: "Something stands in the way of sending.", blockers }),
    );
    expect(e).toMatchObject({ code: "conflict", errorKey: "SETUP_BLOCKED", details: { blockers } });
    expect(e.hint).toContain("details.blockers");
    // The words, the HTTP reason and the key are not repeated as facts.
    expect(e.details).not.toHaveProperty("message");
    expect(e.details).not.toHaveProperty("errorKey");
  });

  it("SIGNATURE_ROLE_UNKNOWN: the role asked and the text's roles", () => {
    const e = toChaindocMcpError(
      sdkRefusal(400, { statusCode: 400, errorKey: "SIGNATURE_ROLE_UNKNOWN", message: 'The text holds no role "business".', role: "business", roles: ["client"] }),
    );
    expect(e.details).toEqual({ role: "business", roles: ["client"] });
    expect(e.hint).toMatch(/business.*contragent/);
  });

  it("a request that is not pending says what it is", () => {
    const e = toChaindocMcpError(
      sdkRefusal(400, { statusCode: 400, errorKey: "SIGNATURE_REQUEST_NOT_PENDING", message: "Only pending signature requests can be reminded", status: "cancelled" }),
    );
    expect(e.details).toEqual({ status: "cancelled" });
    expect(e.hint).toContain("details.status");
  });

  it("a body with nothing beside the words gives no `details`; a validation list stays in `validation`", () => {
    expect(toChaindocMcpError(sdkRefusal(404, { statusCode: 404, error: "Not Found", message: "Document not found" })).details).toBeUndefined();
    const v = toChaindocMcpError(sdkRefusal(400, { statusCode: 400, errorKey: "VALIDATION_FAILED", message: ["name should not be empty"] }));
    expect(v.validation).toEqual(["name should not be empty"]);
    expect(v.details).toBeUndefined();
    expect(v.hint).toContain("validation");
  });
});

describe("content as the server answers it (version 3) is accepted back", () => {
  const doc = { type: "doc", content: [] };
  const id = "11111111-1111-4111-8111-111111111111";

  it.each([1, 2, 3])("documents create/update and templates create/update take version %i", (version) => {
    const content = { version, mode: "document", doc };
    expect(documentsCreate.inputSchema.safeParse({ name: "x", status: "draft", content }).success).toBe(true);
    expect(documentsUpdate.inputSchema.safeParse({ documentId: id, name: "x", status: "draft", content, baseVersionId: id }).success).toBe(true);
    const template = { version, mode: "template", doc };
    expect(templatesCreate.inputSchema.safeParse({ name: "x", category: "other", content: template }).success).toBe(true);
    expect(templatesUpdate.inputSchema.safeParse({ templateId: id, content: template, revision: 1 }).success).toBe(true);
  });

  it("a version the server does not know is refused", () => {
    expect(documentsCreate.inputSchema.safeParse({ name: "x", status: "draft", content: { version: 4, mode: "document", doc } }).success).toBe(false);
  });
});

describe("an amendment carries no money", () => {
  const ids = { contractId: "11111111-1111-4111-8111-111111111111", documentId: "22222222-2222-4222-8222-222222222222", title: "A" };

  it("payment-term changes are refused by name, not dropped", () => {
    expect(contractsAgreementsCreate.inputSchema.safeParse(ids).success).toBe(true);
    const withMoney = contractsAgreementsCreate.inputSchema.safeParse({
      ...ids,
      modifiesPaymentTerms: true,
      paymentTermModifications: [{ action: "add", type: "one_time", name: "fee", amount: "1.00" }],
    });
    expect(withMoney.success).toBe(false);
    expect(JSON.stringify(withMoney.error?.issues)).toContain("paymentTermModifications");
  });
});

describe("hints for the refusals an agent meets on the live API", () => {
  it.each([
    "KEY_WORKSPACE_IS_NOT_A_PERSON",
    "BUSINESS_PROFILE_INCOMPLETE",
    "SIGNATURE_REQUEST_NOT_PENDING",
    "SIGNING_REQUEST_NOT_PENDING",
    "EMBEDDED_SIGNING_REQUEST_CLOSED",
    "EMBEDDED_CONTRACT_NOT_SIGNABLE",
    "DOCUMENT_NOT_A_FILE",
    "KYC_NOT_VERIFIED",
    "AMENDMENT_CARRIES_NO_MONEY",
    "VALIDATION_FAILED",
  ])("%s has a hint", (key) => {
    expect(ERROR_KEY_HINTS[key]?.length ?? 0).toBeGreaterThan(20);
  });

  it("no hint still teaches content version 2 only", () => {
    for (const [key, hint] of Object.entries(ERROR_KEY_HINTS)) expect(hint, key).not.toMatch(/version:\s*2\b/);
  });
});

describe("the backend the server talks to", () => {
  const saved = { ...process.env };
  afterEach(() => {
    process.env = { ...saved };
  });

  it("CHAINDOC_BASE_URL sets the API origin (trailing slash dropped); absent or empty means the SDK default", () => {
    process.env["CHAINDOC_BASE_URL"] = "https://api-dev.example.test/";
    expect(loadConfig().baseUrl).toBe("https://api-dev.example.test");
    process.env["CHAINDOC_BASE_URL"] = "";
    expect(loadConfig().baseUrl).toBeUndefined();
    delete process.env["CHAINDOC_BASE_URL"];
    expect(loadConfig().baseUrl).toBeUndefined();
  });

  it("a base URL that is not http(s) is refused at start", () => {
    process.env["CHAINDOC_BASE_URL"] = "file:///etc/passwd";
    expect(() => loadConfig()).toThrow(/baseUrl/);
  });

  it("the client hands the base URL to the SDK (the SDK maps every `environment` to production)", async () => {
    const made: unknown[] = [];
    vi.resetModules();
    vi.doMock("@chaindoc_io/server-sdk", () => ({
      Chaindoc: Object.assign(
        class {
          constructor(init: unknown) {
            made.push(init);
          }
          healthCheck = async () => ({ status: "ok" });
        },
        { webhooks: {} },
      ),
    }));
    const { ChaindocClient } = await import("../../src/core/client.js");
    const logger = { debug: () => undefined, warn: () => undefined } as never;
    await new ChaindocClient({ apiKey: "sk_x", baseUrl: "https://api-dev.example.test", environment: "development", logger }).run("t", (sdk) => sdk.healthCheck());
    await new ChaindocClient({ apiKey: "sk_x", logger }).run("t", (sdk) => sdk.healthCheck());
    expect(made[0]).toMatchObject({ secretKey: "sk_x", baseUrl: "https://api-dev.example.test" });
    expect(made[0]).not.toHaveProperty("environment");
    expect(made[1]).not.toHaveProperty("baseUrl");
    vi.doUnmock("@chaindoc_io/server-sdk");
  });
});
