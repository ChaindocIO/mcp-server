---
name: find-documents
description: This skill should be used when the user asks to "find a document", "look up a contract", "search Chaindoc", "find the invoice", "show me the NDA", "list contracts with <party>", "where is the <document>", or any other request to locate, list, or retrieve documents stored in Chaindoc. Use it any time the user references a document by name, counterparty, project, or status without attaching a file.
---

# Find documents in Chaindoc

Locate documents the user already has in Chaindoc. This skill turns vague
references ("the Acme contract", "last month's invoices", "the NDA we sent
to Bob") into a concrete document or list of documents.

## Inputs to extract from the user's request

Before calling any tool, identify whatever the user gave you:

- **Counterparty** — company or person name (e.g. "Acme", "bob@acme.com")
- **Document type** — contract, invoice, NDA, MSA, signature request, etc.
- **Status** — draft, awaiting signature, signed, voided, overdue
- **Time window** — "last month", "in 2026", "since the last release"
- **Reference number** — invoice #, contract ID, internal reference
- **Free-text title or topic** — "the renewal", "the data processing addendum"

If the user gave only one of these, that's fine — pass it through and let the
search narrow the results. Don't interrogate the user up front; search first,
then refine.

## Calling the Chaindoc tools

Use the Chaindoc MCP tools (exposed under the `chaindoc` server) to list or
search documents. Prefer the most specific tool available:

1. If a document ID was provided, fetch it directly.
2. If a counterparty or reference number was provided, use the search tool with
   that filter.
3. Otherwise, list documents with the broadest filter the user implied (type,
   status, date range) and rank by recency.

## Presenting results

Return a compact list — title, counterparty, status, last-updated date, and a
link or ID — not a wall of JSON. Five entries max unless the user asked for
more. Format example:

```
1. Acme MSA — signed 2026-04-12 — id: doc_abc123
2. Acme renewal addendum — awaiting signature (2/3 signed) — id: doc_def456
3. Acme NDA — draft — id: doc_ghi789
```

If the search returns nothing, say so explicitly and suggest two or three
broader queries the user could try (drop the date filter, drop the status
filter, try a partial counterparty name).

## When to escalate to a follow-up action

After finding a document, the user often wants to do something with it. Watch
for cues:

- "Send it for signature" → confirm signers, then dispatch via the Chaindoc
  signature tool (see the usage guide skill on confirmation rules).
- "Summarize it" → hand off to the `summarize-document` skill.
- "Update the total" / "edit clause 4" → fetch the document, propose the edit,
  and apply via the Chaindoc edit tool only after the user confirms.

Do not auto-execute follow-up actions; surface the candidate next steps and let
the user pick.

## Edge cases

- **Ambiguous counterparty** ("the Acme contract" with three Acme contracts):
  list all three and ask which one.
- **Permission errors**: if a tool returns a 403 or "not found" for a document
  the user named directly, say the document may be outside their workspace
  rather than guessing.
- **Stale references**: if the user names a document that hasn't existed for a
  while, suggest the closest matches by title and counterparty.
