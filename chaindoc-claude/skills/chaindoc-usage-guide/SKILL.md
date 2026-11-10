---
name: chaindoc-usage-guide
description: This skill should be used whenever the user asks Claude to work with documents, contracts, invoices, signatures, templates or processes in Chaindoc — including phrases like "in chaindoc", "send for signature", "create an invoice", "draft a contract", "send a sign request", "track signatures", "mark it paid", "credit note", "start a process", or any time the user references Chaindoc by name. It teaches Claude when to use the Chaindoc MCP tools and how to combine them into reliable workflows.
---

# Chaindoc usage guide

Chaindoc is a document, e-signature and billing platform. The Chaindoc MCP server exposes tools for documents,
signature requests, templates, contracts, invoices, counterparties and processes. This skill is the orientation
layer: when to reach for the tools, how to chain them, and what needs the user's yes first.

## When to use Chaindoc tools

Use them whenever the intent involves creating or finding a document, contract or invoice; sending something for
signature or checking who has signed; billing a counterparty; working from a template; or starting a process case.
If the user names "the Acme NDA" without attaching a file, assume it lives in Chaindoc and search first
(`chaindoc_documents_search`, `chaindoc_contracts_list`, `chaindoc_invoices_list_all`).

## Requirements and refusals you will meet

- **Business plan.** Every call needs a Business plan or above. `INTEGRATIONS_NOT_IN_PLAN` means the workspace must
  upgrade; tell the user, do not retry.
- **Workspaces.** The key acts for ONE workspace. Lists cover that workspace; acts are attributed to the key.
- **Read-only account.** `ACCOUNT_READ_ONLY`: reads and downloads work, anything that changes things is refused.
- **Limits.** `STORAGE_LIMIT_REACHED`, `AI_LIMIT_REACHED` (file conversion), `KYC_WAITS_FOR_A_UNIT`: the workspace owner must act.

Errors carry the server's `errorKey` and a one-line `hint`. Read both before deciding the next step; do not retry blindly.

## Documents are text; fields are chips

A Chaindoc document is a **text** with **chips**: signature places, dates and fields are chips inside the text. There are
no coordinates and no page boxes.

- **Make a text document:** `chaindoc_documents_create` with `content` (engine content v2). To edit, read with
  `chaindoc_documents_get_content`, change that tree, and write the next version with `chaindoc_documents_update`
  (`content` + the `baseVersionId` you read; `DOCUMENT_WRITING_BASE_MOVED` means re-read).
- **From a person's file (PDF, DOCX):** `chaindoc_documents_create_from_file` (or `chaindoc_storage_upload_file` then
  `chaindoc_documents_create_from_storage`). The answer is a **conversion**, not a document: call
  `chaindoc_conversions_wait` until it is `ready`, then use `documentId` and `versionId`. The document is a DRAFT. It uses
  the workspace's AI budget. If the wait says `timedOut`, call it again with the same id.
- **Old file documents** (`format: 'file'`, `sendable: false` in `chaindoc_documents_get`) cannot start a signature
  request (`DOCUMENT_FILE_CONVERTS`): `chaindoc_documents_convert`, wait, then continue on the new version.
- **Signing a document:** read the roles with `chaindoc_documents_get_content`. A converted file has none: add them with
  `chaindoc_documents_add_signature_block`, then read again for the new `versionId`. Send with
  `chaindoc_signatures_create_request`, **one recipient per role** (`recipients[].role`). Coordinate `fields` are refused
  (`SETUP_FIELDS_STAND_IN_THE_TEXT`). A required signer field left empty at signing is `SIGNING_FIELDS_EMPTY`.
- **Resend:** a cancelled or expired request is re-sent with `chaindoc_signatures_resend` (a NEW request over a fresh copy);
  an active one is nudged with `chaindoc_signatures_remind`.

## People and accounts

An e-mail is not the whole address: a person may be reachable as a personal account and as one or more workspaces. Before
you address someone (recipients, access grants, template slots, a contract counterparty) call `chaindoc_accounts_lookup`.
`options` lists where they can be sent. If there is more than one, ask the user which is meant and pass it back unchanged
as `account`. `hidden` or `not_registered`: use the e-mail alone.

## Templates (new format only)

Templates are text with `mode: 'template'`; edit with `content` **and** `revision` (read `workingCopy.revision` from
`chaindoc_templates_get`; `TEMPLATE_WORKING_COPY_MOVED` means re-read). `chaindoc_templates_publish`, `_archive`, `_restore`
manage the life; `_delete` is permanent (needs the user's yes). Documents, signature requests and contracts are made from the
**published** version: `chaindoc_templates_create_document` (always a draft), `_send_for_signing`, `_create_contract`
(exactly two slots: one `business`, one `contragent`). Signers fill their own fields as they sign. Old-format templates answer
`TEMPLATE_RETIRED` and must be recreated. There are no template previews.

## Money: ask first, and bank details are read only

- **Mark paid, charge, credit notes need the user's explicit yes.** `chaindoc_invoices_mark_paid`,
  `chaindoc_invoices_charge` and `chaindoc_invoices_create_credit_note` refuse unless you pass `confirm=true`. Say exactly
  what you will do (invoice, amount, method and date, customer), wait for a clear yes in this conversation, and only then
  set `confirm=true`. `autoCharge=true` on create or send also charges and needs the same. Never set `confirm` on your own.
  An uncertain failure is not retried automatically: read the invoice (or its credit notes) before trying again.
- **Cancel vs credit.** Check `canCancel`. Once money or a credit note reached an invoice, cancelling is refused
  (`INVOICE_MONEY_OR_CREDIT_NOTE`): use a credit note.
- **Bank details are READ ONLY here.** `chaindoc_payment_instructions_list` shows them; nothing creates, changes, defaults or
  assigns them. If the user wants to add or change an account or wallet, tell them to do it in the app under
  `/w/{workspaceUuid}/settings/payment-details`. Never ask them to type bank details into the chat for use here. Where an invoice
  is paid is not chosen here either: the cascade (contract, partner, business default) decides, and a choice for one invoice
  is made in the app.
- **VAT and partners.** `chaindoc_tax_treatments_list` for `taxTreatmentId`; `chaindoc_contragents_*` for the address
  book. A counterparty's legal identity (legal name, VAT number, registration number, address) is what prints on invoices.

## Processes

Processes replace the old approval workflows. `chaindoc_processes_list` (discovery is not permission to start) ->
`chaindoc_processes_get_entry` (exact input schema and `versionUuid`) -> `chaindoc_processes_start` (your `externalId`, the
`expectedVersionUuid`, only the declared `input` and `subjects`) -> `chaindoc_processes_get_case` and
`chaindoc_processes_get_events` to follow it. A case can email people: confirm the values with the user. A retry reuses the
same `externalId` and body. `PROCESS_VERSION_MOVED`: re-read the entry and start again with a new `externalId`.
`chaindoc_processes_respond` answers a "wait for a system" step and works only when the operator configured that
integration's secret; never ask for or pass a secret.

## Confirm before sending

Sending emails real people and can carry legal weight. Before sending a signature request, a template, a contract or an
invoice, restate the document, the people (name and address) and the deadline, and proceed on a clear yes. A single-line
confirmation is enough when the instruction was already exact.

## Links: always inside the workspace

Every app screen is under `/w/{workspaceUuid}/...`; a link without it drops the person out of their context. Examples:
`/w/{workspaceUuid}/documents/{documentId}`, `/contracts/{contractId}`, `/invoices/{invoiceId}`, `/templates/{templateId}`,
`/process-cases/{caseUuid}`. The full table is the resource `chaindoc://guide/workspace-links`. Get the workspace uuid from a
webhook event's `workspace.uuid`, from an app link the user pasted, or ask; never invent it. Do not construct other URLs from
tool output. Public signature check: `https://chaindoc.io/pdf-verify`. For on-chain proof show the raw `txHash` and `chainId`.

## Files

Files go through Storage and conversion, never signed as they are. `filePath` and `url` file inputs work only on the local
stdio server; on the hosted server send base64 (`kind: 'inline'`) or use Storage.

## Pairing with the other skills

- **find-documents** to look documents up; **summarize-document** to digest one.
