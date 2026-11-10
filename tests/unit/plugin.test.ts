import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { allTools } from "../../src/tools/index.js";

const root = join(__dirname, "../..");
const pkg = JSON.parse(readFileSync(join(root, "package.json"), "utf8")) as { version: string };
const plugin = JSON.parse(readFileSync(join(root, "chaindoc-claude/.claude-plugin/plugin.json"), "utf8")) as { version: string };
const skillsDir = join(root, "chaindoc-claude/skills");
const skills = readdirSync(skillsDir).map((d) => ({
  name: d,
  text: readFileSync(join(skillsDir, d, "SKILL.md"), "utf8"),
}));

describe("the Claude plugin", () => {
  it("plugin and server versions agree", () => {
    expect(plugin.version).toBe(pkg.version);
    expect(pkg.version).toBe("0.3.0");
  });

  it("every tool a skill names exists", () => {
    const names = new Set(allTools.map((t) => t.name));
    for (const s of skills) {
      for (const m of s.text.matchAll(/chaindoc_[a-z][a-z0-9_]*(?![a-z0-9_*])/g)) {
        expect(names.has(m[0]), `${s.name} names ${m[0]}`).toBe(true);
      }
    }
  });

  it("no skill teaches previews, the old template format or links outside a workspace", () => {
    for (const s of skills) {
      expect(s.text, s.name).not.toMatch(/preview_(pdf|html|unsaved)|Tiptap|contentJson/);
      expect(s.text, s.name).not.toContain("app.chaindoc.io/documents/");
    }
  });

  it("the usage guide teaches the money rules and read-only bank details", () => {
    const g = skills.find((s) => s.name === "chaindoc-usage-guide")!.text;
    expect(g).toContain("confirm=true");
    expect(g).toMatch(/READ ONLY/);
    expect(g).toContain("/w/{workspaceUuid}");
    expect(g).toContain("INTEGRATIONS_NOT_IN_PLAN");
    expect(g).toContain("chaindoc_conversions_wait");
  });
});
