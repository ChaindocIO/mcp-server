/**
 * Token-bucket rate limiter, used to cap how fast we hit the Chaindoc API
 * even when an agent is in a tight loop.
 *
 * The Chaindoc SDK already does retries with exponential backoff for 429s,
 * but client-side throttling avoids burning quota in the first place.
 */
export class TokenBucket {
  private tokens: number;
  private readonly capacity: number;
  private readonly refillPerMs: number;
  private lastRefill: number;

  constructor(ratePerSecond: number, capacity: number = ratePerSecond) {
    this.capacity = capacity;
    this.tokens = capacity;
    this.refillPerMs = ratePerSecond / 1000;
    this.lastRefill = Date.now();
  }

  private refill(): void {
    const now = Date.now();
    const elapsed = now - this.lastRefill;
    this.tokens = Math.min(this.capacity, this.tokens + elapsed * this.refillPerMs);
    this.lastRefill = now;
  }

  /** Wait until a token is available, then consume it. */
  async acquire(): Promise<void> {
    while (true) {
      this.refill();
      if (this.tokens >= 1) {
        this.tokens -= 1;
        return;
      }
      const needed = 1 - this.tokens;
      const waitMs = Math.ceil(needed / this.refillPerMs);
      await new Promise((r) => setTimeout(r, waitMs));
    }
  }
}

/**
 * Minimal circuit breaker. After `threshold` consecutive failures it opens
 * and short-circuits calls for `cooldownMs`.
 */
export class CircuitBreaker {
  private failures = 0;
  private openedAt: number | null = null;

  constructor(
    private readonly threshold: number = 3,
    private readonly cooldownMs: number = 30_000,
  ) {}

  beforeCall(): void {
    if (this.openedAt === null) return;
    const elapsed = Date.now() - this.openedAt;
    if (elapsed < this.cooldownMs) {
      throw Object.assign(new Error("Circuit breaker open — Chaindoc API recently failing"), {
        status: 503,
      });
    }
    // half-open: let one through
    this.openedAt = null;
    this.failures = 0;
  }

  onSuccess(): void {
    this.failures = 0;
    this.openedAt = null;
  }

  onFailure(httpStatus?: number): void {
    if (httpStatus !== undefined && httpStatus < 500) return; // only 5xx counts
    this.failures += 1;
    if (this.failures >= this.threshold) {
      this.openedAt = Date.now();
    }
  }
}
