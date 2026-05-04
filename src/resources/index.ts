import type { ChaindocClient } from "../core/client.js";

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
  ];

  // Best-effort enrichment with concrete IDs so @-mention can find them.
  // Tolerate failures — listing must not fail entirely.
  try {
    const reqs = await client.run("resources_list_signature_requests", (sdk) =>
      sdk.signatures.getMyRequests({ pageNumber: 1, pageSize: 25 }),
    );
    const arr = Array.isArray((reqs as { items?: unknown[] }).items)
      ? ((reqs as { items: Array<{ id?: string; status?: string }> }).items)
      : [];
    for (const r of arr) {
      if (typeof r.id === "string") {
        items.push({
          uri: `chaindoc://signatures/requests/${r.id}`,
          name: `Signature request ${r.id}`,
          description: `status=${r.status ?? "unknown"}`,
          mimeType: "application/json",
        });
      }
    }
  } catch {
    /* swallow */
  }

  try {
    const list = await client.run("resources_list_contracts", (sdk) =>
      sdk.contracts.list({ page: 1, limit: 25 }),
    );
    const arr = Array.isArray((list as { contracts?: unknown[] }).contracts)
      ? ((list as { contracts: Array<{ id?: string; title?: string; status?: string }> }).contracts)
      : [];
    for (const c of arr) {
      if (typeof c.id === "string") {
        items.push({
          uri: `chaindoc://contracts/${c.id}`,
          name: c.title ?? `Contract ${c.id}`,
          description: `status=${c.status ?? "unknown"}`,
          mimeType: "application/json",
        });
      }
    }
  } catch {
    /* swallow */
  }

  return items;
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

  let m = RE_CONTRACT_STATUS.exec(uri);
  if (m) {
    const id = m[1]!;
    const data = await client.run("resources_read_contract_status", (sdk) =>
      sdk.contracts.getStatus(id),
    );
    return jsonResource(uri, data);
  }
  m = RE_CONTRACT.exec(uri);
  if (m) {
    const id = m[1]!;
    const data = await client.run("resources_read_contract", (sdk) => sdk.contracts.get(id));
    return jsonResource(uri, data);
  }
  m = RE_SIGREQUEST.exec(uri);
  if (m) {
    const id = m[1]!;
    const data = await client.run("resources_read_signature_request", (sdk) =>
      sdk.signatures.getRequestStatus(id),
    );
    return jsonResource(uri, data);
  }
  m = RE_DOC_VERSION.exec(uri);
  if (m) {
    const versionId = m[1]!;
    const data = await client.run("resources_read_document_version", (sdk) =>
      sdk.documents.getVerificationStatus(versionId),
    );
    return jsonResource(uri, data);
  }
  m = RE_VERIFY.exec(uri);
  if (m) {
    const versionHash = m[1]!;
    const data = await client.run("resources_read_verification", (sdk) =>
      sdk.documents.verify({ versionHash }),
    );
    return jsonResource(uri, data);
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
