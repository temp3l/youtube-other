import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { createHistoryReviewBundleV31 } from "./history-review-bundle-v31.js";

const roots: string[] = [];
afterEach(async () => {
  await Promise.all(
    roots.splice(0).map((root) => fs.rm(root, { recursive: true, force: true }))
  );
});

describe("History V3.1 review bundle", () => {
  it("exports the complete redacted checksum-valid manifest without media", async () => {
    const outputRoot = await fs.mkdtemp(
      path.join(os.tmpdir(), "v31-episodes-")
    );
    const output = await fs.mkdtemp(path.join(os.tmpdir(), "v31-review-"));
    roots.push(outputRoot, output);
    const episodeId = "history-bundle-v31";
    const episode = path.join(outputRoot, episodeId);
    await fs.mkdir(path.join(episode, "languages"), { recursive: true });
    await fs.mkdir(path.join(episode, "source"), { recursive: true });
    await fs.writeFile(
      path.join(episode, "languages", "script-en.md"),
      "In October 1347 ships moved from the Black Sea to Messina in Sicily. The Black Death spread across Europe because trade routes connected ports. Yersinia pestis caused plague. Mortality reduced labour supply in England."
    );
    await fs.writeFile(
      path.join(episode, "source", "normalized-metadata.json"),
      JSON.stringify({
        originalFrontmatter: { title: "Bundle fixture" },
        runtime: { targetDurationMinutes: 1 },
        secretToken: "must-not-survive",
        localPath: outputRoot,
      })
    );
    await fs.writeFile(
      path.join(episode, "source", "research-sources.json"),
      JSON.stringify({
        sources: [{ id: "source-1", title: "Candidate", status: "declared" }],
      })
    );
    const result = await createHistoryReviewBundleV31({
      episodeId,
      output,
      outputRoot,
      regenerate: true,
      testSummary: "Focused tests: pass.\n",
    });
    const names = (await fs.readdir(result.directory)).sort();
    expect(names).toEqual(
      expect.arrayContaining([
        "README.md",
        "manifest.json",
        "checksums.sha256",
        "artifact-lint.json",
        "rejected-entities.json",
        "map-masters.json",
        "diagram-masters.json",
        "self-review.md",
        "test-summary.md",
      ])
    );
    expect(
      names.some((name) => /\.(?:png|jpe?g|webp|mp3|wav|mp4)$/iu.test(name))
    ).toBe(false);
    const metadata = await fs.readFile(
      path.join(result.directory, "episode-metadata.json"),
      "utf8"
    );
    expect(metadata).not.toContain("must-not-survive");
    expect(metadata).not.toContain(outputRoot);
    const generationCommand = await fs.readFile(
      path.join(result.directory, "generation-command.txt"),
      "utf8"
    );
    expect(generationCommand).not.toContain(outputRoot);
    expect(generationCommand).not.toContain(output);
    expect(generationCommand).toContain("--output ./review-output");
    const manifest = JSON.parse(
      await fs.readFile(path.join(result.directory, "manifest.json"), "utf8")
    ) as {
      files: string[];
      semanticLintValid: boolean;
      approvalEligible: boolean;
    };
    expect(manifest.files.sort()).toEqual(names);
    expect(manifest.semanticLintValid).toBe(true);
    expect(manifest.approvalEligible).toBe(false);
    expect(
      await fs.readFile(path.join(result.directory, "checksums.sha256"), "utf8")
    ).toContain("artifact-lint.json");
    expect((await fs.stat(result.zipPath)).size).toBeGreaterThan(0);
  });
});
