---
name: summarize-document
description: This skill should be used when the user asks to "summarize a document", "give me the gist of this contract", "what does this invoice say", "what are the key terms", "what is in the NDA", "tl;dr the agreement", or any request for a digest, overview, or analysis of a document stored in Chaindoc. Use it for contracts, invoices, NDAs, MSAs, addendums, signature requests, and any other Chaindoc document.
---

# Summarize a Chaindoc document

Produce a clear, accurate digest of a single document held in Chaindoc.
Optimize for the user spotting issues fast.

## Step 1 — Identify the target document

If the user named a document by ID, fetch it directly via the Chaindoc MCP.

If the user named it informally ("the Acme MSA", "yesterday's invoice"), hand
off to the `find-documents` skill first to resolve the reference. Confirm the
match with the user before summarizing if more than one document fits.

If the user has multiple documents open in Chaindoc and the reference is
genuinely ambiguous, list candidates and ask which one — do not guess.

## Step 2 — Pull the right level of detail

Use the Chaindoc retrieve tool to get the document's content. If the document
is long, fetch the structured fields (parties, dates, totals, clause headers)
before pulling full clause text. Don't dump the full document into the
response.

## Step 3 — Structure the summary by document type

Match the digest to the document type. Use the relevant template; skip
sections that don't apply.

### Contract / agreement

- **Parties** — who is signing, on which side
- **Effective date and term** — start, end, auto-renewal, notice period
- **Scope** — what is being provided or licensed
- **Commercial terms** — fees, payment schedule, caps
- **Key obligations** — top three to five things each party must do
- **Liability and indemnity** — caps, carve-outs, mutual vs one-sided
- **Termination** — for cause, for convenience, notice
- **Unusual or aggressive clauses** — call out anything outside market norm

### Invoice

- **Vendor and customer**
- **Invoice number, issue date, due date**
- **Line items** — keep it brief; collapse if more than five
- **Subtotal, tax, total**
- **Payment terms and method**
- **Status** — draft, sent, paid, overdue

### NDA

- **Parties and direction** — one-way or mutual
- **Definition of confidential information**
- **Permitted uses and exclusions**
- **Term and survival**
- **Governing law**

### Signature request

- **Document being signed**
- **Signers and signing order**
- **Status per signer** — sent, viewed, signed, declined
- **Expiry date**

## Step 4 — Flag issues

After the summary, add a short "Things to look at" section if any of these are
true:

- A required field is missing (no signer, no due date, no governing law)
- A clause materially favors one side (uncapped liability, perpetual term)
- The document conflicts with another Chaindoc document the user referenced
- The signature request has expired or is close to expiry

Keep this section concrete: name the issue, point to the clause or field.

## Step 5 — Offer a next action

Close with a single suggested next step phrased as a question, not a command:

- "Want me to send this for signature?" (confirm signers first)
- "Want me to draft an amendment to clause 7?"
- "Want the full text of section 4.2?"

Do not execute the next action automatically — wait for the user.

## Length and tone

Aim for under 250 words for a contract summary, under 100 words for an invoice
or signature-request status. Use plain English. Quote a clause directly only
when the exact wording matters (numbers, deadlines, named parties).
