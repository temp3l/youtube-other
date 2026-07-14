import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  EDUCATIONAL_SPEECH_PRODUCER_VERSION,
  assertEducationalSpeechProviderResult,
  buildEducationalSpeechCacheKey,
  classifyEducationalSpeechError,
  educationalSpeechCandidatePath,
  generateEducationalSpeech,
  runEducationalSpeechWithRetries,
} from "./educational-speech-pipeline.js";
import {
  buildEducationalSpeechPlan,
  normalizeEducationalSpokenText,
  planEducationalPause,
  type EducationalNarrationBeat,
} from "./educational-speech-planning.js";
import { pronunciationDictionarySchema } from "./narration-schemas.js";
import {
  resolveSpeechDeliveryProfile,
  type SpeechDeliveryProfile,
} from "./speech-delivery-profile.js";
import {
  DEFAULT_SPEECH_VOICE,
  loadSpeechVoiceSettings,
} from "./voice-settings.js";

const beats: readonly EducationalNarrationBeat[] = [
  {
    id: "intro",
    visualStepId: "scene-001",
    kind: "introduction",
    displayText: "Solve 3x + 5 = 20",
    spokenText:
      "Today we solve 3x + 5 = 20 together and keep each change visible on the board.",
    writingBehavior: "overlap-narration",
  },
  {
    id: "step-one",
    visualStepId: "scene-002",
    kind: "calculation-step",
    displayText: "3x = 15",
    spokenText:
      "Subtract 5 from both sides. The equation becomes 3x = 15, which keeps both sides balanced.",
    writingBehavior: "overlap-narration",
  },
  {
    id: "result",
    visualStepId: "scene-003",
    kind: "final-answer",
    displayText: "x = 5",
    spokenText:
      "Divide both sides by 3. The final answer is x = 5, and substituting 5 confirms the result.",
    writingBehavior: "overlap-narration",
  },
  {
    id: "recap",
    visualStepId: "scene-004",
    kind: "recap",
    displayText: "Subtract, divide, check",
    spokenText:
      "To recap, undo addition first, undo multiplication second, and then check the value in the original equation.",
    writingBehavior: "overlap-narration",
  },
];

function cacheInput(profile: SpeechDeliveryProfile) {
  return {
    producerVersion: EDUCATIONAL_SPEECH_PRODUCER_VERSION,
    provider: "openai-compatible" as const,
    providerBaseUrlIdentity: "openai-default",
    model: profile.model,
    voice: profile.voice,
    language: profile.language,
    normalizedSpokenText: "x equals 5",
    instructions: profile.instructions,
    speechProfileId: profile.id,
    speechProfileVersion: profile.version,
    pronunciationDictionaryVersion: profile.pronunciationDictionaryVersion,
    pronunciationDictionaryFingerprint: "a".repeat(64),
    outputFormat: profile.postProcessingPolicy.outputFormat,
    providerSampleRateHz: profile.postProcessingPolicy.providerSampleRateHz,
    assemblySampleRateHz: profile.postProcessingPolicy.assemblySampleRateHz,
    targetWordsPerMinute: profile.targetWordsPerMinute ?? 150,
    providerSpeed: profile.providerSpeed,
    pausePolicy: profile.pausePolicy,
    chunkingPolicy: profile.chunkingPolicy,
    postProcessingPolicy: profile.postProcessingPolicy,
    candidateIndex: 1,
    requestFingerprint: "b".repeat(64),
  };
}

describe("educational speech profiles and planning", () => {
  it("resolves natural teacher by language without changing generic or Dark Truth defaults", () => {
    const english = resolveSpeechDeliveryProfile(
      "education-natural-teacher",
      "en"
    );
    const german = resolveSpeechDeliveryProfile(
      "education-natural-teacher",
      "de"
    );
    expect(english.id).toBe("education-natural-teacher");
    expect(english.targetWordsPerMinute).toBe(150);
    expect(english.instructions).toContain("secondary-school mathematics teacher");
    expect(german.instructions).toContain("Mathematiklehrkraft");
    expect(german.instructions).not.toBe(english.instructions);
    expect(DEFAULT_SPEECH_VOICE).toBe("onyx");
    expect(loadSpeechVoiceSettings().voice).toBe("onyx");
  });

  it("normalizes mathematical speech contextually in English and German", () => {
    expect(
      normalizeEducationalSpokenText(
        "x²; √25; 3.5; -4; 25 %; 1/2; 5 cm; x = 12; 2 + 3 = 5",
        "en"
      )
    ).toContain(
      "x squared; square root of 25; 3 point 5; negative 4; 25 percent; 1 over 2; 5 centimetres; x equals 12; 2 plus 3 equals 5"
    );
    const german = normalizeEducationalSpokenText(
      "x²; 3,5; -4; 25 %; 1/2; 5 cm; x = 12",
      "de"
    );
    expect(german).toContain("x zum Quadrat");
    expect(german).toContain("3 Komma 5");
    expect(german).toContain("minus 4");
    expect(german).toContain("25 Prozent");
    expect(german).toContain("5 Zentimeter");
    expect(german).toContain("x ist gleich 12");
    expect(normalizeEducationalSpokenText("x ≠ 4", "de")).toBe(
      "x ist nicht gleich 4"
    );
  });

  it("plans deterministic, bounded pauses without adding one after every sentence", () => {
    const profile = resolveSpeechDeliveryProfile(
      "education-natural-teacher",
      "en"
    );
    const first = planEducationalPause({
      beatId: "step-one",
      kind: "calculation-step",
      profile,
    });
    const second = planEducationalPause({
      beatId: "step-one",
      kind: "calculation-step",
      profile,
    });
    expect(first).toEqual(second);
    expect(first.kind).toBe("step-transition");
    expect(first.durationMs).toBeGreaterThanOrEqual(300);
    expect(first.durationMs).toBeLessThanOrEqual(500);
  });

  it("packs complete teaching beats into semantic chunks and keeps display/spoken forms separate", () => {
    const profile = resolveSpeechDeliveryProfile(
      "education-natural-teacher",
      "en"
    );
    const plan = buildEducationalSpeechPlan({
      episodeId: "lesson-natural-speech",
      profile,
      beats,
      createdAt: "2026-07-13T10:00:00.000Z",
    });
    expect(plan.chunks.length).toBeGreaterThan(0);
    expect(plan.chunks.every((chunk) => chunk.ttsText.length <= 4_096)).toBe(
      true
    );
    expect(plan.beats[0]?.displayText).toBe("Solve 3x + 5 = 20");
    expect(plan.beats[0]?.normalizedSpokenText).toContain("3x plus 5 equals 20");
    const appearances = new Map<string, number>();
    for (const chunk of plan.chunks)
      for (const beatId of chunk.beatIds)
        appearances.set(beatId, (appearances.get(beatId) ?? 0) + 1);
    expect([...appearances.values()].every((count) => count === 1)).toBe(true);
    expect(plan.presentationSteps.every((step) => step.visualStepId)).toBe(true);
    expect(
      plan.chunks.some((chunk) => chunk.internalPauseCues.length > 0)
    ).toBe(true);
  });

  it("uses only safe fallbacks for an oversized semantic beat", () => {
    const base = resolveSpeechDeliveryProfile(
      "education-natural-teacher",
      "en"
    );
    const profile = {
      ...base,
      chunkingPolicy: {
        ...base.chunkingPolicy,
        minimumTextCharacters: 30,
        maximumTextCharacters: 90,
        hardMaximumTextCharacters: 120,
      },
    };
    const plan = buildEducationalSpeechPlan({
      episodeId: "lesson-safe-boundaries",
      profile,
      beats: [
        {
          id: "long-explanation",
          kind: "explanation",
          displayText: "x = 12 cm",
          spokenText:
            "First we collect the known values and inspect the board carefully. Keep the complete assignment x = 12 cm. 1. Now use that value in the next calculation without separating its unit. Finally, verify the result with the original equation.",
          writingBehavior: "overlap-narration",
        },
      ],
      createdAt: "2026-07-13T10:00:00.000Z",
    });

    expect(plan.chunks.length).toBeGreaterThan(1);
    expect(
      plan.chunks.some((chunk) =>
        chunk.ttsText.includes("x equals 12 centimetres")
      )
    ).toBe(true);
    expect(
      plan.chunks.every((chunk) => chunk.ttsText.trim() !== "1.")
    ).toBe(true);
  });

  it("applies versioned pronunciation overrides after normalization", () => {
    const profile = resolveSpeechDeliveryProfile(
      "education-natural-teacher",
      "de"
    );
    const dictionary = pronunciationDictionarySchema.parse({
      dictionaryVersion: "fixture.v1",
      language: "de",
      profileId: profile.id,
      entries: [
        {
          entryId: "kgv",
          scope: "profile",
          language: "de",
          profileId: profile.id,
          phrase: "kgV",
          replacement: "kleinstes gemeinsames Vielfaches",
          mandatory: true,
          enabled: true,
        },
      ],
    });
    const plan = buildEducationalSpeechPlan({
      episodeId: "lesson-pronunciation",
      profile,
      beats: [
        {
          id: "definition",
          kind: "definition",
          displayText: "kgV",
          spokenText: "Wir bestimmen das kgV.",
          writingBehavior: "overlap-narration",
        },
      ],
      pronunciationDictionaries: [dictionary],
      createdAt: "2026-07-13T10:00:00.000Z",
    });
    expect(plan.beats[0]?.ttsText).toContain(
      "kleinstes gemeinsames Vielfaches"
    );
    expect(plan.beats[0]?.pronunciationEntryIds).toEqual(["kgv"]);
  });

  it("invalidates cache keys for every material delivery change and keeps names stable", () => {
    const profile = resolveSpeechDeliveryProfile(
      "education-natural-teacher",
      "en"
    );
    const original = buildEducationalSpeechCacheKey(cacheInput(profile));
    const changedVoice = buildEducationalSpeechCacheKey({
      ...cacheInput(profile),
      voice: "marin",
    });
    const changedDictionary = buildEducationalSpeechCacheKey({
      ...cacheInput(profile),
      pronunciationDictionaryFingerprint: "c".repeat(64),
    });
    const changedCandidate = buildEducationalSpeechCacheKey({
      ...cacheInput(profile),
      candidateIndex: 2,
    });
    const changedProducer = buildEducationalSpeechCacheKey({
      ...cacheInput(profile),
      producerVersion: "educational-speech-producer.v3",
    });
    expect(new Set([original, changedVoice, changedDictionary, changedCandidate, changedProducer]).size).toBe(5);
    expect(
      educationalSpeechCandidatePath({
        outputRoot: "/tmp/speech",
        chunkId: "narr-chunk-001",
        candidateIndex: 2,
        extension: "wav",
      })
    ).toBe("/tmp/speech/candidates/candidate-02/chunks/narr-chunk-001.wav");
  });

  it("classifies retries and bounds transient attempts", async () => {
    expect(classifyEducationalSpeechError(new Error("401 unauthorized"))).toEqual({
      classification: "authentication",
      retryable: false,
    });
    expect(classifyEducationalSpeechError(new Error("429 rate limit"))).toEqual({
      classification: "rate-limit",
      retryable: true,
    });
    let attempts = 0;
    const result = await runEducationalSpeechWithRetries({
      maxAttempts: 3,
      sleep: async () => undefined,
      operation: async () => {
        attempts += 1;
        if (attempts < 3) throw new Error("503 temporarily unavailable");
        return "ok";
      },
    });
    expect(result).toEqual({ value: "ok", attemptCount: 3 });
  });

  it("rejects transplanted provider identity before promotion", () => {
    expect(() =>
      assertEducationalSpeechProviderResult({
        result: {
          sceneId: "scene-002",
          filePath: "/tmp/chunk.wav",
          durationSeconds: 2,
          sampleRate: 24_000,
          channels: 1,
          requestFingerprint: "wrong",
        },
        expectedSceneId: "scene-001",
        expectedOutputPath: "/tmp/chunk.wav",
        expectedRequestFingerprint: "expected",
        validation: {
          schemaVersion: "narration-artifact-v1",
          chunkId: "narr-chunk-001",
          audioPath: "chunk.wav",
          audioHash: "a".repeat(64),
          validationStatus: "passed",
          metrics: {
            decodable: true,
            durationMs: 2_000,
            sampleRate: 24_000,
            channels: 1,
          },
          findings: [],
          createdAt: "2026-07-14T00:00:00.000Z",
        },
      })
    ).toThrow(/scene identity/u);
  });

  it("keeps dry-run read-only while reporting candidates, paths, cache, and pauses", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "speech-dry-run-"));
    const outputRoot = path.join(root, "not-created");
    const profile = resolveSpeechDeliveryProfile(
      "education-natural-teacher",
      "en"
    );
    const plan = buildEducationalSpeechPlan({
      episodeId: "lesson-dry-run",
      profile,
      beats,
      createdAt: "2026-07-13T10:00:00.000Z",
    });
    const result = await generateEducationalSpeech({
      plan,
      profile,
      pronunciationDictionaries: [],
      providerId: "fake",
      outputRoot,
      candidateCount: 3,
      dryRun: true,
    });
    expect(result.status).toBe("dry-run");
    if (result.status !== "dry-run") throw new Error("Expected dry run.");
    expect(result.dryRun.chunkCount).toBe(plan.chunks.length);
    expect(result.dryRun.chunks.some((chunk) => chunk.candidateIndex === 3)).toBe(true);
    expect(result.dryRun.chunks.every((chunk) => chunk.plannedPause.durationMs > 0)).toBe(true);
    expect(
      result.dryRun.chunks.some(
        (chunk) => chunk.internalPlannedPauses.length > 0
      )
    ).toBe(true);
    await expect(fs.stat(outputRoot)).rejects.toMatchObject({ code: "ENOENT" });
  });
});
