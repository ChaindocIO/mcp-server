# Changelog

## [Unreleased]

Found by driving the server over stdio against a live backend. No version bump yet.

### Added
- `CHAINDOC_BASE_URL`: the API origin. The server SDK resolves every `CHAINDOC_ENVIRONMENT` to the production API, so
  until now the server could not reach any other backend (a non-production key was sent to production). Operator's
  setting only; the hosted transport never takes it from a caller.

### Fixed
- **Refusal facts reach the agent.** The SDK keeps the answer body on `error.response`; the server read `error.body`, so
  `details` was always empty and `SETUP_BLOCKED`'s `details.blockers` (promised by its hint), `SIGNATURE_ROLE_UNKNOWN`'s
  `role`/`roles` and `*_NOT_PENDING`'s `status` never arrived.
- **Content version 3.** The server answers `content.version: 3` (and takes 1, 2, 3); the input schemas took only `2`, so
  a document or template made in the app could not be written back: the MCP refused it before any call.
- **Key first, text as fallback.** State codes (`wrong_state`, `stripe_not_ready`) come from `errorKey`
  (`CONTRACT_NOT_A_DRAFT`, `INVOICE_NOT_A_DRAFT`, `STRIPE_*`); the message text is read only when the answer has no key.
  The contract-draft text pattern matched nothing the server says; it now matches the server's own sentences.
- **Hints** for keys an agent meets (`KEY_WORKSPACE_IS_NOT_A_PERSON`, `BUSINESS_PROFILE_INCOMPLETE`, `*_NOT_PENDING`,
  `EMBEDDED_*`, `DOCUMENT_NOT_A_FILE`, `KYC_NOT_VERIFIED`, plan limits, workspace states, `VALIDATION_FAILED`,
  `AMENDMENT_CARRIES_NO_MONEY`...); `SETUP_BLOCKED` and `SIGNATURE_ROLE_UNKNOWN` name the contract's `business` /
  `contragent` roles.
- **Descriptions that were not true:** `contracts_cancel` (a sent contract is refused; withdraw it with
  `cancel_signing_request`), `contracts_send` / `agreements_initiate_signing` (the sides' chips and the refusals),
  `create_minimal` / `create_empty` / `import` (no Stripe precondition), `get_my_requests` (no per-status totals),
  `wait_for_verification` (a signature request does not wait for the anchor), `documents_get` `sendable`, person-only
  tools refused to a team key, `get_request_status` role and decline fields, conversion `progress`/`review`, embedded
  session refusals.
- **An amendment carries no money:** `agreements_create` no longer offers `modifiesPaymentTerms` /
  `paymentTermModifications` (the server refuses them, 422 `AMENDMENT_CARRIES_NO_MONEY`).
- `chaindoc.plugin` was a zip of plugin 0.1.2 (May 2026, before text documents and the money rules): rebuilt from
  `chaindoc-claude/`, and a test keeps the bundle equal to the folder.
- README / usage skill / smithery: a `pk_` key is refused by the SDK; `CHAINDOC_ENVIRONMENT` switches nothing; contracts
  section (sides' chips, withdraw vs cancel, no money in amendments); content version 3.

### Release note (for the version bump)
- With the published server-sdk 3.0.0 seven tools answer `400` on every call ("Body cannot be empty when content-type is
  set to 'application/json'"): `contracts_delete`, `contracts_payment_terms_delete`, `contracts_agreements_delete`,
  `templates_delete`, `contracts_cancel_signing_request`, `contracts_termination_cancel`,
  `contracts_cancel_recurring_approval`. The SDK's `main` fixes them; the release must bump the SDK dependency.

## [0.3.0] - 2026-11-10

**BREAKING.** Aligns the server and the Claude plugin with the platform of November 2026 and `@chaindoc_io/server-sdk@3.0.0`.
Not published: version bump only.

### Added
- **Documents as text.** `chaindoc_documents_create` takes `content` (engine v2). A file goes
  `chaindoc_documents_create_from_file` / `_create_from_storage` (a 202 conversion) and `chaindoc_conversions_get` /
  `_wait`; `chaindoc_storage_upload_file`; `chaindoc_documents_get_content`, `_convert`, `_add_signature_block`.
- **Signatures.** `recipients[].role` and `account`; `chaindoc_signatures_resend`.
- **Templates in the new format.** `content` + `revision`; publish, archive, restore; contracts and signature requests from a
  template with slots by e-mail/`account`.
- **People.** `chaindoc_accounts_lookup`; `account` on recipients, access grants, template slots, `contragentAccount` on contracts.
- **Money.** Contragents, tax treatments, payment instructions (**read only**), credit notes; new invoice fields (`discount`,
  `taxTreatmentId`, `paymentInstructionId`, `stripePaymentAllowed`, `showUnpaid`, `takePaidAhead`, `method` on mark-paid);
  contract counterparty identity and `stripePaymentAllowed`.
- **Money confirmation.** `charge`, `mark_paid`, `create_credit_note`, `autoCharge: true`, and template `delete` refuse with
  `confirmation_required` unless `confirm: true` (descriptions tell the agent to ask the user first).
- **Processes.** Six tools: list, get_entry, start, get_case, get_events, respond (secret from the operator's environment).
- **Errors.** `errorKey` passed through with a one-line `hint` for known keys; `confirmation_required`, `unavailable`,
  `file_input_refused`.
- **Resources and prompts.** Resources for content, conversions, contragents, tax treatments, payment instructions, processes and the
  workspace-links guide; prompts `send_file_for_signature`, `send_from_template`, `record_offline_payment`, `credit_an_invoice`,
  `start_a_process`. A resource source that fails is listed with its reason instead of being swallowed.
- **Hosted transport.** Smithery `?config=` credentials and `smithery.yaml`.
- **Plugin 0.3.0.** Skills rewritten: text documents and chips, workspace links `/w/{workspaceUuid}/...`, money rules, processes, errors.

### Changed
- Dependency: `@chaindoc_io/server-sdk` ^3.0.0. Dependency bumps pinned (all older than two weeks). npm is the package manager.
- `filePath` and `url` file inputs work only on stdio (path: `realpath`, regular file; URL: http(s), private/loopback/link-local/CGNAT/metadata
  ranges refused, no redirects); size cap checked before and while reading. base64 works everywhere.
- Flat `eslint.config.js` (`npm run lint` works with ESLint 9).
- Tool descriptions: `chaindoc_media_upload` is only for a saved-signature image.

### Removed
- `chaindoc_templates_preview_pdf`, `_preview_html`, `_preview_unsaved_pdf`; `contentJson`, `media` (documents), coordinate `fields`,
  `accessRoles`, delegated template slots and `signerVariables`.

## [0.2.0] - 2026-05-18
Extended tool surface (103 tools).
