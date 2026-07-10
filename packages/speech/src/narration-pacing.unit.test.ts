import { describe, expect, it } from "vitest";
import {
  SPEECH_NARRATION_PACING_PRESETS,
  assessNarrationPacing,
  resolveSpeechNarrationPacingPreset,
} from "./narration-pacing.js";

describe("speech narration pacing presets", () => {
  it("defines a full and short pacing preset for every supported language", () => {
    for (const [language, presets] of Object.entries(
      SPEECH_NARRATION_PACING_PRESETS
    )) {
      expect(presets.full, `${language} full preset`).toBeDefined();
      expect(presets.short, `${language} short preset`).toBeDefined();
      expect(presets.full.targetWpm).toBeGreaterThanOrEqual(175);
      expect(presets.full.targetWpm).toBeLessThanOrEqual(185);
      expect(presets.short.targetWpm).toBeGreaterThanOrEqual(180);
      expect(presets.short.targetWpm).toBeLessThanOrEqual(195);
    }
  });

  it("fails fast for unsupported language or profile requests", () => {
    expect(() =>
      resolveSpeechNarrationPacingPreset("it", "full")
    ).toThrow("Unsupported narration pacing language");
    expect(() =>
      resolveSpeechNarrationPacingPreset("en", "teaser")
    ).toThrow("Unsupported narration pacing profile");
  });

  it("marks narration as failed when duration is far slower than the preset target", () => {
    const assessment = assessNarrationPacing({
      language: "de",
      artifactType: "full",
      wordCount: 1_238,
      actualDurationMs: 589_950,
    });

    expect(assessment.targetWpm).toBe(184);
    expect(assessment.status).toBe("failed");
    expect(assessment.actualWpm).toBeLessThan(assessment.targetWpm * 0.8);
  });

  it("marks narration as warning when duration is outside the preferred but not hard range", () => {
    const preset = resolveSpeechNarrationPacingPreset("en", "full");
    const expectedDurationMs = (1_100 / preset.targetWpm) * 60_000;
    const assessment = assessNarrationPacing({
      language: "en",
      artifactType: "full",
      wordCount: 1_100,
      actualDurationMs: expectedDurationMs * 1.18,
    });

    expect(assessment.status).toBe("warning");
  });

  it("marks narration as passed when duration stays inside the preferred range", () => {
    const assessment = assessNarrationPacing({
      language: "en",
      artifactType: "short",
      wordCount: 156,
      actualDurationMs: 52_000,
    });

    expect(assessment.status).toBe("passed");
    expect(assessment.actualWpm).toBeGreaterThan(175);
  });
});
