import { describe, it, expect, vi } from "vitest";
import {
  processesList,
  processesGetEntry,
  processesStart,
  processesGetCase,
  processesGetEvents,
  processesRespond,
  processesTools,
} from "../../src/tools/processes.js";
import { toChaindocMcpError } from "../../src/core/errors.js";
import { fakeClient, fakeDownloads, fakeLogger } from "./_fakes.js";

const U1 = "00000000-0000-0000-0000-000000000001";
const U2 = "00000000-0000-0000-0000-000000000002";
const U3 = "00000000-0000-0000-0000-000000000003";

const ctx = (processes: Record<string, unknown>, integrationSecrets?: Record<string, string>) => ({
  client: fakeClient({ processes: processes as never }),
  logger: fakeLogger(),
  downloads: fakeDownloads(),
  ...(integrationSecrets !== undefined && { integrationSecrets }),
});

describe("processes tools", () => {
  it("there are six agent tools", () => {
    expect(processesTools.map((t) => t.name)).toEqual([
      "chaindoc_processes_list",
      "chaindoc_processes_get_entry",
      "chaindoc_processes_start",
      "chaindoc_processes_get_case",
      "chaindoc_processes_get_events",
      "chaindoc_processes_respond",
    ]);
  });

  it("discover: list then entry schema", async () => {
    const list = vi.fn().mockResolvedValue({ processes: [{ processKey: "onboarding", name: "Onboarding" }] });
    const getEntry = vi.fn().mockResolvedValue({ versionUuid: U1 });
    await processesList.handler({}, ctx({ list }));
    await processesGetEntry.handler(processesGetEntry.inputSchema.parse({ processKey: "onboarding", entryKey: "api" }), ctx({ getEntry }));
    expect(getEntry).toHaveBeenCalledWith("onboarding", "api");
  });

  it("start sends the externalId, pinned version, input and subjects", async () => {
    const start = vi.fn().mockResolvedValue({ caseUuid: U2, lifecycle: "running", replayed: false });
    const args = processesStart.inputSchema.parse({
      processKey: "onboarding",
      entryKey: "api",
      externalId: "order-1",
      expectedVersionUuid: U1,
      input: { amount: "10.00" },
      subjects: [{ fieldId: "agreement", objectKind: "contract", uuid: U3 }],
    });
    const out = await processesStart.handler(args, ctx({ start }));
    expect(out).toMatchObject({ caseUuid: U2 });
    expect(start).toHaveBeenCalledWith("onboarding", "api", {
      externalId: "order-1",
      expectedVersionUuid: U1,
      input: { amount: "10.00" },
      subjects: [{ fieldId: "agreement", objectKind: "contract", uuid: U3 }],
    });
  });

  it("start refuses a call without externalId or the pinned version", () => {
    expect(() => processesStart.inputSchema.parse({ processKey: "p", entryKey: "e", expectedVersionUuid: U1 })).toThrow();
    expect(() => processesStart.inputSchema.parse({ processKey: "p", entryKey: "e", externalId: "x" })).toThrow();
  });

  it("start: a refused start keeps the server's errorKey and a hint", () => {
    const err = Object.assign(new Error("Entry moved"), { statusCode: 409, errorKey: "PROCESS_VERSION_MOVED" });
    const mapped = toChaindocMcpError(err);
    expect(mapped.errorKey).toBe("PROCESS_VERSION_MOVED");
    expect(mapped.hint).toContain("chaindoc_processes_get_entry");
  });

  it("status reads the case", async () => {
    const getCase = vi.fn().mockResolvedValue({ caseUuid: U2, status: "running" });
    await processesGetCase.handler({ caseUuid: U2 }, ctx({ getCase }));
    expect(getCase).toHaveBeenCalledWith(U2);
  });

  it("events: one page, cursor passed on, no auto paging", async () => {
    const getEvents = vi.fn().mockResolvedValue({ events: [], hasMore: true, nextAfter: U3 });
    const args = processesGetEvents.inputSchema.parse({ caseUuid: U2, afterEventUuid: U3, limit: 10 });
    await processesGetEvents.handler(args, ctx({ getEvents }));
    expect(getEvents).toHaveBeenCalledTimes(1);
    expect(getEvents).toHaveBeenCalledWith(U2, { afterEventUuid: U3, limit: 10 });
  });

  const reply = { integrationUuid: U1, attemptNumber: 1, deliveryUuid: U2, stepUuid: U3, resultCode: "approved", sourceEventId: "evt-1" };

  it("respond signs with the operator's secret, which is never a tool argument", async () => {
    const respond = vi.fn().mockResolvedValue({ accepted: true, duplicate: false });
    await processesRespond.handler(processesRespond.inputSchema.parse(reply), ctx({ respond }, { [U1]: "whsec_operator" }));
    expect(respond).toHaveBeenCalledWith(
      U1,
      { attemptNumber: 1, deliveryUuid: U2, stepUuid: U3, resultCode: "approved", sourceEventId: "evt-1" },
      "whsec_operator",
    );
    expect(JSON.stringify(processesRespond.inputSchema.parse(reply))).not.toContain("secret");
    expect(() => processesRespond.inputSchema.parse({ ...reply, secret: "x" })).not.toThrow(); // unknown keys are stripped, never read
  });

  it("respond is unavailable (not a fake success) without a configured secret", async () => {
    const respond = vi.fn();
    const rejection = processesRespond.handler(processesRespond.inputSchema.parse(reply), ctx({ respond }));
    await expect(rejection).rejects.toMatchObject({ name: "UnavailableError" });
    expect(respond).not.toHaveBeenCalled();
    const mapped = toChaindocMcpError(await rejection.catch((e) => e));
    expect(mapped.code).toBe("unavailable");
    expect(mapped.hint).toContain("CHAINDOC_PROCESS_INTEGRATION_SECRETS");
  });
});
