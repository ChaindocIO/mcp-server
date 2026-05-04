import { describe, expect, it } from "vitest";
import { CircuitBreaker, TokenBucket } from "../../src/core/rate-limit.js";

describe("TokenBucket", () => {
  it("allows immediate calls up to capacity", async () => {
    const b = new TokenBucket(100);
    const start = Date.now();
    for (let i = 0; i < 5; i++) await b.acquire();
    expect(Date.now() - start).toBeLessThan(20);
  });

  it("throttles when bursting past capacity", async () => {
    const b = new TokenBucket(50, 1); // 1 token capacity, refill 50/s
    const start = Date.now();
    await b.acquire();
    await b.acquire();
    expect(Date.now() - start).toBeGreaterThanOrEqual(15);
  });
});

describe("CircuitBreaker", () => {
  it("opens after threshold consecutive 5xx", () => {
    const cb = new CircuitBreaker(2, 1000);
    cb.beforeCall();
    cb.onFailure(503);
    cb.onFailure(500);
    expect(() => cb.beforeCall()).toThrow(/open/);
  });

  it("ignores 4xx for tripping", () => {
    const cb = new CircuitBreaker(2, 1000);
    cb.onFailure(429);
    cb.onFailure(404);
    expect(() => cb.beforeCall()).not.toThrow();
  });

  it("half-opens after cooldown", async () => {
    const cb = new CircuitBreaker(1, 10);
    cb.onFailure(500);
    expect(() => cb.beforeCall()).toThrow();
    await new Promise((r) => setTimeout(r, 15));
    expect(() => cb.beforeCall()).not.toThrow();
  });
});
