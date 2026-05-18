/**
 * Prompt templates exposed via MCP. The MCP client renders these to the
 * model along with the user's choice of arguments.
 */

export interface PromptDefinition {
  name: string;
  description: string;
  arguments: Array<{
    name: string;
    description?: string;
    required?: boolean;
  }>;
  build: (args: Record<string, string | undefined>) => Array<{
    role: "user" | "assistant";
    content: { type: "text"; text: string };
  }>;
}

export const summarizeDocument: PromptDefinition = {
  name: "summarize_document",
  description: "Summarize the latest version of a Chaindoc document.",
  arguments: [
    { name: "documentId", description: "Chaindoc document UUID", required: true },
  ],
  build: ({ documentId }) => [
    {
      role: "user",
      content: {
        type: "text",
        text:
          `Summarize Chaindoc document ${documentId}. ` +
          `If you don't have the document text, ask the user to upload or paste it. ` +
          `Highlight purpose, parties, obligations, deadlines, and clauses warranting human review. ` +
          `Quote no more than one short phrase per clause.`,
      },
    },
  ],
};

export const prepareSignatureRequest: PromptDefinition = {
  name: "prepare_signature_request",
  description: "Walk through creating a signature request for a document version.",
  arguments: [
    { name: "documentId", description: "Document UUID", required: true },
    { name: "versionId", description: "Document version UUID", required: true },
    { name: "recipientHints", description: "Free-text hints about who should sign" },
  ],
  build: ({ documentId, versionId, recipientHints }) => [
    {
      role: "user",
      content: {
        type: "text",
        text:
          `Help me set up a signature request for document ${documentId} (version ${versionId}). ` +
          `1) Confirm the recipient list with me${recipientHints ? ` (hints: ${recipientHints})` : ""}. ` +
          `2) Decide together on a deadline, an optional message, and whether KYC is required. ` +
          `3) Decide between email-delivered signing (embeddedFlow=false) and in-app embedded signing. ` +
          `4) Call chaindoc_signatures_create_request with the agreed values. ` +
          `5) For embedded flows, mint a session per signer with chaindoc_embedded_create_session.`,
      },
    },
  ],
};

export const auditOpenSigners: PromptDefinition = {
  name: "audit_open_signers",
  description: "Identify signature requests that have been open longer than N days.",
  arguments: [
    { name: "daysOpen", description: "Threshold in days. Default 5." },
  ],
  build: ({ daysOpen }) => {
    const days = Number(daysOpen ?? 5);
    return [
      {
        role: "user",
        content: {
          type: "text",
          text:
            `Use chaindoc_signatures_get_my_requests to fetch signature requests, then check each via ` +
            `chaindoc_signatures_get_request_status. Surface ones older than ${days} days that aren't ` +
            `complete, list the unsigned recipients, and suggest follow-ups (cancel, escalate, send a reminder).`,
        },
      },
    ];
  },
};

export const verifyChainOfCustody: PromptDefinition = {
  name: "verify_document_chain_of_custody",
  description: "Walk the blockchain anchor and signer chain for a document version.",
  arguments: [
    { name: "versionHash", description: "0x-prefixed hash", required: true },
  ],
  build: ({ versionHash }) => [
    {
      role: "user",
      content: {
        type: "text",
        text:
          `Run chaindoc_documents_verify with versionHash=${versionHash}. Then summarize: who anchored it, ` +
          `which chain, when, and (using chaindoc_signatures_get_request_status) which signatures are ` +
          `tied to that version. Surface anomalies — anchor mismatch, missing signers, expired KYC.`,
      },
    },
  ],
};

export const setUpContractWithBilling: PromptDefinition = {
  name: "set_up_contract_with_billing",
  description: "Create a contract with payment terms, send for signing, and prep an invoice plan.",
  arguments: [
    { name: "documentId", description: "Existing document UUID", required: true },
    { name: "contragentEmail", description: "Counterparty email", required: true },
  ],
  build: ({ documentId, contragentEmail }) => [
    {
      role: "user",
      content: {
        type: "text",
        text:
          `Walk through setting up a billable contract on document ${documentId} with contragent ${contragentEmail}. ` +
          `1) Ask me for title, currency, start/end dates, and payment terms (one-time or recurring). ` +
          `2) Call chaindoc_contracts_create. ` +
          `3) Confirm details and call chaindoc_contracts_send to dispatch for signing. ` +
          `4) Once signed, propose an invoice schedule (chaindoc_invoices_create) for any one-off items.`,
      },
    },
  ],
};

export const verifyIncomingWebhook: PromptDefinition = {
  name: "verify_incoming_webhook",
  description: "Help the user verify a Chaindoc webhook delivery they paste in.",
  arguments: [],
  build: () => [
    {
      role: "user",
      content: {
        type: "text",
        text:
          `I'm going to paste a Chaindoc webhook delivery — the raw body, the X-Chaindoc-Signature header, ` +
          `and the X-Chaindoc-Timestamp header. Use chaindoc_webhooks_verify with my dashboard webhook ` +
          `secret to confirm authenticity. If invalid, explain why (signature mismatch, replay window, etc.).`,
      },
    },
  ],
};

export const manageContractTermination: PromptDefinition = {
  name: "manage_contract_termination",
  description: "Walk through terminating a contract: status check, type choice, approval path.",
  arguments: [
    { name: "contractId", description: "Contract UUID", required: true },
    { name: "terminationType", description: "Optional hint: 'one_side' or 'mutual_approval'" },
  ],
  build: ({ contractId, terminationType }) => [
    {
      role: "user",
      content: {
        type: "text",
        text:
          `Help me terminate contract ${contractId}. ` +
          `1) Call chaindoc_contracts_termination_get_status — confirm canInitiateTermination and surface outstanding ` +
          `invoices / upcoming payments / earliest effective date. ` +
          `2) Choose terminationType${terminationType ? ` (hint: ${terminationType})` : ""}: 'one_side' terminates immediately; ` +
          `'mutual_approval' creates a pending request that the counterparty must approve. ` +
          `3) Call chaindoc_contracts_terminate. ` +
          `4) For mutual_approval, explain that the COUNTERPARTY (not me) must call chaindoc_contracts_termination_approve; ` +
          `a wrong_party error code means I tried to approve my own request. ` +
          `5) Surface chaindoc_contracts_termination_get for status, and offer to cancel my pending request via _cancel.`,
      },
    },
  ],
};

export const authorAndPublishTemplate: PromptDefinition = {
  name: "author_and_publish_template",
  description: "Create or revise a template, preview, iterate, publish.",
  arguments: [
    { name: "templateId", description: "Existing template UUID (omit to start fresh)" },
  ],
  build: ({ templateId }) => [
    {
      role: "user",
      content: {
        type: "text",
        text:
          (templateId
            ? `Help me revise template ${templateId}. Read it with chaindoc_templates_get to see current/last-published versions. `
            : `Help me author a new template. `) +
          `1) Decide category + draft Tiptap contentJson + variablesSchema + signerSlots. ` +
          `2) Save via chaindoc_templates_create or _update. ` +
          `3) Preview with chaindoc_templates_preview_html and chaindoc_templates_preview_pdf — iterate. ` +
          `4) Publish via chaindoc_templates_publish. ` +
          `Note: editing a PUBLISHED template forks a draft; existing callers of _create_document still get the last-published ` +
          `version until the next publish.`,
      },
    },
  ],
};

export const billRecurringOnImportedContract: PromptDefinition = {
  name: "bill_recurring_on_imported_contract",
  description: "Configure recurring billing on an imported active contract.",
  arguments: [
    { name: "contractId", description: "Contract UUID (must be import-origin ACTIVE)", required: true },
  ],
  build: ({ contractId }) => [
    {
      role: "user",
      content: {
        type: "text",
        text:
          `Set up recurring billing on imported contract ${contractId}. ` +
          `1) Confirm the contract is import-origin and ACTIVE via chaindoc_contracts_get. ` +
          `2) Design paymentTerms[] (deposit / recurring / one_time as appropriate). ` +
          `3) Call chaindoc_contracts_setup_recurring. ` +
          `4) Explain that billing starts only AFTER the contragent accepts the emailed approval and links a payment method. ` +
          `5) If the contragent doesn't respond, use chaindoc_contracts_resend_recurring_approval; ` +
          `cancel the pending approval with chaindoc_contracts_cancel_recurring_approval.`,
      },
    },
  ],
};

export const allPrompts: PromptDefinition[] = [
  summarizeDocument,
  prepareSignatureRequest,
  auditOpenSigners,
  verifyChainOfCustody,
  setUpContractWithBilling,
  verifyIncomingWebhook,
  manageContractTermination,
  authorAndPublishTemplate,
  billRecurringOnImportedContract,
];
