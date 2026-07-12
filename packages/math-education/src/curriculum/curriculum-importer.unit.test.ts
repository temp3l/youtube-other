import fs from "node:fs/promises";
import { describe, expect, it } from "vitest";
import { importCurriculumSeed, readCurriculumSeed } from "./importer.js";

describe("curriculum importer", () => {
  it("imports the approved seed with exact grade counts", async () => {
    const markdown = await fs.readFile(
      "docs/mathe/curriculum/03-machine-readable-seed.md",
      "utf8"
    );
    const result = importCurriculumSeed(markdown);
    expect(result.skills).toHaveLength(206);
    expect(
      result.skills.filter((skill) => skill.canonicalGrade === 5)
    ).toHaveLength(37);
    expect(result.releaseHash).toMatch(/^[a-f0-9]{64}$/u);
  });

  it("rejects ambiguous markdown", () => {
    expect(() =>
      readCurriculumSeed("```json\n{}\n```\n```json\n{}\n```")
    ).toThrow(/exactly one/u);
  });
});
