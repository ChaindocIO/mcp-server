import { describe, it, expect, vi } from "vitest";
import { webhooksParse } from "../../src/tools/webhooks.js";
import { fakeClient, fakeDownloads, fakeLogger } from "./_fakes.js";

describe("webhooks_parse", () => {
  it("calls Chaindoc.webhooks.parse on rawBody", async () => {
    const parse = vi.fn().mockReturnValue({
      id: "evt_1",
      type: "doc.created",
      createdAt: "2026-01-01T00:00:00Z",
      data: {},
    });
    const client = fakeClient({});
    (
      client as unknown as {
        staticApi: () => Promise<{
          webhooks: { verify: ReturnType<typeof vi.fn>; parse: typeof parse };
        }>;
      }
    ).staticApi = async () => ({ webhooks: { verify: vi.fn(), parse } });
    const args = webhooksParse.inputSchema.parse({ rawBody: '{"id":"evt_1"}' });
    const r = await webhooksParse.handler(args, {
      client,
      logger: fakeLogger(),
      downloads: fakeDownloads(),
    });
    expect(parse).toHaveBeenCalledWith('{"id":"evt_1"}');
    expect((r as { id: string }).id).toBe("evt_1");
  });
});
