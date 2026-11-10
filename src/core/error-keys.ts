/**
 * One-line hints for the server's `errorKey` values. The key itself always passes through to the agent; a
 * hint is added only for keys named here (an unknown key is passed on without an invented explanation).
 */
export const ERROR_KEY_HINTS: Readonly<Record<string, string>> = {
  // plan, account, limits
  INTEGRATIONS_NOT_IN_PLAN: "The workspace needs the Business plan (or above) for API/MCP access; tell the user to upgrade, then retry.",
  ACCOUNT_READ_ONLY: "This account is read-only: reads and downloads work, anything that creates, changes, signs or sends is refused.",
  STORAGE_LIMIT_REACHED: "The workspace storage is full; free space or upgrade before adding files or documents.",
  AI_LIMIT_REACHED: "The workspace AI budget is used up; converting a file needs it. Nothing was spent.",
  AI_NOT_IN_PLAN: "File conversion needs a plan with AI; nothing was spent. Create the document from `content` instead.",
  KYC_WAITS_FOR_A_UNIT: "A KYC unit is needed for this signer and none is free; the workspace owner must add units.",
  // documents and conversion
  DOCUMENT_FILE_CONVERTS: "This version is a file, not text: call chaindoc_documents_convert, wait with chaindoc_conversions_wait, then use the new version.",
  DOCUMENT_FILE_VIA_STORAGE: "Send files through Storage: chaindoc_storage_upload_file or chaindoc_documents_create_from_file.",
  DOCUMENT_FILE_NOT_CONVERTED: "The converter does not take this file type; use PDF, DOCX or another supported text file.",
  DOCUMENT_CONVERSION_PENDING: "The file is still converting: call chaindoc_conversions_wait, then retry with the made version.",
  DOCUMENT_CONVERSION_FAILED: "The conversion failed (see the failure code); upload the file again or write the text with `content`.",
  DOCUMENT_CONVERSION_LANDS_AS_DRAFT: "A document made from a file always lands as a draft; send status 'draft'.",
  DOCUMENT_WRITING_BASE_MOVED: "The document has a newer version: read it again (chaindoc_documents_get_content) and redo the change on it.",
  DOCUMENT_WRITING_CONTENT_REFUSED: "The content is not valid engine content; see `details` for the refused nodes.",
  // signing
  SIGNING_FIELDS_EMPTY: "A required signer field is empty: the signer must fill it before signing.",
  SETUP_FIELDS_STAND_IN_THE_TEXT: "Signature places are chips in the text, not coordinates: add them with chaindoc_documents_add_signature_block and bind recipients by `role`.",
  SETUP_BLOCKED: "The document is not ready to send; `details.blockers` lists what to fix first.",
  SIGNATURE_ROLE_REQUIRED: "Give every recipient a `role` (a key from chaindoc_documents_get_content `roles`).",
  SIGNATURE_ROLE_UNKNOWN: "That role is not in the text: read the roles with chaindoc_documents_get_content.",
  SIGNATURE_ROLE_UNASSIGNED: "Every role of the text needs one recipient; one is missing.",
  SIGNATURE_ROLE_TWICE: "A role was given to two recipients (or already stands in the text): one recipient per role.",
  NOT_YOUR_TURN: "The signing order has not reached this signer yet.",
  ACCOUNT_OPTION_UNAVAILABLE: "That account option is not available for this person: look it up again with chaindoc_accounts_lookup.",
  // templates
  TEMPLATE_RETIRED: "This is an old-format template and can no longer be used; recreate it in the new format (content + revision).",
  TEMPLATE_FORMAT_RETIRED: "`contentJson` is gone: send `content` {version:2, mode:'template', doc}.",
  TEMPLATE_REVISION_REQUIRED: "Send the `revision` you read (chaindoc_templates_get -> workingCopy.revision) with `content`.",
  TEMPLATE_WORKING_COPY_MOVED: "The template changed since you read it: read it again and redo the change on the new revision.",
  TEMPLATE_NOT_PUBLISHED: "Publish the template (chaindoc_templates_publish) before making documents from it.",
  TEMPLATE_ARCHIVED: "The template is archived: restore it first.",
  TEMPLATE_NOTHING_TO_PUBLISH: "There are no changes to publish.",
  TEMPLATE_SLOTS_REFUSED: "Fill every signer slot exactly once (slot keys from chaindoc_templates_get).",
  TEMPLATE_SLOT_NOT_SUPPORTED: "Delegated signing and signerVariables are not supported: a signer fills their own fields as they sign.",
  TEMPLATE_VALUES_MISSING: "A required template value is empty: ask the user for it.",
  TEMPLATE_VALUES_REFUSED: "A value does not fit its field (type or format): check chaindoc_templates_get variablesSchema.",
  TEMPLATE_HAS_NO_SIGNERS: "The template has no signer slots: add signers to the template first.",
  // money
  INVOICE_MONEY_OR_CREDIT_NOTE: "Money or a credit note already reached this invoice, so it cannot be cancelled: issue a credit note instead (ask the user first).",
  STRIPE_NOT_READY: "Stripe is not connected or ready for this workspace; card charges are unavailable.",
  STRIPE_NOT_ALLOWED_BY_CASCADE: "Card payment is switched off at the invoice, contract or partner level; charge is refused.",
  STRIPE_MANUAL_BY_DESIGN: "This invoice/contract is deliberately manual: record the payment with chaindoc_invoices_mark_paid after the user confirms.",
  STRIPE_SETTING_REQUIRES_STRIPE: "Enabling card payment needs a connected Stripe account.",
  PAYMENT_INSTRUCTION_NOT_FOUND: "That payment instruction does not exist: pick an id from chaindoc_payment_instructions_list.",
  // processes
  PROCESS_NOT_IN_PLAN: "Processes are not in this workspace's plan.",
  PROCESS_NOT_FOUND: "No such process or entry is granted to this key: list them with chaindoc_processes_list.",
  PROCESS_LAUNCH_FORBIDDEN: "This key may not start that entry (discovery is not permission to start).",
  PROCESS_INPUT_INVALID: "The input does not fit the entry schema; `details.fields` names the fields.",
  PROCESS_VERSION_MOVED: "The entry changed: read it again (chaindoc_processes_get_entry) and start with the new versionUuid and a new externalId.",
  PROCESS_IDEMPOTENCY_MEANING_CHANGED: "This externalId was used for a different request: use a new externalId, or repeat the original body unchanged.",
};

export function hintForErrorKey(key: string): string | undefined {
  return ERROR_KEY_HINTS[key];
}
