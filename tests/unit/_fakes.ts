import { vi } from "vitest";
import type { Logger } from "pino";
import type { ChaindocClient, ChaindocSdkLike } from "../../src/core/client.js";
import type { DownloadAdapterConfig } from "../../src/core/downloads.js";

export function fakeLogger(): Logger {
  const noop = () => undefined;
  return {
    debug: noop,
    info: noop,
    warn: noop,
    error: noop,
    fatal: noop,
    trace: noop,
    child: () => fakeLogger(),
  } as unknown as Logger;
}

export function fakeDownloads(over: Partial<DownloadAdapterConfig> = {}): DownloadAdapterConfig {
  return {
    mode: "disk",
    dir: "/tmp/chaindoc-mcp-test",
    inlineMaxBytes: 4 * 1024 * 1024,
    ...over,
  };
}

export function fakeClient(sdk: Partial<ChaindocSdkLike>): ChaindocClient {
  return {
    config: {
      apiKey: "sk_test",
      environment: "staging",
      maxRps: 0.166,
      logger: fakeLogger(),
    },
    run: async (_name: string, fn: (sdk: ChaindocSdkLike) => unknown) => fn(sdk as ChaindocSdkLike),
    staticApi: async () => ({ webhooks: { verify: vi.fn(), parse: vi.fn() } }),
  } as unknown as ChaindocClient;
}
