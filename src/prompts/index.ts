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
          `Read its text with chaindoc_documents_get_content (a document with format 'file' has no text until it is converted: ` +
          `offer chaindoc_documents_convert, or ask me to paste the text). ` +
          `Highlight purpose, parties, obligations, deadlines, and clauses warranting human review. ` +
          `Quote no more than one short phrase per clause.`,
      },
    },
  ],
};

export const prepareSignatureRequest: PromptDefinition = {
  name: "prepare_signature_request",
  description: "Walk through sending a text document for signature: roles, recipients, deadline.",
  arguments: [
    { name: "documentId", description: "Document UUID", required: true },
    { name: "recipientHints", description: "Free-text hints about who should sign" },
  ],
  build: ({ documentId, recipientHints }) => [
    {
      role: "user",
      content: {
        type: "text",
        text:
          `Help me set up a signature request for document ${documentId}. ` +
          `1) Call chaindoc_documents_get: if format is 'file' (sendable=false) run chaindoc_documents_convert and ` +
          `chaindoc_conversions_wait first. ` +
          `2) Call chaindoc_documents_get_content and read the signer roles (and the versionId to send). If the text has no ` +
          `roles yet, agree role keys and names with me and add them with chaindoc_documents_add_signature_block, then read ` +
          `the content again for the new versionId. ` +
          `3) Confirm the recipients with me${recipientHints ? ` (hints: ${recipientHints})` : ""} - exactly one per role. ` +
          `If someone may belong to a workspace, check chaindoc_accounts_lookup and ask me which account is meant. ` +
          `4) Decide together on a deadline, an optional message, and whether KYC is required. ` +
          `5) Call chaindoc_signatures_create_request with recipients[{email, role, account?}] - never coordinates. ` +
          `6) For embedded flows, mint a session per signer with chaindoc_embedded_create_session. ` +
          `If it fails, read the errorKey and hint in the error (SIGNATURE_ROLE_*, DOCUMENT_FILE_CONVERTS, SETUP_BLOCKED).`,
      },
    },
  ],
};

export const sendFileForSignature: PromptDefinition = {
  name: "send_file_for_signature",
  description: "Turn a person's file (PDF/DOCX) into a text document, add signer roles, and send it.",
  arguments: [
    { name: "filePath", description: "Path of the file on the MCP host (stdio), or a public URL" },
    { name: "signers", description: "Who signs, e.g. 'Anna <anna@example.com> as Client'" },
  ],
  build: ({ filePath, signers }) => [
    {
      role: "user",
      content: {
        type: "text",
        text:
          `Send ${filePath ?? "my file"} for signature${signers ? ` to ${signers}` : ""}. A file is not signed as it is: it is ` +
          `converted into a text document first. ` +
          `1) Call chaindoc_documents_create_from_file (the answer is a conversion, not a document). ` +
          `2) Call chaindoc_conversions_wait with the conversion id (repeat if it says timedOut). ` +
          `On failure read the errorKey: AI_LIMIT_REACHED / STORAGE_LIMIT_REACHED mean the workspace must free budget or space. ` +
          `3) Ask me to read the converted text (chaindoc_documents_get_content) if the content matters, and to confirm the signer roles. ` +
          `4) Call chaindoc_documents_add_signature_block with the roles, then chaindoc_documents_get_content for the new versionId. ` +
          `5) Confirm recipients, deadline and KYC with me, then call chaindoc_signatures_create_request with one recipient per role. ` +
          `Tell me the document link only in the workspace form /w/{workspaceUuid}/documents/{documentId} (ask me for the workspace uuid if you do not have it).`,
      },
    },
  ],
};

export const sendFromTemplate: PromptDefinition = {
  name: "send_from_template",
  description: "Print a published template with values and send it for signature, or make it a contract.",
  arguments: [
    { name: "templateId", description: "Template UUID", required: true },
    { name: "asContract", description: "'yes' to create a contract from it instead of a plain signature request" },
  ],
  build: ({ templateId, asContract }) => [
    {
      role: "user",
      content: {
        type: "text",
        text:
          `Use template ${templateId}${asContract === "yes" ? " to create a contract" : ""}. ` +
          `1) Call chaindoc_templates_get: it must be PUBLISHED (else TEMPLATE_NOT_PUBLISHED / TEMPLATE_RETIRED). List the ` +
          `variables (variablesSchema) and the signer slots (signerSlots[].signerKey) and ask me for every required value. ` +
          `2) ${asContract === "yes"
            ? "A contract template has exactly two slots: ask which is the business and which the counterparty, collect the counterparty's billing identity (legalName, vatNumber, registrationNumber, entityType, address), then call chaindoc_templates_create_contract."
            : "Ask me who fills each slot (one e-mail per slot; check chaindoc_accounts_lookup for workspaces), then call chaindoc_templates_send_for_signing. To only make a draft, call chaindoc_templates_create_document."} ` +
          `3) Signers fill their own fields as they sign: you cannot pre-fill signer fields or use delegated signing. ` +
          `Confirm the recipients with me before sending - they are emailed.`,
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
            `complete, list the unsigned recipients, and suggest follow-ups: chaindoc_signatures_remind for an active ` +
            `request, chaindoc_signatures_resend for a cancelled or expired one (it opens a NEW request), or cancel. ` +
            `Do any of them only after I agree.`,
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
    { name: "documentId", description: "Existing text document UUID", required: true },
    { name: "contragentEmail", description: "Counterparty email", required: true },
  ],
  build: ({ documentId, contragentEmail }) => [
    {
      role: "user",
      content: {
        type: "text",
        text:
          `Walk through setting up a billable contract on document ${documentId} with contragent ${contragentEmail}. ` +
          `1) Check chaindoc_accounts_lookup for ${contragentEmail}; if they have workspaces ask me which side to propose (contragentAccount). ` +
          `2) Ask me for title, currency, dates, payment terms (one-time or recurring) and the counterparty's billing identity ` +
          `(legalName, entityType, vatNumber, registrationNumber, billing address) - it prints on the invoices and decides VAT. ` +
          `3) Call chaindoc_contracts_create. ` +
          `4) Confirm details and call chaindoc_contracts_send to dispatch for signing. ` +
          `5) Once active, propose an invoice plan (chaindoc_invoices_create). Look up chaindoc_tax_treatments_list for VAT, and ` +
          `chaindoc_payment_instructions_list for where the customer pays (read only: bank details are set in the Chaindoc app, ` +
          `never typed into the chat; if none fits, tell me to add one in /w/{workspaceUuid}/settings/payment-details). ` +
          `Never charge or mark anything paid without asking me.`,
      },
    },
  ],
};

export const recordOfflinePayment: PromptDefinition = {
  name: "record_offline_payment",
  description: "Record an offline payment on an invoice (money: confirmed before it runs).",
  arguments: [
    { name: "contractId", description: "Contract UUID", required: true },
    { name: "invoiceUuid", description: "Invoice UUID", required: true },
  ],
  build: ({ contractId, invoiceUuid }) => [
    {
      role: "user",
      content: {
        type: "text",
        text:
          `I received money for invoice ${invoiceUuid} on contract ${contractId}. ` +
          `1) Read it with chaindoc_invoices_get: status, remainingAmount, creditedAmount, currency. ` +
          `2) Ask me how it was paid (bank-transfer, cash or other) and on which day. ` +
          `3) Summarise exactly what you are about to record (invoice number, amount remaining, method, date) and ask me to confirm. ` +
          `4) Only after I say yes, call chaindoc_invoices_mark_paid with confirm=true. Do not call it on your own. ` +
          `5) Read the invoice again and report the new status. A mistaken record is removed in the Chaindoc app, not here.`,
      },
    },
  ],
};

export const creditAnInvoice: PromptDefinition = {
  name: "credit_an_invoice",
  description: "Credit an issued invoice with a credit note instead of cancelling it (money: confirmed first).",
  arguments: [
    { name: "contractId", description: "Contract UUID", required: true },
    { name: "invoiceUuid", description: "Invoice UUID", required: true },
  ],
  build: ({ contractId, invoiceUuid }) => [
    {
      role: "user",
      content: {
        type: "text",
        text:
          `Help me correct invoice ${invoiceUuid} on contract ${contractId}. ` +
          `1) Read it with chaindoc_invoices_get. If canCancel is true and nothing was paid, offer chaindoc_invoices_cancel instead. ` +
          `2) Otherwise a credit note is the way (INVOICE_MONEY_OR_CREDIT_NOTE appears when money or a credit note already reached it). ` +
          `Check chaindoc_invoices_list_credit_notes for what was already credited. ` +
          `3) Agree the lines with me (whole invoice, or sourceLineIndex per line) and the reason. If money was already paid, tell me the ` +
          `excess is refunded on the original rail. ` +
          `4) Show me the total and ask me to confirm. Only then call chaindoc_invoices_create_credit_note with confirm=true.`,
      },
    },
  ],
};

export const startAProcess: PromptDefinition = {
  name: "start_a_process",
  description: "Discover a process this key may start, fill its entry, start a case and follow it.",
  arguments: [
    { name: "processKey", description: "Process key, if known" },
    { name: "entryKey", description: "Entry key, if known" },
  ],
  build: ({ processKey, entryKey }) => [
    {
      role: "user",
      content: {
        type: "text",
        text:
          `Help me start a Chaindoc process case${processKey ? ` on ${processKey}${entryKey ? `/${entryKey}` : ""}` : ""}. ` +
          `1) ${processKey ? "" : "Call chaindoc_processes_list; being listed is not permission to start. "}` +
          `Read the entry with chaindoc_processes_get_entry. It gives the versionUuid and the exact input fields; use only those. ` +
          `2) Ask me for each required field and each native subject (document, contract, invoice) it needs. ` +
          `3) Choose an externalId (an id from my system; a retry must reuse the same one with the same body). ` +
          `4) Show me the values and ask me to confirm - a case can email people. Then call chaindoc_processes_start. ` +
          `5) Follow it: chaindoc_processes_get_case for the status and chaindoc_processes_get_events for the history. ` +
          `Link the case as /w/{workspaceUuid}/process-cases/{caseUuid}. ` +
          `Errors: PROCESS_VERSION_MOVED means re-read the entry and start again with a NEW externalId; PROCESS_INPUT_INVALID names the fields.`,
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
  description: "Create or revise a template (content + revision), then publish it.",
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
            ? `Help me revise template ${templateId}. Read it with chaindoc_templates_get: workingCopy.content is the text to edit and workingCopy.revision is the revision you must send back. `
            : `Help me author a new template. `) +
          `1) Decide the category and write the template content: engine content { version: 2, mode: 'template', doc } where fields and signer ` +
          `slots live in the text (doc.attrs.fields, doc.attrs.signers). Edit an existing tree rather than inventing node types. ` +
          `2) Save with chaindoc_templates_create, or chaindoc_templates_update with content AND revision ` +
          `(409 TEMPLATE_WORKING_COPY_MOVED means someone changed it: read again and redo). ` +
          `3) There is no preview: check the result by reading it back with chaindoc_templates_get, or print a DRAFT document from the ` +
          `published template with chaindoc_templates_create_document and open it in the app (/w/{workspaceUuid}/documents/{documentId}). ` +
          `4) Publish with chaindoc_templates_publish (pass the revision). Documents, signature requests and contracts are made from the PUBLISHED version. ` +
          `Archive (reversible) rather than delete (permanent). Old-format templates answer TEMPLATE_RETIRED and must be recreated.`,
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
  sendFileForSignature,
  sendFromTemplate,
  recordOfflinePayment,
  creditAnInvoice,
  startAProcess,
  auditOpenSigners,
  verifyChainOfCustody,
  setUpContractWithBilling,
  verifyIncomingWebhook,
  manageContractTermination,
  authorAndPublishTemplate,
  billRecurringOnImportedContract,
];
