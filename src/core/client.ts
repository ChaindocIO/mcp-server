import type { Logger } from "./logger.js";
import { CircuitBreaker, TokenBucket } from "./rate-limit.js";

/**
 * Type-only mirror of the public surface of `@chaindoc_io/server-sdk`.
 *
 * Source of truth for these types is the Chaindoc API reference at
 * https://chaindoc.io/docs/api-docs and the SDK guide at
 * https://chaindoc.io/docs/sdks. This interface deliberately stays
 * loose (no required output types) so we can compile without the SDK
 * installed.
 */
export interface ChaindocSdkLike {
  // Top-level helpers ---------------------------------------------------
  getApiKeyInfo(): Promise<{
    keyId: string;
    keyName: string;
    isActive: boolean;
    accessLevel: "read" | "write";
    lastUsedAt?: string;
  }>;
  healthCheck(): Promise<{ status: string; timestamp: string; apiKeyValid: boolean }>;

  // Namespaces ----------------------------------------------------------
  media: {
    upload(files: Array<File | Blob>): Promise<{
      success?: boolean;
      media: ChaindocMediaHandle[];
    }>;
  };

  documents: {
    create(input: ChaindocDocumentCreateInput): Promise<ChaindocDocumentEnvelope>;
    update(id: string, input: ChaindocDocumentUpdateInput): Promise<unknown>;
    updateRights(id: string, input: ChaindocDocumentRightsInput): Promise<unknown>;
    verify(input: ChaindocVerifyInput): Promise<ChaindocVerifyResult>;
    getVerificationStatus(versionId: string): Promise<ChaindocVerificationStatusResult>;
  };

  signatures: {
    createRequest(input: ChaindocSignatureRequestInput): Promise<ChaindocSignatureRequestEnvelope>;
    getRequestStatus(requestId: string): Promise<ChaindocSignatureRequestStatus>;
    sign(input: ChaindocSignInput): Promise<ChaindocSignResult>;
    getMyRequests(input: ChaindocPaginationInput): Promise<ChaindocSignatureRequestsPage>;
    getSignatures(input: ChaindocPaginationInput): Promise<ChaindocSignaturesPage>;
  };

  embedded: {
    createSession(input: ChaindocEmbeddedSessionInput): Promise<ChaindocEmbeddedSession>;
  };

  contracts: {
    create(input: ChaindocContractCreateInput): Promise<ChaindocContractEnvelope>;
    list(input: ChaindocContractListInput): Promise<ChaindocContractListResult>;
    get(contractId: string): Promise<{ success?: boolean; contract: unknown }>;
    getStatus(contractId: string): Promise<ChaindocContractStatusResult>;
    getActivities(
      contractId: string,
      input?: { page?: number; limit?: number },
    ): Promise<ChaindocContractActivitiesResult>;
    addPaymentSetup(contractId: string, input: ChaindocContractPaymentSetupInput): Promise<unknown>;
    send(contractId: string, input?: ChaindocContractSendInput): Promise<ChaindocContractSendResult>;
    cancel(contractId: string): Promise<unknown>;
    terminate(contractId: string, input?: { reason?: string }): Promise<unknown>;
  };

  invoices: {
    create(contractId: string, input: ChaindocInvoiceCreateInput): Promise<ChaindocInvoiceEnvelope>;
    list(
      contractId: string,
      input?: ChaindocInvoiceListInput,
    ): Promise<ChaindocInvoiceListResult>;
    get(contractId: string, invoiceUuid: string): Promise<{ success?: boolean; invoice: unknown }>;
    send(
      contractId: string,
      invoiceUuid: string,
      input?: { autoCharge?: boolean },
    ): Promise<unknown>;
    charge(contractId: string, invoiceUuid: string): Promise<unknown>;
    markPaid(
      contractId: string,
      invoiceUuid: string,
      input: { note?: string; paidAt?: string | Date },
    ): Promise<unknown>;
  };

  transactions: {
    listByContract(contractId: string, input?: ChaindocPaginationInput): Promise<unknown>;
    get(transactionUuid: string): Promise<{ success?: boolean; transaction: unknown }>;
  };

  templates: {
    createDocument(
      templateId: string,
      input: ChaindocTemplateCreateDocumentInput,
    ): Promise<unknown>;
    sendForSigning(
      templateId: string,
      input: ChaindocTemplateSendForSigningInput,
    ): Promise<unknown>;
    createContract(
      templateId: string,
      input: ChaindocTemplateCreateContractInput,
    ): Promise<unknown>;
  };
}

/**
 * Static surface from the SDK module. We declare a static `webhooks.verify`
 * because the server SDK exposes it on the `Chaindoc` *class*, not on
 * instances. We never instantiate this type — it's loaded at runtime via
 * dynamic import.
 */
export interface ChaindocSdkStatic {
  webhooks: {
    verify(
      rawBody: string,
      signature: string,
      timestamp: string,
      secret: string,
    ): {
      valid: boolean;
      envelope?: { id: string; type: string; createdAt: string; data: Record<string, unknown> };
      reason?: string;
    };
  };
}

// ---------------------------------------------------------------------------
// Domain types — narrow enough to validate, loose enough to evolve.
// ---------------------------------------------------------------------------

export interface ChaindocMediaHandle {
  type: string; // 'document' | 'image' | 'video'
  name?: string;
  key: string;
  url?: string;
  hash?: string;
  size?: number;
  thumbnail?: string | null;
}

export interface ChaindocMetaPair {
  key: string;
  value: string;
}

export interface ChaindocAccessEmail {
  email: string;
  level: "read" | "write";
}

export interface ChaindocAccessRole {
  roleId: number;
  level: "read" | "write";
}

export interface ChaindocDocumentCreateInput {
  name: string;
  description?: string;
  media: ChaindocMediaHandle;
  status?: "draft" | "published";
  hashtags?: string[];
  meta?: ChaindocMetaPair[];
  isForSigning?: boolean;
  accessType?: "private" | "public" | "restricted" | string;
  accessEmails?: ChaindocAccessEmail[];
  accessRoles?: ChaindocAccessRole[];
}

export interface ChaindocDocumentUpdateInput {
  name?: string;
  description?: string;
  media?: ChaindocMediaHandle;
  status?: "draft" | "published";
  hashtags?: string[];
  meta?: ChaindocMetaPair[];
  isForSigning?: boolean;
}

export interface ChaindocDocumentRightsInput {
  accessType: "private" | "public" | "restricted" | string;
  accessEmails?: ChaindocAccessEmail[];
  accessRoles?: ChaindocAccessRole[];
}

export interface ChaindocDocumentEnvelope {
  success?: boolean;
  documentId: string;
  document: {
    id: string;
    txtId?: string;
    accessType?: string;
    currentVersion?: { id: string; name?: string; status?: string; versionHash?: string };
    createdAt?: string;
    updatedAt?: string;
  };
  message?: string;
}

export interface ChaindocVerifyInput {
  versionHash?: string;
  certificateHash?: string;
}

export interface ChaindocVerifyResult {
  success?: boolean;
  verified: boolean;
  document?: { id: string; versionId?: string; name?: string; versionHash?: string; status?: string };
  verification?: {
    id: string;
    txHash?: string;
    chainId?: number | string;
    status: string;
    verifiedAt?: string;
  };
  certificate?: { valid: boolean; hash?: string };
}

export interface ChaindocVerificationStatusResult {
  success?: boolean;
  versionId: string;
  versionHash?: string;
  verified: boolean;
  verification?: ChaindocVerifyResult["verification"];
}

// --- signatures ------------------------------------------------------------

export type ChaindocSigningMethod = "email" | "embedded";

export interface ChaindocSignatureRecipient {
  email: string;
  signingMethod?: ChaindocSigningMethod;
  shareToken?: string;
}

export type ChaindocPlacedFieldType =
  | "signature"
  | "initials"
  | "date_signed"
  | "text"
  | "checkbox";

export interface ChaindocPlacedField {
  signerEmail: string;
  fieldType: ChaindocPlacedFieldType;
  pageIndex: number;
  xPct: number;
  yPct: number;
  wPct: number;
  hPct: number;
  required?: boolean;
  label?: string;
  systemKey?: string;
}

export interface ChaindocSignatureRequestInput {
  versionId: string;
  recipients: ChaindocSignatureRecipient[];
  deadline?: Date | string;
  embeddedFlow?: boolean;
  isKycRequired?: boolean;
  message?: string;
  fields?: ChaindocPlacedField[];
}

export interface ChaindocSignatureRequestEnvelope {
  success?: boolean;
  requestId: string;
  signatureRequest: {
    id: string;
    status: string;
    versionId: string;
    dueDate?: string;
    isKycRequired?: boolean;
    signers: Array<{ id: string; email: string; signedAt?: string | null; hasSigned?: boolean }>;
  };
  message?: string;
}

export interface ChaindocSignatureRequestStatus {
  success?: boolean;
  requestId: string;
  status: string;
  versionId?: string;
  totalSigners: number;
  signedCount: number;
  pendingCount: number;
  isCompleted: boolean;
  dueDate?: string;
  signers: Array<{
    id: string;
    email: string;
    signedAt?: string | null;
    signatureHash?: string;
    hasSigned?: boolean;
  }>;
}

export interface ChaindocSignInput {
  requestId: string;
  signatureId: number;
  messageText?: string;
  meta?: ChaindocMetaPair[];
}

export interface ChaindocSignResult {
  success?: boolean;
  requestId: string;
  signedAt: string;
  message?: string;
}

export interface ChaindocPaginationInput {
  pageNumber?: number;
  pageSize?: number;
}

export interface ChaindocSignatureRequestsPage {
  items: unknown[];
  total: number;
  totalPending?: number;
  totalCompleted?: number;
  totalExpired?: number;
  pageNumber: number;
  pageSize: number;
}

export interface ChaindocSignaturesPage {
  items: unknown[];
  total: number;
  pageNumber: number;
  pageSize: number;
}

// --- embedded --------------------------------------------------------------

export interface ChaindocEmbeddedSessionInput {
  email: string;
  metadata: {
    documentId?: string;
    signatureRequestId?: string;
    contractId?: string;
    returnUrl?: string;
  };
}

export interface ChaindocEmbeddedSession {
  success?: boolean;
  sessionId: string;
  email: string;
  status: string;
  expiresAt: string;
  expiresInMinutes?: number;
  metadata?: ChaindocEmbeddedSessionInput["metadata"];
  message?: string;
  createdAt?: string;
}

// --- contracts -------------------------------------------------------------

export type ChaindocContractStatus =
  | "draft"
  | "pending_signature"
  | "active"
  | "pending_amendment"
  | "suspended"
  | "termination_pending"
  | "terminated"
  | "expired"
  | "rejected";

export type ChaindocPaymentTermType = "one_time" | "recurring" | "deposit";

export type ChaindocPaymentFrequency =
  | "weekly"
  | "biweekly"
  | "monthly"
  | "quarterly"
  | "yearly";

export interface ChaindocPaymentTerm {
  type: ChaindocPaymentTermType;
  name: string;
  amount: string;
  frequency?: ChaindocPaymentFrequency;
  dayOfPeriod?: number;
  dueDate?: string;
  autoCharge?: boolean;
}

export interface ChaindocBillingAddress {
  line1: string;
  line2?: string;
  city: string;
  state?: string;
  postalCode: string;
  country: string;
}

export interface ChaindocContragent {
  email: string;
  name?: string;
  phone?: string;
  taxId?: string;
  billingAddress?: ChaindocBillingAddress;
}

export interface ChaindocContractCreateInput {
  documentId: string;
  title: string;
  description?: string;
  contragent: ChaindocContragent;
  startDate?: string;
  endDate?: string;
  autoRenew?: boolean;
  currencyCode: string;
  terminationType?: "mutual_approval" | "one_side";
  noticePeriodDays?: number;
  paymentTerms?: ChaindocPaymentTerm[];
  paymentMethodRequired?: boolean;
  preferredPaymentMethodType?: "card" | "bank" | string;
  signingPolicy?: { business?: ChaindocSigningMethod; contragent?: ChaindocSigningMethod };
}

export interface ChaindocContractEnvelope {
  success?: boolean;
  contractId: string;
  contract: { id: string; title: string; status: ChaindocContractStatus; [k: string]: unknown };
  message?: string;
}

export interface ChaindocContractListInput {
  page?: number;
  limit?: number;
  status?: ChaindocContractStatus;
  search?: string;
}

export interface ChaindocContractListResult {
  success?: boolean;
  contracts: unknown[];
  pagination: { page: number; limit: number; total: number; totalPages: number };
}

export interface ChaindocContractStatusResult {
  success?: boolean;
  contractId: string;
  status: ChaindocContractStatus;
  signingPolicy?: { business?: ChaindocSigningMethod; contragent?: ChaindocSigningMethod };
  signingStatus?: {
    totalSigners: number;
    signedCount: number;
    pendingCount: number;
    signers: unknown[];
  };
  paymentSummary?: { totalDeposit: string; totalRecurring: string; activeTerms: number };
  timestamps?: Record<string, string>;
}

export interface ChaindocContractActivitiesResult {
  success?: boolean;
  activities: unknown[];
  pagination: { page: number; limit: number; total: number; totalPages: number };
}

export interface ChaindocContractPaymentSetupInput {
  startDate?: string;
  endDate?: string;
  currencyCode?: string;
  paymentMethodRequired?: boolean;
  preferredPaymentMethodType?: string;
  paymentTerms?: ChaindocPaymentTerm[];
}

export interface ChaindocContractSendInput {
  messageToSigners?: string;
  deadline?: string | Date;
  isKycRequired?: boolean;
}

export interface ChaindocContractSendResult {
  success?: boolean;
  contractId: string;
  status: ChaindocContractStatus;
  signingRequestId?: string;
  message?: string;
}

// --- invoices --------------------------------------------------------------

export interface ChaindocInvoiceLineItem {
  description: string;
  quantity: number;
  unitPrice: string;
}

export interface ChaindocInvoiceCreateInput {
  title: string;
  description?: string;
  amount: string;
  currencyCode: string;
  dueDate: string;
  lineItems?: ChaindocInvoiceLineItem[];
  sendImmediately?: boolean;
  autoCharge?: boolean;
}

export interface ChaindocInvoiceEnvelope {
  success?: boolean;
  invoiceId: string;
  invoice: { id: string; status: string; [k: string]: unknown };
  message?: string;
}

export interface ChaindocInvoiceListInput {
  page?: number;
  limit?: number;
  status?:
    | "draft"
    | "pending"
    | "unpaid"
    | "paid"
    | "partially_paid"
    | "overdue"
    | "cancelled"
    | "refunded";
}

export interface ChaindocInvoiceListResult {
  success?: boolean;
  invoices: unknown[];
  pagination: { page: number; limit: number; total: number; totalPages: number };
}

// --- templates -------------------------------------------------------------

export interface ChaindocTemplateCreateDocumentInput {
  documentName: string;
  documentDescription?: string;
  variables: Record<string, string | number | boolean>;
}

export interface ChaindocTemplateSlotAssignment {
  signerKey: string;
  email?: string;
  role?: "business" | "contragent";
  signingMethod?: ChaindocSigningMethod;
  signerVariables?: Record<string, string | number | boolean>;
}

export interface ChaindocTemplateSendForSigningInput {
  documentName: string;
  variables: Record<string, string | number | boolean>;
  slotAssignments: ChaindocTemplateSlotAssignment[];
  message?: string;
  deadline?: string | Date;
  isKycRequired?: boolean;
}

export interface ChaindocTemplateCreateContractInput {
  variables: Record<string, string | number | boolean>;
  slotAssignments: ChaindocTemplateSlotAssignment[];
  title: string;
  description?: string;
  contragent: ChaindocContragent;
  startDate?: string;
  endDate?: string;
  currencyCode: string;
  terminationType?: "mutual_approval" | "one_side";
  noticePeriodDays?: number;
  paymentTerms?: ChaindocPaymentTerm[];
  messageToSigners?: string;
  deadline?: string | Date;
  isKycRequired?: boolean;
}

// ---------------------------------------------------------------------------
// Client wrapper
// ---------------------------------------------------------------------------

export interface ChaindocClientOptions {
  apiKey: string;
  environment?: "production" | "staging" | "development";
  logger: Logger;
  maxRps?: number;
  timeout?: number;
  retry?: { maxRetries?: number; baseDelayMs?: number; maxDelayMs?: number };
}

/**
 * Wraps the Chaindoc SDK with a token-bucket throttle and a circuit
 * breaker, plus exposes the static `webhooks.verify` helper.
 */
export class ChaindocClient {
  readonly config: Omit<ChaindocClientOptions, "logger"> & { logger: Logger };
  private readonly bucket: TokenBucket;
  private readonly breaker: CircuitBreaker;
  private modPromise: Promise<{ instance: ChaindocSdkLike; staticApi: ChaindocSdkStatic }> | null =
    null;

  constructor(opts: ChaindocClientOptions) {
    this.config = {
      apiKey: opts.apiKey,
      environment: opts.environment ?? "production",
      maxRps: opts.maxRps ?? 10 / 60, // Chaindoc is 10 / 60s; default to that
      logger: opts.logger,
      ...(opts.timeout !== undefined && { timeout: opts.timeout }),
      ...(opts.retry !== undefined && { retry: opts.retry }),
    };
    // Keep at least 1 token of burst capacity.
    const ratePerSecond = this.config.maxRps ?? 10 / 60;
    this.bucket = new TokenBucket(ratePerSecond, Math.max(1, Math.ceil(ratePerSecond)));
    this.breaker = new CircuitBreaker();
  }

  private async load(): Promise<{ instance: ChaindocSdkLike; staticApi: ChaindocSdkStatic }> {
    if (!this.modPromise) {
      this.modPromise = (async () => {
        // eslint-disable-next-line @typescript-eslint/ban-ts-comment
        // @ts-ignore — provided at runtime via npm install
        const mod: {
          Chaindoc: (new (opts: {
            secretKey: string;
            environment?: string;
            timeout?: number;
            retry?: { maxRetries?: number; baseDelayMs?: number; maxDelayMs?: number };
          }) => ChaindocSdkLike) &
            ChaindocSdkStatic;
        } = await import("@chaindoc_io/server-sdk");
        const init: {
          secretKey: string;
          environment?: string;
          timeout?: number;
          retry?: { maxRetries?: number; baseDelayMs?: number; maxDelayMs?: number };
        } = { secretKey: this.config.apiKey };
        if (this.config.environment) init.environment = this.config.environment;
        if (this.config.timeout !== undefined) init.timeout = this.config.timeout;
        if (this.config.retry !== undefined) init.retry = this.config.retry;
        const instance = new mod.Chaindoc(init);
        return { instance, staticApi: { webhooks: mod.Chaindoc.webhooks } };
      })();
    }
    return this.modPromise;
  }

  /**
   * Run a function against the SDK instance. Applies rate limiting +
   * circuit breaker + log timings.
   */
  async run<T>(name: string, fn: (sdk: ChaindocSdkLike) => Promise<T>): Promise<T> {
    this.breaker.beforeCall();
    await this.bucket.acquire();
    const start = Date.now();
    const { instance } = await this.load();
    try {
      const result = await fn(instance);
      this.breaker.onSuccess();
      this.config.logger.debug({ tool: name, durationMs: Date.now() - start, status: "ok" });
      return result;
    } catch (err) {
      const status =
        (err as { statusCode?: number; status?: number }).statusCode ??
        (err as { status?: number }).status;
      this.breaker.onFailure(status);
      this.config.logger.warn(
        { tool: name, durationMs: Date.now() - start, status: "error", httpStatus: status },
        "Chaindoc API call failed",
      );
      throw err;
    }
  }

  /** Access the static webhook verifier. No rate limiting (it's local). */
  async staticApi(): Promise<ChaindocSdkStatic> {
    const { staticApi } = await this.load();
    return staticApi;
  }
}
