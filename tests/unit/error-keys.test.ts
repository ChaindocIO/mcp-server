import { describe, it, expect } from "vitest";
import { toChaindocMcpError } from "../../src/core/errors.js";
import { ERROR_KEY_HINTS } from "../../src/core/error-keys.js";

const sdkError = (statusCode: number, errorKey: string, message = "refused") =>
  Object.assign(new Error(message), { statusCode, errorKey, response: { errorKey, message } });

describe("typed errors pass the server's errorKey with a one-line hint", () => {
  it("INTEGRATIONS_NOT_IN_PLAN: Business plan needed", () => {
    const e = toChaindocMcpError(sdkError(403, "INTEGRATIONS_NOT_IN_PLAN"));
    expect(e).toMatchObject({ code: "forbidden", errorKey: "INTEGRATIONS_NOT_IN_PLAN", httpStatus: 403 });
    expect(e.hint).toMatch(/Business plan/);
  });

  it("DOCUMENT_FILE_CONVERTS: convert first", () => {
    const e = toChaindocMcpError(sdkError(422, "DOCUMENT_FILE_CONVERTS"));
    expect(e).toMatchObject({ code: "unprocessable", errorKey: "DOCUMENT_FILE_CONVERTS" });
    expect(e.hint).toContain("chaindoc_documents_convert");
  });

  it.each([
    ["ACCOUNT_READ_ONLY", 403],
    ["STORAGE_LIMIT_REACHED", 400],
    ["AI_LIMIT_REACHED", 400],
    ["SIGNING_FIELDS_EMPTY", 422],
    ["SETUP_FIELDS_STAND_IN_THE_TEXT", 422],
    ["NOT_YOUR_TURN", 409],
    ["TEMPLATE_RETIRED", 410],
    ["TEMPLATE_WORKING_COPY_MOVED", 409],
    ["KYC_WAITS_FOR_A_UNIT", 400],
  ])("%s keeps its key and has a hint", (key, status) => {
    const e = toChaindocMcpError(sdkError(status, key));
    expect(e.errorKey).toBe(key);
    expect(e.httpStatus).toBe(status);
    expect(e.hint?.length ?? 0).toBeGreaterThan(10);
  });

  it("an unknown key passes through without an invented hint", () => {
    const e = toChaindocMcpError(sdkError(400, "SOMETHING_NEW_FROM_THE_SERVER"));
    expect(e.errorKey).toBe("SOMETHING_NEW_FROM_THE_SERVER");
    expect(e.hint).toBeUndefined();
  });

  it("takes the key from the body when the error object carries none", () => {
    const e = toChaindocMcpError({ statusCode: 403, message: "no", response: { errorKey: "ACCOUNT_READ_ONLY" } });
    expect(e.errorKey).toBe("ACCOUNT_READ_ONLY");
  });

  it("the key's hint beats a message pattern", () => {
    const e = toChaindocMcpError(sdkError(400, "STRIPE_NOT_READY", "Stripe Connect is not ready"));
    expect(e.code).toBe("invalid_argument");
    expect(e.hint).toBe(ERROR_KEY_HINTS["STRIPE_NOT_READY"]);
  });

  it("an error with no key keeps the old message patterns", () => {
    const e = toChaindocMcpError({ statusCode: 400, message: "Version is not verified" });
    expect(e.code).toBe("not_verified");
    expect(e.errorKey).toBeUndefined();
  });

  it("no hint names a tool that does not exist", async () => {
    const { allTools } = await import("../../src/tools/index.js");
    const names = new Set(allTools.map((t) => t.name));
    for (const [key, hint] of Object.entries(ERROR_KEY_HINTS)) {
      for (const m of hint.matchAll(/chaindoc_[a-z_]+/g)) {
        expect(names.has(m[0]), `${key} hint names ${m[0]}`).toBe(true);
      }
    }
  });
});
