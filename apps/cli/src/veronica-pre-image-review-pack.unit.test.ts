import { createHash } from "node:crypto";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { resolveVeronicaCurrentReviewState, validateVeronicaTimingIntegrity, veronicaPreImageReviewInstruction } from "./veronica-pre-image-review-pack.js";
import { calibrateVeronicaShortNarration } from "./veronica-short-pacing.js";

describe("Veronica pre-image review instructions", () => {
  it("keeps Short-specific review criteria on the short variant", () => {
    const instruction = veronicaPreImageReviewInstruction("short");
    expect(instruction).toContain("Review this Short");
    expect(instruction).toContain("9:16 readability");
    expect(instruction).not.toContain("full / long-form");
  });

  it("projects full-form sequence and 16:9 criteria without Short language", () => {
    const instruction = veronicaPreImageReviewInstruction("full");
    expect(instruction).toContain("full / long-form");
    expect(instruction).toContain("16:9 composition");
    expect(instruction).toContain("multi-state representation validity");
    expect(instruction).toContain("long-form scene/event sequence coherence");
    expect(instruction).not.toContain("Review this Short");
    expect(instruction).not.toContain("9:16 readability");
  });

  it("fails hash-consistent artifacts when selected audio timing is stale", () => {
    const result = validateVeronicaTimingIntegrity({
      audioDurationSeconds: 57.44,
      calibrationDurationSeconds: 57.44,
      canonicalDurationSeconds: 47.147,
      reviewManifestDurationSeconds: 47.147,
      episodeManifestFinalSceneEndSeconds: 47.147,
      retimedSceneFinalEndSeconds: 47.147,
      retimedEventFinalEndSeconds: 47.147,
      cadenceDurationSeconds: 47.147,
      selectedAudioHash: "a".repeat(64),
      calibrationAudioHash: "a".repeat(64),
      canonicalTimingAudioHash: "b".repeat(64),
    });
    expect(result.status).toBe("FAIL");
    expect(result.errorCode).toBe("SELECTED_AUDIO_TIMING_MISMATCH");
  });

  it("accepts millisecond rounding inside the technical epsilon", () => {
    const result = validateVeronicaTimingIntegrity({
      audioDurationSeconds: 59.8725,
      calibrationDurationSeconds: 59.8725,
      canonicalDurationSeconds: 59.8725,
      episodeManifestFinalSceneEndSeconds: 59.8725,
      retimedSceneFinalEndSeconds: 59.8725,
      retimedEventFinalEndSeconds: 59.873,
      cadenceDurationSeconds: 59.873,
      selectedAudioHash: "a".repeat(64),
      calibrationAudioHash: "a".repeat(64),
      canonicalTimingAudioHash: "a".repeat(64),
    });
    expect(result.status).toBe("PASS");
  });

  it("uses current identity-bound blockers instead of superseded semantic-review findings", () => {
    const identity = "a".repeat(64);
    const revision = "b".repeat(64);
    const current = resolveVeronicaCurrentReviewState({
      deterministicFindingCodes: [],
      sequenceDiversityFindingCodes: [],
      qaBlockers: ["SOURCE_GROUNDED_BEAT_SEQUENCE_REVIEW_REQUIRED"],
      qaAdmissionIdentity: identity,
      qaRevisionId: revision,
      currentAdmissionIdentity: identity,
      currentQaRevisionId: revision,
    });
    expect(current.qaCurrent).toBe(true);
    expect(current.activeBlockers).toEqual(["SOURCE_GROUNDED_BEAT_SEQUENCE_REVIEW_REQUIRED"]);
    expect(current.activeBlockers).not.toContain("BUYER_PERSPECTIVE_REQUIRED");

    const stale = resolveVeronicaCurrentReviewState({
      deterministicFindingCodes: [],
      sequenceDiversityFindingCodes: ["COMPOSITION_MONOTONY"],
      qaBlockers: ["SOURCE_GROUNDED_BEAT_SEQUENCE_REVIEW_REQUIRED"],
      qaAdmissionIdentity: "c".repeat(64),
      qaRevisionId: revision,
      currentAdmissionIdentity: identity,
      currentQaRevisionId: revision,
    });
    expect(stale.activeBlockers).toEqual(["COMPOSITION_MONOTONY", "SOURCE_GROUNDED_QA_STALE"]);

    const deferred = resolveVeronicaCurrentReviewState({
      deterministicFindingCodes: [],
      sequenceDiversityFindingCodes: [],
      qaBlockers: ["SOURCE_GROUNDED_SCENE_JUDGE_UNAVAILABLE"],
      qaAdmissionIdentity: null,
      qaRevisionId: revision,
      currentAdmissionIdentity: identity,
      currentQaRevisionId: revision,
      qaDeferred: true,
    });
    expect(deferred.activeBlockers).toEqual([]);
  });

  it("promotes the selected cached candidate to the canonical narration WAV", async () => {
    const episodeDir = await fs.mkdtemp(path.join(os.tmpdir(), "veronica-selected-audio-"));
    const result = await calibrateVeronicaShortNarration({
      episodeDir,
      episodeId: "generic-short",
      locale: "en",
      narration: Array.from({ length: 194 }, () => "evidence").join(" "),
      model: "fixture-model",
      voice: "fixture-voice",
      baselineSpeed: 1,
      baseInstructions: "natural conceptual explanation",
      synthesize: async ({ outputPath, speed }) => {
        await fs.mkdir(path.dirname(outputPath), { recursive: true });
        await fs.writeFile(outputPath, `candidate-${speed}`);
      },
      probeDuration: async () => 75,
    });
    expect(result).toBeDefined();
    const canonical = await fs.readFile(path.join(episodeDir, "locales/en/short/audio/narration.wav"));
    expect(createHash("sha256").update(canonical).digest("hex")).toBe(result?.calibration.selectedAudioHash);
    expect(result?.providerCalls).toBe(1);
  });
});
