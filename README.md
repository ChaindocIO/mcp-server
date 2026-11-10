# @chaindoc_io/mcp-server

A Model Context Protocol (MCP) server for **[Chaindoc](https://chaindoc.io)** —
the blockchain-anchored document and e-signature platform. This package lets
LLM clients (Claude Desktop, Claude Code, Cursor, Cowork, and other MCP-aware
agents) drive the [Chaindoc REST API](https://chaindoc.io/docs) in natural
language: create [tamper-proof documents](https://chaindoc.io/create-document),
send [e-signature requests](https://chaindoc.io/signing), render
[contract templates](https://chaindoc.io/contract-templates), run
[embedded signing sessions](https://chaindoc.io/api-integration), collect
[contract payments](https://chaindoc.io/payments), and
[verify any document](https://chaindoc.io/verify-document) on chain.

> **Status:** v0.3.0 (124 tools). Built against the
> [Chaindoc REST API and SDK docs](https://chaindoc.io/docs). Runtime depends on
> [`@chaindoc_io/server-sdk@^3.0.0`](https://www.npmjs.com/package/@chaindoc_io/server-sdk).
> **0.3.0 is a breaking update**, see [CHANGELOG.md](CHANGELOG.md): documents are text with chips (a file is
> converted, signature places are bound by role, not coordinates), templates use the new content format,
> template previews are gone, and money acts need an explicit confirmation. Every call needs a **Business plan**.

## Built for

[Chaindoc](https://chaindoc.io) is used across regulated and document-heavy
industries. The MCP server exposes the same primitives, so agents can automate
the same flows your dashboard users run today:

- **[Freelancers](https://chaindoc.io/freelancers)** — send NDAs, service
  agreements, and invoices to clients with a verifiable audit trail and no
  legal-ops overhead.
- **[IT companies](https://chaindoc.io/it-companies)** — automate MSAs, SOWs,
  vendor agreements, and SaaS renewals end-to-end from the agent.
- **[Real estate](https://chaindoc.io/real-estate)** — listings, lease
  agreements, purchase contracts, and disclosure forms with cryptographic
  proof of execution.
- **[Insurance](https://chaindoc.io/insurance)** — policy issuance, claims
  documentation, and broker agreements signed and anchored on chain.
- **[Healthcare](https://chaindoc.io/healthcare)** — patient consents,
  authorizations, and clinician contracts with tamper-evident versioning.

Working in another vertical? The API surface is generic — the industry pages
just showcase the templates and flows Chaindoc ships out of the box.

## What you can build

Each capability below maps to a tool group in this server. Click through for
the product page on [chaindoc.io](https://chaindoc.io).

- **[Blockchain document creation](https://chaindoc.io/create-document)** —
  upload a PDF, DOC, image, or video and anchor a tamper-evident hash on
  chain. Returns a verifiable `versionHash`.
- **[E-signature requests](https://chaindoc.io/signing)** — single- or
  multi-party signing flows; recipients sign in parallel with delegated-API or
  embedded-iframe modes.
- **[Contract templates](https://chaindoc.io/contract-templates)** — render
  reusable templates with variables and ship them directly into a signing or
  contract flow.
- **[Payments and invoicing](https://chaindoc.io/payments)** — attach
  recurring or one-off payment terms to contracts and charge through Stripe
  Connect.
- **[Document verification](https://chaindoc.io/verify-document)** — verify
  any document version's blockchain anchor by hash, or run a
  [PDF certificate verification](https://chaindoc.io/pdf-verify) end-to-end.
- **[Team management](https://chaindoc.io/team-management)** — share
  documents, set per-role rights, and audit access.
- **[API integration](https://chaindoc.io/api-integration)** — full REST
  surface, webhook delivery with signed canonical envelopes, and per-tenant
  API keys.

Ready to ship? See [plans and pricing](https://chaindoc.io/pricing) (API
access ships with the Business plan), explore the
[partnership program](https://chaindoc.io/partnership), or
[create an account](https://app.chaindoc.io/?lang=en) and grab an `sk_*` key
in **Settings → API Access**.

## Install

```bash
npm install -g @chaindoc_io/mcp-server
# or run on demand:
npx @chaindoc_io/mcp-server
```

You need a Chaindoc API key (Business plan). Create one in **Settings → API Access**.
Use `sk_*` for full read/write or `pk_*` for read-only operations.

## Configure your MCP client

### Claude Desktop / Claude Code (stdio)

```json
{
  "mcpServers": {
    "chaindoc": {
      "command": "npx",
      "args": ["-y", "@chaindoc_io/mcp-server"],
      "env": {
        "CHAINDOC_API_KEY": "sk_your_secret_key",
        "CHAINDOC_ENVIRONMENT": "production"
      }
    }
  }
}
```

### Cursor (`.cursor/mcp.json`)

Same shape as Claude Desktop.

### Cowork plugin

Install the bundled plugin (`chaindoc.plugin`). It includes a `chaindoc-workflows`
skill that scaffolds the most common flows.

### Hosted HTTP / SSE

Run the HTTP transport (Docker image or `npm run start:http`) and point your
MCP client at:

```
https://your-host/mcp
Authorization: Bearer sk_your_secret_key
```

The header takes precedence over `CHAINDOC_API_KEY` in the server's env, so
one deployment can serve many tenants.

## Configuration

| Env var | Required | Default | Notes |
|---|---|---|---|
| `CHAINDOC_API_KEY` | yes (stdio) / no (HTTP if header used) | – | `sk_` or `pk_`. |
| `CHAINDOC_ENVIRONMENT` | no | `production` | `production` \| `staging` \| `development`. |
| `CHAINDOC_LOG_LEVEL` | no | `info` | pino levels. |
| `CHAINDOC_MAX_RPS` | no | `0.166` (10/60s) | Client-side cap, matches Chaindoc's limit. |
| `CHAINDOC_TIMEOUT_MS` | no | `30000` | SDK request timeout. |
| `CHAINDOC_RETRY_MAX_RETRIES` | no | `3` | SDK retry tuning. |
| `CHAINDOC_RETRY_BASE_DELAY_MS` | no | `1000` | |
| `CHAINDOC_RETRY_MAX_DELAY_MS` | no | `10000` | |
| `CHAINDOC_DOWNLOAD_MODE` | no | `auto` | `auto`\|`disk`\|`inline`. Auto = `disk` on stdio, `inline` on HTTP. |
| `CHAINDOC_DOWNLOAD_DIR` | no | `<os.tmpdir>/chaindoc-mcp` | Where binary downloads land when mode resolves to `disk`. |
| `CHAINDOC_INLINE_DOWNLOAD_MAX_BYTES` | no | `4194304` | Caps inline base64 size; over → `payload_too_large`. |
| `PORT` | no | `8787` | HTTP transport. |
| `HOST` | no | `0.0.0.0` | HTTP transport. |

## Tools

All tools accept JSON arguments and return structured JSON. Errors come back as
MCP `isError: true` with a normalized envelope:

```json
{
  "code": "forbidden",
  "httpStatus": 403,
  "errorKey": "INTEGRATIONS_NOT_IN_PLAN",
  "message": "...",
  "hint": "The workspace needs the Business plan (or above) for API/MCP access; tell the user to upgrade, then retry."
}
```

`errorKey` is the server's own machine-readable reason, passed through as sent; `hint` is one line for the keys we
know (plan, read-only account, limits, `DOCUMENT_FILE_CONVERTS`, `SIGNING_FIELDS_EMPTY`, `TEMPLATE_*`, `STRIPE_*`,
`PROCESS_*`, ...). Errors raised by this server itself: `confirmation_required` (a money act without `confirm=true`),
`unavailable`, `file_input_refused`.

### Account

| Tool | Endpoint |
|---|---|
| `chaindoc_account_get_api_key_info` | `GET /me` |
| `chaindoc_account_health_check` | `GET /health` |

### Media

| Tool | Endpoint |
|---|---|
| `chaindoc_storage_upload_file` | `POST /media/chunked` (resumable upload into Storage; returns `storageFileId`) |
| `chaindoc_media_upload` | `POST /media/upload` (temporary; only for a saved-signature image) |

File inputs: `kind: 'inline'` (base64) works everywhere. `filePath` and `url` work only on the local **stdio** server
(a path must be a regular file; a URL must be public http(s), is checked against private/loopback/link-local ranges and
is never redirected); the hosted HTTP server refuses them. Size cap 250 MB, enforced before and while reading.

### Documents

| Tool | Endpoint |
|---|---|
| `chaindoc_documents_create` | `POST /documents` (a text document from `content`) |
| `chaindoc_documents_create_from_file` | Storage upload + `POST /documents/from-storage` (202, a conversion) |
| `chaindoc_documents_create_from_storage` | `POST /documents/from-storage` |
| `chaindoc_conversions_get` / `_wait` | `GET /documents/conversions/:id` (wait polls with backoff) |
| `chaindoc_documents_update` | `PUT /documents/:documentId` (next version from `content` + `baseVersionId`, or from a Storage file) |
| `chaindoc_documents_get_content` | `GET /documents/:documentId/content` (text, `roles`, `fields`) |
| `chaindoc_documents_convert` | `POST /documents/:documentId/conversion` |
| `chaindoc_documents_add_signature_block` | `POST /documents/:documentId/signature-block` |
| `chaindoc_documents_update_rights` | `PUT /documents/:documentId/rights` |
| `chaindoc_documents_verify` | `POST /documents/verify` |
| `chaindoc_documents_get_verification_status` | `GET /documents/versions/:versionId/verification` |

### Signatures

| Tool | Endpoint |
|---|---|
| `chaindoc_signatures_create_request` | `POST /signatures/requests` (recipients bound by `role`, optional `account`; no coordinates) |
| `chaindoc_signatures_resend` | `POST /signatures/requests/:requestId/resend` |
| `chaindoc_signatures_get_request_status` | `GET /signatures/requests/:requestId/status` |
| `chaindoc_signatures_sign` | `POST /signatures/sign` |
| `chaindoc_signatures_get_my_requests` | `GET /signatures/requests` |
| `chaindoc_signatures_get_signatures` | `GET /signatures` |

### Embedded sessions

| Tool | Endpoint |
|---|---|
| `chaindoc_embedded_create_session` | `POST /embedded/sessions` (10-minute TTL) |

### Contracts

| Tool | Endpoint |
|---|---|
| `chaindoc_contracts_create` | `POST /contracts` |
| `chaindoc_contracts_list` | `GET /contracts` |
| `chaindoc_contracts_get` | `GET /contracts/:contractId` |
| `chaindoc_contracts_get_status` | `GET /contracts/:contractId/status` |
| `chaindoc_contracts_get_activities` | `GET /contracts/:contractId/activities` |
| `chaindoc_contracts_add_payment_setup` | `POST /contracts/:contractId/payment-setup` |
| `chaindoc_contracts_send` | `POST /contracts/:contractId/send` |
| `chaindoc_contracts_cancel` | `POST /contracts/:contractId/cancel` |
| `chaindoc_contracts_terminate` | `POST /contracts/:contractId/terminate` |

### Invoices

| Tool | Endpoint |
|---|---|
| `chaindoc_invoices_create` | `POST /contracts/:contractId/invoices` |
| `chaindoc_invoices_list` | `GET /contracts/:contractId/invoices` |
| `chaindoc_invoices_get` | `GET /contracts/:contractId/invoices/:invoiceUuid` |
| `chaindoc_invoices_send` | `POST /contracts/:contractId/invoices/:invoiceUuid/send` |
| `chaindoc_invoices_charge` | `POST /contracts/:contractId/invoices/:invoiceUuid/charge` |
| `chaindoc_invoices_mark_paid` | `POST /contracts/:contractId/invoices/:invoiceUuid/mark-paid` (**needs `confirm`**) |
| `chaindoc_invoices_list_credit_notes` | `GET /contracts/:contractId/invoices/:invoiceUuid/credit-notes` |
| `chaindoc_invoices_create_credit_note` | `POST /contracts/:contractId/invoices/:invoiceUuid/credit-notes` (**needs `confirm`**) |

`charge`, `mark_paid` and `create_credit_note` (and `autoCharge: true` on create/send) refuse with
`confirmation_required` unless the agent passes `confirm: true`, which its description tells it to do only after the user
said yes. Money calls are not retried automatically.

### Transactions

| Tool | Endpoint |
|---|---|
| `chaindoc_transactions_list_by_contract` | `GET /contracts/:contractId/transactions` |
| `chaindoc_transactions_get` | `GET /transactions/:transactionUuid` |

### Templates

| Tool | Endpoint |
|---|---|
| `chaindoc_templates_list` / `_get` / `_get_versions` | `GET /templates...` (`_get` returns `workingCopy.revision`) |
| `chaindoc_templates_create` / `_update` | `POST` / `PATCH /templates...` (`content` v2 + `revision`) |
| `chaindoc_templates_publish` / `_archive` / `_restore` | `POST /templates/:templateId/{publish,archive,restore}` |
| `chaindoc_templates_delete` | `DELETE /templates/:templateId` (permanent, **needs `confirm`**) |
| `chaindoc_templates_create_document` | `POST /templates/:templateId/documents` |
| `chaindoc_templates_send_for_signing` | `POST /templates/:templateId/signature-requests` |
| `chaindoc_templates_create_contract` | `POST /templates/:templateId/contracts` |

### Accounts, counterparties, tax, payment instructions

| Tool | Endpoint |
|---|---|
| `chaindoc_accounts_lookup` | `POST /accounts/lookup` (where a person can be addressed: pass the option back as `account`) |
| `chaindoc_contragents_list` / `_get` / `_create` / `_update` | `/contragents...` |
| `chaindoc_tax_treatments_list` | `GET /tax-treatments` |
| `chaindoc_payment_instructions_list` | `GET /payment-instructions` (**read only**) |

Payment instructions (bank and crypto details) are read only through MCP: no tool creates, changes, defaults or
assigns them, and the contragent update refuses an assignment. They are the owner's, set in the Chaindoc app.

### Processes

| Tool | Endpoint |
|---|---|
| `chaindoc_processes_list` | `GET /processes` |
| `chaindoc_processes_get_entry` | `GET /processes/:processKey/entries/:entryKey` |
| `chaindoc_processes_start` | `POST /processes/:processKey/entries/:entryKey/cases` |
| `chaindoc_processes_get_case` | `GET /processes/cases/:caseUuid` |
| `chaindoc_processes_get_events` | `GET /processes/cases/:caseUuid/events` (one page) |
| `chaindoc_processes_respond` | `POST /processes/integrations/:integrationUuid/responses` (HMAC-signed) |

`respond` reads the integration secret from `CHAINDOC_PROCESS_INTEGRATION_SECRETS` (JSON `{ "<integrationUuid>": "<secret>" }`,
local stdio only); the secret is never a tool argument. Without it the tool answers `unavailable`.

### Webhooks

Webhook **delivery** is configured in the Chaindoc dashboard, not via the API
(by design, so an API key can't reconfigure its own delivery target). What this
server exposes is a **verifier**:

| Tool | Notes |
|---|---|
| `chaindoc_webhooks_verify` | Wraps `Chaindoc.webhooks.verify()` — HMAC-SHA256 + 5-minute replay window. Returns `{ valid, envelope? }` where `envelope` is the canonical `{ id, type, createdAt, data }` payload. Required headers: `X-Chaindoc-Signature` (`v1=<hex>`), `X-Chaindoc-Timestamp`, `X-Chaindoc-Event`, `X-Chaindoc-Delivery-Id`. |

### Removed in 0.3.0

`chaindoc_templates_preview_pdf`, `_preview_html`, `_preview_unsaved_pdf` (the routes are gone), `contentJson` and
`media` inputs, coordinate `fields` on signature requests, role audiences (`accessRoles`).

## Resources

| URI | Description |
|---|---|
| `chaindoc://account/me` | Current API key metadata |
| `chaindoc://account/health` | API reachability + key validity |
| `chaindoc://signatures/requests` | Recent signature requests |
| `chaindoc://signatures/requests/{id}` | Signature request status |
| `chaindoc://signatures` | Recent signatures |
| `chaindoc://documents/versions/{versionId}` | Verification status for a version |
| `chaindoc://verification/{versionHash}` | Blockchain verification by hash |
| `chaindoc://contracts` | Recent contracts |
| `chaindoc://contracts/{id}` | Contract details |
| `chaindoc://contracts/{id}/status` | Lightweight contract status |

Also: `chaindoc://templates`, `chaindoc://templates/{id}`, `chaindoc://invoices`, `chaindoc://contracts/{id}/stats`,
`chaindoc://contracts/{id}/termination`, `chaindoc://documents/{id}/content`, `chaindoc://conversions/{id}`,
`chaindoc://contragents`, `chaindoc://tax-treatments`, `chaindoc://payment-instructions` (read only),
`chaindoc://processes`, `chaindoc://processes/cases/{uuid}` and `chaindoc://guide/workspace-links` (where things are in the
app: `/w/{workspaceUuid}/...`). A source that cannot be listed appears as a `chaindoc://errors/...` entry with its reason.

## Prompts

`summarize_document`, `prepare_signature_request`, `audit_open_signers`,
`verify_document_chain_of_custody`, `set_up_contract_with_billing`,
`verify_incoming_webhook`, `manage_contract_termination`,
`author_and_publish_template`, `bill_recurring_on_imported_contract`, `send_file_for_signature`, `send_from_template`,
`record_offline_payment`, `credit_an_invoice`, `start_a_process`.

## Develop

```bash
npm install
npm run typecheck
npm run test
npm run dev:stdio       # local stdio with tsx
npm run inspect         # MCP Inspector smoke test
npm run dev:http        # local HTTP at :8787
```

### Manual smoke list (after `npm run inspect`)

- Contract lifecycle: `contracts.create_minimal` → `attach_document` →
  `payment_terms.create` → `send` → `business_sign` → `invoices.create` →
  `terminate`.
- File flow: `documents.create_from_file` → `conversions.wait` → `add_signature_block` → `get_content` →
  `signatures.create_request` (by role).
- Template lifecycle: `templates.create` → `get` (revision) → `update` → `publish` → `create_document`.
- Money: `invoices.create` → `send` → `mark_paid` without `confirm` (must refuse) → with `confirm`.
- Termination: mutual-approval flow end-to-end (initiate from one key,
  approve from another).
- Downloads: `documents.download` and `invoices.download_pdf` on both
  transports (stdio → disk path; HTTP → inline base64).

## Security

- A file path or URL given by a caller is read or fetched only on the local stdio transport; the hosted server
  refuses both (they would read its own files or reach its network).
- The server never logs the API key. Pino redact paths cover env vars, config,
  and `Authorization` headers.
- The webhook verifier is the only thing that touches webhook secrets, and it's
  one-shot — secrets aren't stored.
- Token-bucket throttle (`CHAINDOC_MAX_RPS`) defaults to Chaindoc's actual
  limit (10 requests / 60 seconds) so an agent loop won't blow the quota.
- Circuit breaker opens after 3 consecutive 5xx and short-circuits for 30s.
- The Chaindoc SDK retries reads; writes are retried only when the request provably never reached the server (or on
  429), and money calls are never retried automatically.

## Roadmap

- Per-tenant logging context for the HTTP transport.
- Optional Prometheus metrics endpoint.
- Cowork plugin marketplace listing.
- QES (device-signed) tools and `fieldValues` on `signatures.sign` (needs SDK support).
- Process material intakes (file upload into a case).

## License

MIT
