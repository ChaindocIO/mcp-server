import { describe, expect, it } from "vitest";
import { HostedConfigError, readHostedCredentials } from "../../src/transports/auth.js";

const b64 = (o: unknown) => Buffer.from(JSON.stringify(o)).toString("base64");

describe("hosted credentials", () => {
  it("prefers the Bearer header over ?config", () => {
    const c = readHostedCredentials("Bearer sk_header", b64({ chaindocApiKey: "sk_cfg" }));
    expect(c).toEqual({ apiKey: "sk_header" });
  });

  it("reads Smithery's ?config", () => {
    const c = readHostedCredentials(undefined, b64({ chaindocApiKey: "sk_cfg", chaindocEnvironment: "staging" }));
    expect(c).toEqual({ apiKey: "sk_cfg", environment: "staging" });
  });

  it("returns nothing when neither is given (the server key decides)", () => {
    expect(readHostedCredentials(undefined, undefined)).toEqual({});
  });

  it("refuses a config it cannot read instead of ignoring it", () => {
    expect(() => readHostedCredentials(undefined, "%%%not-json")).toThrow(HostedConfigError);
    expect(() => readHostedCredentials(undefined, ["a", "b"])).toThrow(HostedConfigError);
    expect(() => readHostedCredentials(undefined, b64({ chaindocEnvironment: "moon" }))).toThrow(HostedConfigError);
  });
});
