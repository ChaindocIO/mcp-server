# Chaindoc plugin

Control signatures, invoices, and contracts from Cowork or Claude Code. This
plugin connects Claude to **[Chaindoc](https://chaindoc.io)** — the
blockchain-anchored document and e-signature platform — so it can find
documents, summarize them, and dispatch signature requests on your behalf.

Once installed, you can ask Claude things like:

- "Send the Acme MSA to legal@acme.com for signature with a deadline of
  next Friday."
- "What's outstanding on the Q4 contracts? List anything still pending
  signature."
- "Summarize the renewal contract and flag the auto-renew clause."
- "Charge the unpaid invoice on the Acme contract."
- "Verify this PDF — was it actually signed through Chaindoc?"

The plugin handles the API calls, confirms anything irreversible with you
first, and surfaces results in plain language.

## Built for

[Chaindoc](https://chaindoc.io) is used across regulated and document-heavy
industries:

- **[Freelancers](https://chaindoc.io/freelancers)** — NDAs, service
  agreements, and invoices with a verifiable audit trail.
- **[IT companies](https://chaindoc.io/it-companies)** — MSAs, SOWs,
  vendor agreements, and SaaS contract renewals.
- **[Real estate](https://chaindoc.io/real-estate)** — listings, leases,
  purchase contracts, and disclosure forms with cryptographic proof of
  execution.
- **[Insurance](https://chaindoc.io/insurance)** — policy issuance, claims
  documentation, and broker agreements.
- **[Healthcare](https://chaindoc.io/healthcare)** — patient consents,
  authorizations, and clinician contracts.

## What you can do

Each of these maps to a Chaindoc product page on
[chaindoc.io](https://chaindoc.io):

- **[Create blockchain-anchored documents](https://chaindoc.io/create-document)**
  with a tamper-evident hash on chain.
- **[Send e-signature requests](https://chaindoc.io/signing)** to one or
  more signers in parallel — email or embedded iframe flow.
- **[Render contract templates](https://chaindoc.io/contract-templates)**
  with variables and ship them straight into a signing flow.
- **[Collect contract payments](https://chaindoc.io/payments)** with
  recurring or one-off terms charged through Stripe Connect.
- **[Verify any document](https://chaindoc.io/verify-document)** by
  blockchain hash, or run a
  [PDF certificate check](https://chaindoc.io/pdf-verify) end-to-end.
- **[Manage your team](https://chaindoc.io/team-management)** — share docs,
  set per-role rights, audit access.

API access ships with the [Business plan](https://chaindoc.io/pricing).
Don't have an account yet?
[Create one](https://app.chaindoc.io/?lang=en) and grab an `sk_*` key in
**Settings → API Access**.

## Components

| Type   | Name                   | What it does                                                        |
| ------ | ---------------------- | ------------------------------------------------------------------- |
| MCP    | `chaindoc`             | Connects to the Chaindoc API via `@chaindoc_io/mcp-server`          |
| Skill  | `chaindoc-usage-guide` | Orientation: when to use Chaindoc tools and how to chain them safely |
| Skill  | `find-documents`       | Locates documents by counterparty, type, status, or reference number |
| Skill  | `summarize-document`   | Produces a digest tailored to contracts, invoices, NDAs, etc.        |

## Setup

The Chaindoc MCP server is launched via `npx` and reads one environment
variable:

| Variable           | Required | Description                       |
| ------------------ | -------- | --------------------------------- |
| `CHAINDOC_API_KEY` | Yes      | Your Chaindoc API key             |

Set it in your shell environment before launching Cowork — for example, in
`~/.zshrc`:

```bash
export CHAINDOC_API_KEY="your-key-here"
```

The plugin uses `/usr/local/bin/npx` to launch the server. If `npx` lives
elsewhere on your machine, edit `.mcp.json` and update the `command` field.

## Usage

The skills trigger on natural-language phrasing:

- "Find the Acme MSA in Chaindoc" → `find-documents`
- "Summarize the renewal contract" → `summarize-document`
- "Send the NDA to legal@acme.com for signature" → `chaindoc-usage-guide`
  routes to the right Chaindoc tool with confirmation

You can also reference Chaindoc directly: "in chaindoc, list invoices waiting
on payment".

## Viewing & verifying documents

After Claude creates or retrieves a document, you can interact with it directly
in the Chaindoc web app:

- **View / download a document:** `https://app.chaindoc.io/documents/{documentId}`
  — replace `{documentId}` with the UUID returned by tools like
  `chaindoc_documents_create` or `chaindoc_contracts_create`.
  Example: `https://app.chaindoc.io/documents/5d8e4682-b6d6-4069-bca0-5b3482ed55b1`
- **Verify a signed PDF publicly:** [chaindoc.io/pdf-verify](https://chaindoc.io/pdf-verify)
  — no login required. Upload the signed PDF and Chaindoc confirms whether the
  signature and on-chain anchor are valid.

## Safety

The usage guide skill instructs Claude to confirm any irreversible action
(sending for signature, voiding a document, marking an invoice final) with you
before calling the tool. Authentication errors surface as a setup hint rather
than silent retries.
