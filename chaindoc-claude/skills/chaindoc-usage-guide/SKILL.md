---
name: chaindoc-usage-guide
description: This skill should be used whenever the user asks Claude to work with documents, contracts, invoices, or signatures in Chaindoc — including phrases like "in chaindoc", "send for signature", "create an invoice", "draft a contract", "send a sign request", "track signatures", or any time the user references Chaindoc by name. It teaches Claude when to use the Chaindoc MCP tools and how to combine them into reliable workflows.
---

# Chaindoc usage guide

Chaindoc is a document management platform for contracts, invoices, and
signature workflows. The Chaindoc MCP server exposes tools for creating,
retrieving, analyzing, and routing those documents.

This skill is the orientation layer for the rest of the plugin: it tells Claude
when to reach for Chaindoc tools and how to chain them safely.

## When to use Chaindoc tools

Reach for the Chaindoc MCP whenever the user's intent involves:

- Creating, drafting, or generating a contract, invoice, or other document
- Listing, searching, or retrieving documents the user already has in Chaindoc
- Sending a document for signature, or checking who has signed and who hasn't
- Cancelling, voiding, or amending an in-flight signature request
- Auditing or analyzing document content (clauses, totals, parties, dates)

If the user says "the invoice", "the contract", "the NDA", or names a document
without uploading one, assume it lives in Chaindoc and try to find it before
asking the user to attach a file.

## Core workflow patterns

### Find before you act

Never create a duplicate. Before drafting a new contract or invoice, search
Chaindoc for an existing one matching the counterparty, project, or reference
number. Use the `find-documents` skill or call the Chaindoc list/search tool
directly.

### Confirm before sending

Sending a signature request is a one-way action with legal weight. Before
calling any tool that dispatches a sign request, restate to the user:

1. Which document will be sent
2. Who the signers are (names and email addresses)
3. The signing order, if any

Only proceed after explicit confirmation. If the user's instruction is already
unambiguous ("send the Acme NDA to legal@acme.com for signature"), a brief
single-line confirmation is enough.

### Read the response, don't assume success

Chaindoc tool calls return structured data — document IDs, signer status,
expiry timestamps. Echo the relevant fields back to the user (document URL,
signer list, status) instead of saying "done" without evidence.

### Surface the canonical web links

When you create, retrieve, or verify a document, give the user clickable
Chaindoc URLs alongside the IDs — do not refuse or guess:

- **Document view / download:** `https://app.chaindoc.io/documents/{documentId}`
  where `{documentId}` is the UUID returned by `chaindoc_documents_create`,
  `chaindoc_contracts_create`, or any list/get tool.
- **Public PDF signature verification:** `https://chaindoc.io/pdf-verify` —
  use this when the user asks "is this signature valid?", "where can I check
  the signature?", or wants to share independent verification. No login
  required; the user uploads the signed PDF.

These are the only two URLs you should construct from tool output. Do not
fabricate block-explorer or other third-party verification URLs — surface the
raw `txHash` and `chainId` from the verification tool output instead, and let
the user paste them into their preferred explorer.

## Authentication

The MCP server reads `CHAINDOC_API_KEY` from the environment. If a tool call
returns an authentication error, do not retry blindly — tell the user the API
key looks missing or invalid and link them to the README's setup section.

## Money and signatures: ask, don't act

Chaindoc tools can dispatch contracts and invoices that have legal and
financial consequences. For any irreversible action (sending for signature,
marking an invoice as final, voiding a signed document), confirm with the user
in plain language before calling the tool. Never auto-send on a vague
instruction.

## Pairing with the other Chaindoc skills

- **find-documents** — invoke when the user wants to look up or list documents
- **summarize-document** — invoke when the user wants a digest of a specific
  document's contents

This skill stays loaded as orientation; the other two are activated by the
specific phrasing of the user's request.
