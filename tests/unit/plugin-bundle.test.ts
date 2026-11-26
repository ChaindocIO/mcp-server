import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { inflateRawSync } from "node:zlib";

/**
 * `chaindoc.plugin` is what a person installs (README: "Install the bundled plugin"). It was a zip of plugin 0.1.2 from
 * May 2026 — skills that knew nothing of text documents, chips or the money rules — while `chaindoc-claude/` moved on to
 * 0.3.0. The bundle must carry exactly the folder's files.
 */
function readZip(buf: Buffer): Map<string, Buffer> {
  const out = new Map<string, Buffer>();
  let at = 0;
  while (at + 30 <= buf.length && buf.readUInt32LE(at) === 0x04034b50) {
    const method = buf.readUInt16LE(at + 8);
    const size = buf.readUInt32LE(at + 18);
    const nameLength = buf.readUInt16LE(at + 26);
    const extraLength = buf.readUInt16LE(at + 28);
    const name = buf.subarray(at + 30, at + 30 + nameLength).toString("utf8");
    const start = at + 30 + nameLength + extraLength;
    const data = buf.subarray(start, start + size);
    if (!name.endsWith("/")) out.set(name, method === 8 ? inflateRawSync(data) : Buffer.from(data));
    at = start + size;
  }
  return out;
}

function filesUnder(dir: string): string[] {
  return readdirSync(dir).flatMap((entry) => {
    const path = join(dir, entry);
    return statSync(path).isDirectory() ? filesUnder(path) : [path];
  });
}

describe("the bundled plugin is the plugin folder", () => {
  const root = join(__dirname, "../..");
  const folder = join(root, "chaindoc-claude");
  const bundle = readZip(readFileSync(join(root, "chaindoc.plugin")));

  it("holds every file of chaindoc-claude/, byte for byte, and nothing else", () => {
    const files = filesUnder(folder).map((p) => relative(folder, p)).sort();
    expect([...bundle.keys()].sort()).toEqual(files);
    for (const file of files) {
      expect(bundle.get(file)?.equals(readFileSync(join(folder, file))), file).toBe(true);
    }
  });
});
