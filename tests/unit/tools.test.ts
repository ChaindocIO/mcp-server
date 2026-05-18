import { describe, it, expect } from "vitest";
import { z } from "zod";
import { allTools } from "../../src/tools/index.js";

describe("tool catalog health", () => {
  it("every tool has a unique name", () => {
    const names = allTools.map((t) => t.name);
    const unique = new Set(names);
    expect(unique.size).toBe(names.length);
  });

  it("every tool has a non-trivial description", () => {
    for (const t of allTools) {
      expect(t.description, `${t.name} description`).toBeTruthy();
      expect(t.description.length, `${t.name} description length`).toBeGreaterThanOrEqual(40);
    }
  });

  it("every tool input schema is a Zod type", () => {
    for (const t of allTools) {
      expect(t.inputSchema, `${t.name} inputSchema`).toBeInstanceOf(z.ZodType);
    }
  });

  it("every tool name follows the chaindoc_ prefix", () => {
    for (const t of allTools) {
      expect(t.name).toMatch(/^chaindoc_[a-z][a-z0-9_]*$/);
    }
  });

  it("catalog size matches the v0.2.0 surface", () => {
    // 35 existing + 67 new SDK wrappers + 1 verification helper = 103 tools.
    expect(allTools.length).toBe(103);
  });
});
