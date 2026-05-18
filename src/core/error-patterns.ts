import type { ChaindocErrorCode } from "./errors.js";

export interface ErrorPattern {
  statusEquals: number;
  messageRegex: RegExp;
  code: ChaindocErrorCode;
  hint: string;
}

// Order matters: first match wins.
export const ERROR_PATTERNS: ErrorPattern[] = [
  {
    statusEquals: 400,
    messageRegex: /^Version is not verified/i,
    code: "not_verified",
    hint: "Call chaindoc_documents_wait_for_verification with the versionId before retrying.",
  },
  {
    statusEquals: 400,
    messageRegex: /cannot approve your own request/i,
    code: "wrong_party",
    hint: "Only the counterparty can approve a mutual-approval termination request.",
  },
  {
    statusEquals: 400,
    messageRegex: /Only draft invoices can be sent/i,
    code: "wrong_state",
    hint: "Invoice is not in 'draft'. Inspect with chaindoc_invoices_get; only draft invoices accept send/update.",
  },
  {
    statusEquals: 400,
    messageRegex: /Document is not public/i,
    code: "document_not_public",
    hint: "Call chaindoc_documents_update_rights with accessType='public' first.",
  },
  {
    statusEquals: 400,
    messageRegex: /(DRAFT only|status is not draft|must be in draft)/i,
    code: "wrong_state",
    hint: "Operation requires the contract to be in DRAFT.",
  },
  {
    statusEquals: 400,
    messageRegex: /Stripe Connect/i,
    code: "stripe_not_ready",
    hint: "Workspace owner must complete Stripe Connect onboarding in the Chaindoc dashboard.",
  },
];

export function matchErrorPattern(status: number, message: string): ErrorPattern | undefined {
  for (const p of ERROR_PATTERNS) {
    if (p.statusEquals === status && p.messageRegex.test(message)) return p;
  }
  return undefined;
}
