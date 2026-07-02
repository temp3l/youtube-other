import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { hashText, normalizeWhitespace } from "@mediaforge/shared";
import {
  prepareSpokenNarration,
  prepareSpokenNarrationText,
} from "./spoken-narration.js";

async function createEpisode(script: string): Promise<{
  readonly root: string;
  readonly episodeDir: string;
  readonly scriptPath: string;
}> {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "mediaforge-spoken-"));
  const episodeDir = path.join(root, "009-mary-gloria-the-christmas-doll");
  const scriptPath = path.join(episodeDir, "es", "full", "script.md");
  await fs.mkdir(path.dirname(scriptPath), { recursive: true });
  await fs.writeFile(scriptPath, script, "utf8");
  return { root, episodeDir, scriptPath };
}

describe("spoken narration preparation", () => {
  it("writes deterministic spoken artifacts without overwriting canonical source", async () => {
    const source = [
      "# Narration Script",
      "",
      "**Mary Gloria** heard the attic door click.",
      "",
      "- Then she counted every step above her room.",
    ].join("\n");
    const { episodeDir, scriptPath } = await createEpisode(source);
    const before = await fs.readFile(scriptPath, "utf8");

    const first = await prepareSpokenNarration({
      episodeDir,
      language: "es",
      variant: "full",
      createdAt: "2026-01-02T03:04:05.000Z",
      runId: "run-001",
    });
    const second = await prepareSpokenNarration({
      episodeDir,
      language: "es",
      variant: "full",
      createdAt: "2026-01-02T03:04:05.000Z",
      runId: "run-001",
    });

    expect(first.success).toBe(true);
    expect(second.success).toBe(true);
    expect(await fs.readFile(scriptPath, "utf8")).toBe(before);
    expect(first.spokenText).toBe(
      "Mary Gloria heard the attic door click.\n\nThen she counted every step above her room."
    );
    expect(first.artifact).toEqual(second.artifact);
    expect(await fs.readFile(first.paths.spokenTextMarkdown, "utf8")).toBe(
      `${first.spokenText}\n`
    );
    expect(JSON.parse(await fs.readFile(first.paths.spokenTextJson, "utf8"))).toEqual(
      first.artifact
    );
    expect(first.artifact.sourceHash).toBe(
      hashText(
        normalizeWhitespace(
          "**Mary Gloria** heard the attic door click.\n\n- Then she counted every step above her room."
        )
      )
    );
    expect(first.artifact.parentFingerprints).toEqual([first.artifact.sourceHash]);
  });

  it("does not call the adapter unless adapted mode is explicitly enabled", async () => {
    const { episodeDir } = await createEpisode("Mary kept listening.");
    let calls = 0;
    const adapter = {
      enabled: true,
      async adapt() {
        calls += 1;
        return { text: "Changed text." };
      },
    };

    await prepareSpokenNarration({
      episodeDir,
      language: "es",
      adapter,
      createdAt: "2026-01-02T03:04:05.000Z",
    });
    expect(calls).toBe(0);

    const adapted = await prepareSpokenNarration({
      episodeDir,
      language: "es",
      mode: "adapted",
      adapter,
      createdAt: "2026-01-02T03:04:05.000Z",
    });
    expect(calls).toBe(1);
    expect(adapted.spokenText).toBe("Changed text.");
    expect(adapted.artifact.preparationMode).toBe("adapted");
  });

  it("warns on hook and word-count drift without logging full narration text", async () => {
    const { episodeDir } = await createEpisode(
      "Mary Gloria opened the door and found the empty attic waiting."
    );
    const logs: Array<Record<string, unknown>> = [];
    const result = await prepareSpokenNarration({
      episodeDir,
      language: "es",
      mode: "adapted",
      adapter: {
        enabled: true,
        async adapt() {
          return { text: "A different opening." };
        },
      },
      logger: {
        info(value) {
          logs.push(value);
        },
      },
      createdAt: "2026-01-02T03:04:05.000Z",
    });

    expect(result.success).toBe(true);
    expect(result.warnings.map((warning) => warning.code)).toEqual([
      "WORD_COUNT_DRIFT",
      "HOOK_DRIFT",
    ]);
    expect(JSON.stringify(logs)).not.toContain("empty attic waiting");
    expect(logs[0]).toMatchObject({
      episodeId: "009-mary-gloria-the-christmas-doll",
      language: "es",
      variant: "full",
      sourceHash: result.sourceHash,
      outputHash: result.spokenTextHash,
    });
  });

  it("returns and persists failed metadata for empty prepared text", async () => {
    const { episodeDir } = await createEpisode("   \n\n  ");
    const result = await prepareSpokenNarration({
      episodeDir,
      language: "es",
      createdAt: "2026-01-02T03:04:05.000Z",
    });

    expect(result.success).toBe(false);
    expect(result.artifact.status).toBe("failed");
    expect(result.artifact.failureMessage).toContain("empty");
    await expect(fs.readFile(result.paths.spokenTextMarkdown, "utf8")).rejects.toThrow();
    expect(JSON.parse(await fs.readFile(result.paths.spokenTextJson, "utf8"))).toEqual(
      result.artifact
    );
  });

  it("normalizes markdown deterministically", () => {
    expect(
      prepareSpokenNarrationText("## Title\n\n1. **First** line\nsecond line")
    ).toBe("Title\n\nFirst line second line");
  });
});
