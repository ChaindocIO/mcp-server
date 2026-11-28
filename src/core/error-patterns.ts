import type { ChaindocErrorCode } from "./errors.js";

/**
 * A state-machine refusal the agent should treat differently from a plain bad argument.
 *
 * The server names its refusals with an `errorKey`; where it does, only the key decides (`errorKeys`). The text match
 * (`statuses` + `messageRegex`) is the fallback for answers that carry no key: routes not named yet, and servers older
 * than the key (production may answer the text before it answers the key).
 */
export interface ErrorPattern {
  errorKeys?: readonly string[];
  statuses?: readonly number[];
  messageRegex?: RegExp;
  code: ChaindocErrorCode;
  hint: string;
}

// Order matters: first match wins.
export const ERROR_PATTERNS: ErrorPattern[] = [
  {
    // Signing a version whose blockchain anchor is not confirmed yet. No key on the server today.
    statuses: [400],
    messageRegex: /^Version is not verified/i,
    code: "not_verified",
    hint: "Call chaindoc_documents_wait_for_verification with the versionId before retrying.",
  },
  {
    statuses: [400],
    messageRegex: /cannot approve your own request/i,
    code: "wrong_party",
    hint: "Only the counterparty can approve a mutual-approval termination request.",
  },
  {
    errorKeys: ["INVOICE_NOT_A_DRAFT"],
    statuses: [400],
    messageRegex: /Only draft invoices can be (sent|updated)/i,
    code: "wrong_state",
    hint: "The invoice is not a draft any more: read it with chaindoc_invoices_get; only a draft accepts send/update.",
  },
  {
    statuses: [400],
    messageRegex: /Document is not public/i,
    code: "document_not_public",
    hint: "Call chaindoc_documents_update_rights with accessType='public' first.",
  },
  {
    // `contracts.cancel` / `delete` (403) and `send` (400) on a contract that left draft. Keyless relatives: payment
    // terms, payment setup, attach, update and amendment delete on a contract or amendment that is not a draft.
    errorKeys: ["CONTRACT_NOT_A_DRAFT"],
    statuses: [400, 403],
    messageRegex: /can only be (added|updated|deleted|attached|created)\b.*\bdraft|only draft agreements|not a draft any more/i,
    code: "wrong_state",
    hint:
      "The contract (or amendment) is not a draft any more. A sent contract is withdrawn with " +
      "chaindoc_contracts_cancel_signing_request, an active one ended with chaindoc_contracts_terminate.",
  },
  {
    errorKeys: ["STRIPE_NOT_READY", "STRIPE_LEGACY_EXPRESS", "STRIPE_ACCOUNT_DISCONNECTED"],
    statuses: [400],
    messageRegex: /Stripe Connect/i,
    code: "stripe_not_ready",
    hint: "Workspace owner must complete Stripe Connect onboarding in the Chaindoc dashboard.",
  },
];

/** The answer's key decides when there is one; the text only when there is none. */
export function matchErrorPattern(
  status: number | undefined,
  message: string | undefined,
  errorKey?: string,
): ErrorPattern | undefined {
  if (errorKey !== undefined) {
    return ERROR_PATTERNS.find((p) => p.errorKeys?.includes(errorKey));
  }
  if (status === undefined || message === undefined) return undefined;
  return ERROR_PATTERNS.find(
    (p) => p.statuses?.includes(status) === true && p.messageRegex !== undefined && p.messageRegex.test(message),
  );
}
