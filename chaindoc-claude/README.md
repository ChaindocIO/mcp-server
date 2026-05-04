# Chaindoc plugin

Control signatures, invoices, and contracts from Cowork. This plugin connects
Claude to Chaindoc so it can find documents, summarize them, and dispatch
signature requests on your behalf.

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

## Safety

The usage guide skill instructs Claude to confirm any irreversible action
(sending for signature, voiding a document, marking an invoice final) with you
before calling the tool. Authentication errors surface as a setup hint rather
than silent retries.
