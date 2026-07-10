import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { hashText } from "@mediaforge/shared";
import { NarrationPipeline } from "./narration-pipeline.js";
import { NARRATION_ARTIFACT_SCHEMA_VERSION } from "./narration-schemas.js";
import { resolveSpeechNarrationPacingPreset } from "./narration-pacing.js";

describe("narration pipeline pacing defaults", () => {
  it("uses the centralized language/profile speed when no speed override is provided", async () => {
    expect(resolveSpeechNarrationPacingPreset("de", "full").providerSpeed).toBe(
      1.45
    );
  });

  it("blocks audio generation when spoken narration still contains validation failures", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "mediaforge-narration-validation-"));
    const episodeDir = path.join(root, "025-the-endless-backrooms");
    const spokenTextJsonPath = path.join(
      episodeDir,
      "locales",
      "de",
      "full",
      "audio",
      "narration",
      "spoken-text.json"
    );
    await fs.mkdir(path.dirname(spokenTextJsonPath), { recursive: true });
    await fs.writeFile(
      spokenTextJsonPath,
      JSON.stringify(
        {
          schemaVersion: NARRATION_ARTIFACT_SCHEMA_VERSION,
          status: "failed",
          episodeId: "025-the-endless-backrooms",
          locale: "de",
          variant: "full",
          preparationMode: "fallback",
          sourceHash: hashText(""),
          spokenTextPath: "locales/de/full/audio/narration/spoken-text.md",
          spokenTextHash: hashText(""),
          wordCount: 0,
          warnings: [],
          createdAt: "2026-07-10T00:00:00.000Z",
          provenance: {
            generator: "@mediaforge/speech",
          },
          failureMessage:
            "validation_failed: German localized narration must preserve native German characters before TTS.",
        },
        null,
        2
      )
    );

    const result = await new NarrationPipeline().run({
      episodeDir,
      episodeId: "025-the-endless-backrooms",
      language: "de",
      locale: "de",
      variant: "full",
      stage: "all",
      rolloutMode: "new",
      model: "gpt-4o-mini-tts",
      voice: "onyx",
    });

    expect(result.status).toBe("blocked");
    expect(result.stages[0]?.stage).toBe("prepare");
    expect(result.stages[0]?.status).toBe("blocked");
    expect(result.stages[0]?.message).toContain("validation_failed");
    const artifact = JSON.parse(
      await fs.readFile(spokenTextJsonPath, "utf8")
    ) as { readonly status?: string; readonly failureMessage?: string };
    expect(artifact.status).toBe("failed");
    expect(artifact.failureMessage).toContain("validation_failed");
  });
});
