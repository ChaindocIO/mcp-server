import { describe, it, expect } from "vitest";
import { toChaindocMcpError } from "../../src/core/errors.js";

const cases: Array<{ name: string; status: number; message: string; code: string; hintIncludes: string }> = [
  { name: "not_verified",        status: 400, message: "Version is not verified",                            code: "not_verified",        hintIncludes: "chaindoc_documents_wait_for_verification" },
  { name: "wrong_party",         status: 400, message: "You cannot approve your own request",                code: "wrong_party",         hintIncludes: "counterparty" },
  { name: "wrong_state invoice", status: 400, message: "Only draft invoices can be sent",                    code: "wrong_state",         hintIncludes: "draft" },
  { name: "document_not_public", status: 400, message: "Document is not public.",                            code: "document_not_public", hintIncludes: "accessType='public'" },
  { name: "wrong_state contract", status: 400, message: "Contract must be in draft",                         code: "wrong_state",         hintIncludes: "DRAFT" },
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
