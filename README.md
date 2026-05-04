# @chaindoc_io/mcp-server

A Model Context Protocol (MCP) server for [Chaindoc](https://chaindoc.io). Lets
LLM clients (Claude Desktop, Claude Code, Cursor, Cowork, etc.) drive the
Chaindoc REST API in natural language: blockchain-anchored documents, e-signature
requests, embedded signing sessions, contract lifecycles with billing, and
webhook signature verification.

> **Status:** v0.1.0. Built against the [Chaindoc REST API reference](https://chaindoc.io/docs/api-docs)
> and the [Chaindoc SDKs guide](https://chaindoc.io/docs/sdks). All endpoints in this
> README are real. The package depends on `@chaindoc_io/server-sdk@^1.0.0` at runtime.

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
| `PORT` | no | `8787` | HTTP transport. |
| `HOST` | no | `0.0.0.0` | HTTP transport. |

## Tools

All tools accept JSON arguments and return structured JSON. Errors come back as
MCP `isError: true` with a normalized envelope:

```json
{
  "code": "rate_limited",
  "httpStatus": 429,
  "message": "...",
  "retryAfter": 30
}
```

### Account

| Tool | Endpoint |
|---|---|
| `chaindoc_account_get_api_key_info` | `GET /me` |
| `chaindoc_account_health_check` | `GET /health` |

### Media

| Tool | Endpoint |
|---|---|
| `chaindoc_media_upload` | `POST /media/upload` (multipart, up to 10 files, 250 MB each) |

### Documents

| Tool | Endpoint |
|---|---|
| `chaindoc_documents_create` | `POST /documents` |
| `chaindoc_documents_update` | `PUT /documents/:documentId` (creates new version) |
| `chaindoc_documents_update_rights` | `PUT /documents/:documentId/rights` |
| `chaindoc_documents_verify` | `POST /documents/verify` |
| `chaindoc_documents_get_verification_status` | `GET /documents/versions/:versionId/verification` |

### Signatures

| Tool | Endpoint |
|---|---|
| `chaindoc_signatures_create_request` | `POST /signatures/requests` (incl. pre-placed fields) |
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
| `chaindoc_invoices_mark_paid` | `POST /contracts/:contractId/invoices/:invoiceUuid/mark-paid` |

### Transactions

| Tool | Endpoint |
|---|---|
| `chaindoc_transactions_list_by_contract` | `GET /contracts/:contractId/transactions` |
| `chaindoc_transactions_get` | `GET /transactions/:transactionUuid` |

### Templates

| Tool | Endpoint |
|---|---|
| `chaindoc_templates_create_document` | `POST /templates/:templateId/documents` |
| `chaindoc_templates_send_for_signing` | `POST /templates/:templateId/signature-requests` |
| `chaindoc_templates_create_contract` | `POST /templates/:templateId/contracts` |

### Webhooks

Webhook **delivery** is configured in the Chaindoc dashboard, not via the API
(by design, so an API key can't reconfigure its own delivery target). What this
server exposes is a **verifier**:

| Tool | Notes |
|---|---|
| `chaindoc_webhooks_verify` | Wraps `Chaindoc.webhooks.verify()` — HMAC-SHA256 + 5-minute replay window. Returns `{ valid, envelope?, reason? }`. |

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

## Prompts

`summarize_document`, `prepare_signature_request`, `audit_open_signers`,
`verify_document_chain_of_custody`, `set_up_contract_with_billing`,
`verify_incoming_webhook`.

## Develop

```bash
npm install
npm run typecheck
npm run test
npm run dev:stdio       # local stdio with tsx
npm run inspect         # MCP Inspector smoke test
npm run dev:http        # local HTTP at :8787
```

## Security

- The server never logs the API key. Pino redact paths cover env vars, config,
  and `Authorization` headers.
- The webhook verifier is the only thing that touches webhook secrets, and it's
  one-shot — secrets aren't stored.
- Token-bucket throttle (`CHAINDOC_MAX_RPS`) defaults to Chaindoc's actual
  limit (10 requests / 60 seconds) so an agent loop won't blow the quota.
- Circuit breaker opens after 3 consecutive 5xx and short-circuits for 30s.
- The Chaindoc SDK already handles 429 / 5xx / network retries with exponential
  backoff + jitter; we layer on top, not replace.

## Roadmap

- Per-tenant logging context for the HTTP transport.
- Optional Prometheus metrics endpoint.
- Cowork plugin marketplace listing.
- Contract template variable validation against published template definitions.

## License

MIT
