import { describe, expect, it } from "vitest";

import {
  APPROVED_MATH_NARRATION_PRESET,
  validateApprovedMathNarration,
} from "./approved-preset.js";

const baseline = {
  language: "de",
  provider: "openai-compatible",
  model: "gpt-4o-mini-tts",
  voice: "marin",
  providerSpeed: 0.9,
  speechProfileVersion: "education-natural-teacher.v1",
  normalizationVersion: "education-math-normalization.v1",
  pronunciationDictionaryVersion: "education-math-pronunciation-de.v1",
  durationSeconds: 300,
  integratedLoudnessLufs: -16.94,
  truePeakDbtp: -2,
  clippingDetected: false,
  sampleRateHz: 48_000,
  channels: 1,
  codec: "pcm_s16le",
  audioHash: "e".repeat(64),
} as const;

describe("approved mathematics narration preset", () => {
  it("locks the reviewed five-minute production baseline", () => {
    expect(validateApprovedMathNarration(baseline)).toEqual(baseline);
    expect(APPROVED_MATH_NARRATION_PRESET).toMatchObject({
      presetId: "math-narration-approved-v1",
      providerSpeed: 0.9,
      targetDurationSeconds: 300,
      integratedLoudnessTargetLufs: -17,
    });
  });

  it("rejects speed, identity, duration, loudness, peak, and locale regressions", () => {
    for (const changed of [
      { ...baseline, providerSpeed: 0.95 },
      { ...baseline, voice: "cedar" },
      { ...baseline, durationSeconds: 289 },
      { ...baseline, integratedLoudnessLufs: -14 },
      { ...baseline, truePeakDbtp: -1 },
      {
        ...baseline,
        pronunciationDictionaryVersion: "education-math-pronunciation-en.v1",
      },
    ])
      expect(() => validateApprovedMathNarration(changed)).toThrow(
        "AUDIO_PRESET_REGRESSION"
      );
  });
});
