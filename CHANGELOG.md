# Changelog

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
