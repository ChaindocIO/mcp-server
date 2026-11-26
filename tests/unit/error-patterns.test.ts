import { describe, it, expect } from "vitest";
import { toChaindocMcpError } from "../../src/core/errors.js";

const cases: Array<{ name: string; status: number; message: string; code: string; hintIncludes: string }> = [
  { name: "not_verified",        status: 400, message: "Version is not verified",                            code: "not_verified",        hintIncludes: "chaindoc_documents_wait_for_verification" },
  { name: "wrong_party",         status: 400, message: "You cannot approve your own request",                code: "wrong_party",         hintIncludes: "counterparty" },
  { name: "wrong_state invoice", status: 400, message: "Only draft invoices can be sent",                    code: "wrong_state",         hintIncludes: "draft" },
  { name: "document_not_public", status: 400, message: "Document is not public.",                            code: "document_not_public", hintIncludes: "accessType='public'" },
  // The texts the server sends without a key (production before the keys land, and routes not named yet).
  { name: "contract delete",     status: 403, message: "Contract can only be deleted in draft status",       code: "wrong_state",         hintIncludes: "chaindoc_contracts_cancel_signing_request" },
  { name: "contract send",       status: 400, message: "Signing request can only be created for draft contracts", code: "wrong_state",    hintIncludes: "not a draft" },
  { name: "payment terms",       status: 403, message: "Payment terms can only be added to draft contracts", code: "wrong_state",         hintIncludes: "not a draft" },
  { name: "amendment delete",    status: 403, message: "Only draft agreements can be deleted",              code: "wrong_state",         hintIncludes: "amendment" },
  { name: "invoice update",      status: 400, message: "Only draft invoices can be updated",                code: "wrong_state",         hintIncludes: "chaindoc_invoices_get" },
  { name: "stripe_not_ready",    status: 400, message: "Stripe Connect not configured for this workspace.", code: "stripe_not_ready",    hintIncludes: "Stripe Connect" },
];

describe("error patterns", () => {
  for (const c of cases) {
    it(`maps "${c.message}" → ${c.code}`, () => {
      const err = toChaindocMcpError({ status: c.status, message: c.message });
      expect(err.code).toBe(c.code);
      expect(err.hint).toBeTruthy();
      expect(err.hint).toContain(c.hintIncludes);
    });
  }

  it("falls back to invalid_argument when no pattern matches a 400", () => {
    const err = toChaindocMcpError({ status: 400, message: "some unmapped business rule" });
    expect(err.code).toBe("invalid_argument");
    expect(err.hint).toBeUndefined();
  });
});

describe("error patterns: the key first", () => {
  const keyed = (statusCode: number, errorKey: string, message: string) =>
    Object.assign(new Error(message), { statusCode, errorKey, response: { statusCode, errorKey, message } });

  it.each([
    ["CONTRACT_NOT_A_DRAFT", 403, "wrong_state"],
    ["INVOICE_NOT_A_DRAFT", 400, "wrong_state"],
    ["STRIPE_NOT_READY", 403, "stripe_not_ready"],
  ])("%s → %s by its key, whatever the text says", (key, status, code) => {
    const e = toChaindocMcpError(keyed(status, key, "words the pattern does not know"));
    expect(e.code).toBe(code);
    expect(e.errorKey).toBe(key);
    expect(e.hint).toBeTruthy();
  });

  it("no pattern hint names a tool that does not exist", async () => {
    const { ERROR_PATTERNS } = await import("../../src/core/error-patterns.js");
    const { allTools } = await import("../../src/tools/index.js");
    const names = new Set(allTools.map((t) => t.name));
    for (const p of ERROR_PATTERNS) {
      for (const m of p.hint.matchAll(/chaindoc_[a-z_]+/g)) expect(names.has(m[0]), `${p.code} names ${m[0]}`).toBe(true);
    }
  });
});
