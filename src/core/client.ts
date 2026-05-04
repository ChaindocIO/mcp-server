import type { Chaindoc, ChaindocConfig } from "@chaindoc_io/server-sdk";
import type { Logger } from "./logger.js";
import { CircuitBreaker, TokenBucket } from "./rate-limit.js";

/**
 * Public surface of a `Chaindoc` SDK instance, narrowed to the namespaces
 * the MCP tools call. The shape is sourced from the SDK directly so that
 * any breaking change in `@chaindoc_io/server-sdk` becomes a compile error
 * here, not a runtime surprise.
 */
export interface ChaindocSdkLike {
  documents: Chaindoc["documents"];
  signatures: Chaindoc["signatures"];
  embedded: Chaindoc["embedded"];
  contracts: Chaindoc["contracts"];
  invoices: Chaindoc["invoices"];
  transactions: Chaindoc["transactions"];
  templates: Chaindoc["templates"];
  media: Chaindoc["media"];
  getApiKeyInfo: Chaindoc["getApiKeyInfo"];
  healthCheck: Chaindoc["healthCheck"];
}

/**
 * Static surface from the SDK module. The webhook verifier lives on the
 * `Chaindoc` *class*, not on instances, so we expose it separately and
 * never instantiate this type — it's a re-export of the static side.
 */
export type ChaindocSdkStatic = Pick<typeof Chaindoc, "webhooks">;

export interface ChaindocClientOptions {
  apiKey: string;
  environment?: ChaindocConfig["environment"];
  logger: Logger;
  maxRps?: number;
  timeout?: number;
  retry?: ChaindocConfig["retry"];
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
    const ratePerSecond = this.config.maxRps ?? 10 / 60;
    this.bucket = new TokenBucket(ratePerSecond, Math.max(1, Math.ceil(ratePerSecond)));
    this.breaker = new CircuitBreaker();
  }

  private async load(): Promise<{ instance: ChaindocSdkLike; staticApi: ChaindocSdkStatic }> {
    if (!this.modPromise) {
      this.modPromise = (async () => {
        const mod = await import("@chaindoc_io/server-sdk");
        const init: ChaindocConfig = { secretKey: this.config.apiKey };
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
