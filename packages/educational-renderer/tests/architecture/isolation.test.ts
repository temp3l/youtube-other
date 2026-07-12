import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
async function sourceFiles(directory: string): Promise<string[]> { const output: string[] = []; for (const entry of await fs.readdir(directory, { withFileTypes: true })) { const item = path.join(directory, entry.name); if (entry.isDirectory()) output.push(...await sourceFiles(item)); else if (entry.name.endsWith(".ts")) output.push(item); } return output; }
describe("package isolation", () => {
  it("does not import Mediaforge packages or escape its package root", async () => {
    for (const file of await sourceFiles(path.join(root, "src"))) { const source = await fs.readFile(file, "utf8"); expect(source, file).not.toMatch(/from\s+["']@mediaforge\//u); expect(source, file).not.toMatch(/from\s+["'](?:\.\.\/){4,}/u); }
  });
  it("is not imported by an existing application or package", async () => {
    const repository = path.resolve(root, "../.."); const candidates = [path.join(repository, "apps"), path.join(repository, "packages")]; const offenders: string[] = [];
    for (const directory of candidates) for (const file of await sourceFiles(directory)) { if (file.startsWith(root)) continue; if ((await fs.readFile(file, "utf8")).includes("@mediaforge/educational-renderer")) offenders.push(file); }
    expect(offenders).toEqual([]);
  });
});
