import { describe, expect, it } from "vitest";
import {
  assessVeronicaSpeechRate,
  estimateVeronicaSpeechDurationSeconds,
  getVeronicaSpeechRatePolicy,
  getVeronicaScriptLengthGuidance,
  VERONICA_SPEECH_RATE_POLICY,
} from "./veronica-speech-rate-policy.js";

describe("Veronica speech-rate policy", () => {
  it("resolves the exhaustive locale and variant policy", () => {
    expect(
      getVeronicaSpeechRatePolicy({ locale: "en", variant: "full" })
    ).toMatchObject({ targetWpm: 150, softMinWpm: 140, softMaxWpm: 160 });
    expect(
      getVeronicaSpeechRatePolicy({ locale: "en", variant: "short" })
    ).toMatchObject({ targetWpm: 155, softMinWpm: 145, softMaxWpm: 165 });
    expect(
      getVeronicaSpeechRatePolicy({ locale: "de", variant: "full" })
    ).toMatchObject({ targetWpm: 145, softMinWpm: 135, softMaxWpm: 155 });
    expect(
      getVeronicaSpeechRatePolicy({ locale: "de", variant: "short" })
    ).toMatchObject({ targetWpm: 150, softMinWpm: 140, softMaxWpm: 160 });
    expect(
      getVeronicaSpeechRatePolicy({ locale: "es", variant: "short" })
    ).toMatchObject({ targetWpm: 155, softMinWpm: 145, softMaxWpm: 165 });
    for (const variant of ["full", "short"] as const) {
      expect(Object.keys(VERONICA_SPEECH_RATE_POLICY[variant]).sort()).toEqual([
        "de",
        "en",
        "es",
        "fr",
        "it",
        "pt",
      ]);
    }
  });

  it("estimates duration from spoken words before TTS", () => {
    expect(
      estimateVeronicaSpeechDurationSeconds({
        spokenWordCount: 155,
        policy: getVeronicaSpeechRatePolicy({ locale: "en", variant: "short" }),
      })
    ).toBe(60);
    expect(
      getVeronicaScriptLengthGuidance({ locale: "en", variant: "short" })
        .spokenWordCountRange
    ).toEqual([225, 240]);
    expect(
      getVeronicaScriptLengthGuidance({ locale: "de", variant: "full" })
        .spokenWordCountRange
    ).toEqual([1377.5, 1522.5]);
  });

  it("measures observed WPM from selected audio without rounding before thresholds", () => {
    const policy = getVeronicaSpeechRatePolicy({
      locale: "en",
      variant: "short",
    });
    expect(
      assessVeronicaSpeechRate({
        spokenWordCount: 155,
        audioDurationSeconds: 60,
        policy,
      })
    ).toMatchObject({ observedWpm: 155, status: "within-target" });
    expect(
      assessVeronicaSpeechRate({
        spokenWordCount: 158,
        audioDurationSeconds: 60,
        policy,
      })
    ).toMatchObject({ observedWpm: 158, status: "within-target" });
    expect(
      assessVeronicaSpeechRate({
        spokenWordCount: 162,
        audioDurationSeconds: 60,
        policy,
      }).status
    ).toBe("within-target");
    expect(
      assessVeronicaSpeechRate({
        spokenWordCount: 145,
        audioDurationSeconds: 60,
        policy,
      }).status
    ).toBe("within-target");
    expect(
      assessVeronicaSpeechRate({
        spokenWordCount: 166,
        audioDurationSeconds: 60,
        policy,
      }).status
    ).toBe("soft-high");
    expect(
      assessVeronicaSpeechRate({
        spokenWordCount: 144,
        audioDurationSeconds: 60,
        policy,
      }).status
    ).toBe("soft-low");
    expect(
      assessVeronicaSpeechRate({
        spokenWordCount: 155,
        audioDurationSeconds: 0,
        policy,
      }).status
    ).toBe("unavailable");
    expect(
      assessVeronicaSpeechRate({
        spokenWordCount: 155,
        audioDurationSeconds: null,
        policy,
      }).status
    ).toBe("unavailable");
    expect(
      assessVeronicaSpeechRate({
        spokenWordCount: 0,
        audioDurationSeconds: 60,
        policy,
      }).status
    ).toBe("hard-low");
  });
});
