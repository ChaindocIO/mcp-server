import type { ChaindocClient } from "../core/client.js";
import { toChaindocMcpError } from "../core/errors.js";

/**
 * Resource registry. Each resource is identified by a URI under the
 * `chaindoc://` scheme. The MCP server reads these via the
 * resources/read JSON-RPC method.
 *
 * URI templates:
 *   chaindoc://account/me                       (current API key info)
 *   chaindoc://account/health                   (reachability + key validity)
 *   chaindoc://signatures/requests              (recent signature requests)
 *   chaindoc://signatures/requests/{id}         (request status)
 *   chaindoc://signatures                       (recent signatures)
 *   chaindoc://documents/versions/{versionId}   (verification status)
 *   chaindoc://verification/{versionHash}       (blockchain verify by hash)
 *   chaindoc://contracts                        (recent contracts)
 *   chaindoc://contracts/{id}                   (full contract)
 *   chaindoc://contracts/{id}/status            (lightweight status)
 *   chaindoc://templates                        (recent templates)
 *   chaindoc://templates/{id}                   (single template)
 *   chaindoc://invoices                         (recent invoices)
 *   chaindoc://contracts/{id}/stats             (contract stats)
 *   chaindoc://contracts/{id}/termination       (contract termination)
 *   chaindoc://documents/{id}/content           (a document's text, roles and fields)
 *   chaindoc://conversions/{id}                 (a file's conversion)
 *   chaindoc://contragents                      (counterparties)
 *   chaindoc://tax-treatments                   (tax treatments an invoice can name)
 *   chaindoc://payment-instructions             (READ ONLY bank/crypto details)
 *   chaindoc://processes                        (processes the key may discover)
 *   chaindoc://processes/cases/{uuid}           (a process case)
 *   chaindoc://guide/workspace-links            (where things are in the Chaindoc app: /w/{workspaceUuid}/...)
 */

export interface ResourceContent {
  uri: string;
  mimeType: string;
  text: string;
}

export interface ResourceListItem {
  uri: string;
  name: string;
  description?: string;
  mimeType: string;
}

const URI_ME = "chaindoc://account/me";
const URI_HEALTH = "chaindoc://account/health";
const URI_RECENT_SIGREQUESTS = "chaindoc://signatures/requests";
const URI_RECENT_SIGNATURES = "chaindoc://signatures";
const URI_RECENT_CONTRACTS = "chaindoc://contracts";

const RE_SIGREQUEST = /^chaindoc:\/\/signatures\/requests\/([0-9a-f-]+)$/i;
const RE_DOC_VERSION = /^chaindoc:\/\/documents\/versions\/([0-9a-f-]+)$/i;
const RE_VERIFY = /^chaindoc:\/\/verification\/(0x[0-9a-fA-F]+)$/;
const RE_CONTRACT = /^chaindoc:\/\/contracts\/([0-9a-f-]+)$/i;
const RE_CONTRACT_STATUS = /^chaindoc:\/\/contracts\/([0-9a-f-]+)\/status$/i;

const URI_CONTRAGENTS = "chaindoc://contragents";
const URI_TAX_TREATMENTS = "chaindoc://tax-treatments";
const URI_PAYMENT_INSTRUCTIONS = "chaindoc://payment-instructions";
const URI_PROCESSES = "chaindoc://processes";
const URI_GUIDE_LINKS = "chaindoc://guide/workspace-links";
const RE_DOC_CONTENT = /^chaindoc:\/\/documents\/([0-9a-f-]+)\/content$/i;
const RE_CONVERSION = /^chaindoc:\/\/conversions\/([0-9a-zA-Z_-]+)$/;
const RE_PROCESS_CASE = /^chaindoc:\/\/processes\/cases\/([0-9a-f-]+)$/i;

const URI_RECENT_TEMPLATES = "chaindoc://templates";
const URI_RECENT_INVOICES = "chaindoc://invoices";

const RE_TEMPLATE = /^chaindoc:\/\/templates\/([0-9a-f-]+)$/i;
const RE_CONTRACT_STATS = /^chaindoc:\/\/contracts\/([0-9a-f-]+)\/stats$/i;
const RE_CONTRACT_TERMINATION = /^chaindoc:\/\/contracts\/([0-9a-f-]+)\/termination$/i;

export async function listResources(client: ChaindocClient): Promise<ResourceListItem[]> {
  const items: ResourceListItem[] = [
    {
      uri: URI_ME,
      name: "Current API key info",
      description: "Metadata about the API key currently in use.",
      mimeType: "application/json",
    },
    {
      uri: URI_HEALTH,
      name: "API health",
      description: "Reachability + key validity probe.",
      mimeType: "application/json",
    },
    {
      uri: URI_RECENT_SIGREQUESTS,
      name: "Recent signature requests",
      description: "Index of signature requests for the authenticated key owner.",
      mimeType: "application/json",
    },
    {
      uri: URI_RECENT_SIGNATURES,
      name: "Recent signatures",
      description: "Index of signatures for the authenticated key owner.",
      mimeType: "application/json",
    },
    {
      uri: URI_RECENT_CONTRACTS,
      name: "Recent contracts",
      description: "Index of contracts created via the API.",
      mimeType: "application/json",
    },
    { uri: URI_RECENT_TEMPLATES, name: "Recent templates", description: "Index of owned templates.",                       mimeType: "application/json" },
    { uri: URI_RECENT_INVOICES,  name: "Recent invoices",  description: "Cross-contract invoice index for the key owner.", mimeType: "application/json" },
    { uri: URI_CONTRAGENTS, name: "Counterparties", description: "The business's address book (contragents).", mimeType: "application/json" },
    { uri: URI_TAX_TREATMENTS, name: "Tax treatments", description: "Tax treatments an invoice can name.", mimeType: "application/json" },
    { uri: URI_PAYMENT_INSTRUCTIONS, name: "Payment instructions (read only)", description: "Bank / crypto details the business prints on invoices. Read only: managed in the Chaindoc app.", mimeType: "application/json" },
    { uri: URI_PROCESSES, name: "Processes", description: "Processes this key may discover.", mimeType: "application/json" },
    { uri: URI_GUIDE_LINKS, name: "Where things are in the Chaindoc app", description: "Workspace-scoped links /w/{workspaceUuid}/... for documents, contracts, invoices, templates, processes.", mimeType: "text/markdown" },
  ];

  // Enrich with concrete ids so @-mention can find them. A source that fails is not hidden: it is listed as
  // an `chaindoc://errors/...` entry carrying the server's reason, so the listing stays honest and usable.
  items.push(
    ...(await enrich("signature requests", async () => {
      const reqs = await client.run("resources_list_signature_requests", (sdk) =>
        sdk.signatures.getMyRequests({ pageNumber: 1, pageSize: 25 }),
      );
      return reqs.items.map((r) => ({
        uri: `chaindoc://signatures/requests/${r.id}`,
        name: `Signature request ${r.id}`,
        description: `status=${r.status}`,
        mimeType: "application/json",
      }));
    })),
    ...(await enrich("contracts", async () => {
      const list = await client.run("resources_list_contracts", (sdk) => sdk.contracts.list({ page: 1, limit: 25 }));
      return list.contracts.map((c) => ({
        uri: `chaindoc://contracts/${c.id}`,
        name: c.title ?? `Contract ${c.id}`,
        description: `status=${c.status}`,
        mimeType: "application/json",
      }));
    })),
    ...(await enrich("templates", async () => {
      const list = await client.run("resources_list_templates", (sdk) => sdk.templates.list({ page: 1, limit: 25 }));
      return list.templates.map((t) => ({
        uri: `chaindoc://templates/${t.id}`,
        name: t.name ?? `Template ${t.id}`,
        description: `status=${t.status}`,
        mimeType: "application/json",
      }));
    })),
  );

  return items;
}

async function enrich(
  source: string,
  load: () => Promise<ResourceListItem[]>,
): Promise<ResourceListItem[]> {
  try {
    return await load();
  } catch (err) {
    const e = toChaindocMcpError(err);
    return [
      {
        uri: `chaindoc://errors/${source.replace(/\s+/g, "-")}`,
        name: `Could not list ${source}`,
        description: [e.errorKey ?? e.code, e.message, e.hint].filter(Boolean).join(" - "),
        mimeType: "text/plain",
      },
    ];
  }
}

export async function readResource(uri: string, client: ChaindocClient): Promise<ResourceContent> {
  if (uri === URI_ME) {
    const data = await client.run("resources_read_me", (sdk) => sdk.getApiKeyInfo());
    return jsonResource(uri, data);
  }
  if (uri === URI_HEALTH) {
    const data = await client.run("resources_read_health", (sdk) => sdk.healthCheck());
    return jsonResource(uri, data);
  }
  if (uri === URI_RECENT_SIGREQUESTS) {
    const data = await client.run("resources_read_signature_requests", (sdk) =>
      sdk.signatures.getMyRequests({ pageNumber: 1, pageSize: 25 }),
    );
    return jsonResource(uri, data);
  }
  if (uri === URI_RECENT_SIGNATURES) {
    const data = await client.run("resources_read_signatures", (sdk) =>
      sdk.signatures.getSignatures({ pageNumber: 1, pageSize: 25 }),
    );
    return jsonResource(uri, data);
  }
  if (uri === URI_RECENT_CONTRACTS) {
    const data = await client.run("resources_read_contracts", (sdk) =>
      sdk.contracts.list({ page: 1, limit: 25 }),
    );
    return jsonResource(uri, data);
  }

  let m = uri.match(RE_CONTRACT_STATUS);
  if (m) {
    const id = m[1]!;
    const data = await client.run("resources_read_contract_status", (sdk) =>
      sdk.contracts.getStatus(id),
    );
    return jsonResource(uri, data);
  }
  m = uri.match(RE_CONTRACT);
  if (m) {
    const id = m[1]!;
    const data = await client.run("resources_read_contract", (sdk) => sdk.contracts.get(id));
    return jsonResource(uri, data);
  }
  m = uri.match(RE_SIGREQUEST);
  if (m) {
    const id = m[1]!;
    const data = await client.run("resources_read_signature_request", (sdk) =>
      sdk.signatures.getRequestStatus(id),
    );
    return jsonResource(uri, data);
  }
  m = uri.match(RE_DOC_VERSION);
  if (m) {
    const versionId = m[1]!;
    const data = await client.run("resources_read_document_version", (sdk) =>
      sdk.documents.getVerificationStatus(versionId),
    );
    return jsonResource(uri, data);
  }
  m = uri.match(RE_VERIFY);
  if (m) {
    const versionHash = m[1]!;
    const data = await client.run("resources_read_verification", (sdk) =>
      sdk.documents.verify({ versionHash }),
    );
    return jsonResource(uri, data);
  }

  if (uri === URI_RECENT_TEMPLATES) {
    const data = await client.run("resources_read_templates", (sdk) =>
      sdk.templates.list({ page: 1, limit: 25 }),
    );
    return jsonResource(uri, data);
  }
  if (uri === URI_RECENT_INVOICES) {
    const data = await client.run("resources_read_invoices", (sdk) =>
      sdk.invoices.listAll({ page: 1, limit: 25 }),
    );
    return jsonResource(uri, data);
  }

  m = uri.match(RE_TEMPLATE);
  if (m) {
    const id = m[1]!;
    const data = await client.run("resources_read_template", (sdk) => sdk.templates.get(id));
    return jsonResource(uri, data);
  }
  m = uri.match(RE_CONTRACT_STATS);
  if (m) {
    const id = m[1]!;
    const data = await client.run("resources_read_contract_stats", (sdk) =>
      sdk.contracts.getStats(id),
    );
    return jsonResource(uri, data);
  }
  m = uri.match(RE_CONTRACT_TERMINATION);
  if (m) {
    const id = m[1]!;
    const data = await client.run("resources_read_contract_termination", (sdk) =>
      sdk.contracts.termination.get(id),
    );
    return jsonResource(uri, data);
  }

  if (uri === URI_CONTRAGENTS) {
    return jsonResource(uri, await client.run("resources_read_contragents", (sdk) => sdk.contragents.list()));
  }
  if (uri === URI_TAX_TREATMENTS) {
    return jsonResource(uri, await client.run("resources_read_tax_treatments", (sdk) => sdk.taxTreatments.list()));
  }
  if (uri === URI_PAYMENT_INSTRUCTIONS) {
    return jsonResource(
      uri,
      await client.run("resources_read_payment_instructions", (sdk) => sdk.paymentInstructions.list()),
    );
  }
  if (uri === URI_PROCESSES) {
    return jsonResource(uri, await client.run("resources_read_processes", (sdk) => sdk.processes.list()));
  }
  if (uri === URI_GUIDE_LINKS) {
    return { uri, mimeType: "text/markdown", text: WORKSPACE_LINKS_GUIDE };
  }
  m = uri.match(RE_DOC_CONTENT);
  if (m) {
    const id = m[1]!;
    return jsonResource(uri, await client.run("resources_read_document_content", (sdk) => sdk.documents.getContent(id)));
  }
  m = uri.match(RE_CONVERSION);
  if (m) {
    const id = m[1]!;
    return jsonResource(uri, await client.run("resources_read_conversion", (sdk) => sdk.conversions.get(id)));
  }
  m = uri.match(RE_PROCESS_CASE);
  if (m) {
    const id = m[1]!;
    return jsonResource(uri, await client.run("resources_read_process_case", (sdk) => sdk.processes.getCase(id)));
  }

  throw Object.assign(new Error(`Unknown resource URI: ${uri}`), { status: 404 });
}

function jsonResource(uri: string, data: unknown): ResourceContent {
  return {
    uri,
    mimeType: "application/json",
    text: JSON.stringify(data, null, 2),
  };
}

/**
 * Where things live in the Chaindoc app. Every business screen sits under `/w/{workspaceUuid}/`; a link without
 * the workspace drops the person out of their context. The paths are the app's own (src/app/w/[workspaceUuid]).
 */
export const WORKSPACE_LINKS_GUIDE = `# Where things are in the Chaindoc app

Every screen of a business is under \`/w/{workspaceUuid}/...\` on the Chaindoc app's own host (use the host of the
links the user already uses). Never give a link without the workspace segment. The workspace uuid comes from a webhook event's \`workspace.uuid\`, from any app link the user pasted
(\`/w/<uuid>/...\`), or from the user - never invent it.

| What | Path after /w/{workspaceUuid} |
|---|---|
| Documents (mine / shared / new) | /documents, /documents/my, /documents/shared, /documents/new |
| A document (view / edit) | /documents/{documentId}, /documents/{documentId}/edit |
| Signing (all / pending / completed) | /signing, /signing/pending, /signing/completed |
| Templates (list / one / use) | /templates, /templates/{templateId}, /templates/{templateId}/use |
| Contracts | /contracts, /contracts/{contractId} |
| Invoices | /invoices, /invoices/{invoiceId} |
| Counterparties | /contragents, /contragents/{contragentId} |
| Partners | /partners, /partners/{uuid} |
| Bills | /bills |
| Processes (list / start / cases) | /processes, /processes/{definitionUuid}/start, /process-cases/{caseUuid} |
| Tasks | /process-tasks |
| Storage | /storage |
| Payment details (bank, crypto) - owner only | /settings/payment-details |
| Tax rates | /settings/tax-rates |
| API keys | /settings/developers |
| Plan and billing | /settings/billing |
| Members | /settings/members |

Bank details are created and changed only in /settings/payment-details, never through MCP.
`;
