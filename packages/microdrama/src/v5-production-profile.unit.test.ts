import { describe, expect, it } from "vitest";

import {
  buildSevenMinutesAheadProductionProfile,
  heritageWpmIsRuntimeAuthority,
  resolveLexicalTimingAuthority,
  resolveLocaleProductionProfile,
  validateSevenMinutesAheadProductionProfile,
} from "./index.js";
import { HERITAGE_SINGLE_VALUE_WPM } from "./v5-production-profile-contracts.js";

describe("V5 production profiles", () => {
  const profile = buildSevenMinutesAheadProductionProfile("2026-08-12T03:30:00.000Z");

  it("registers locale lexical WPM values from profile data", () => {
    const validated = validateSevenMinutesAheadProductionProfile(profile);
    expect(validated.supportedLocales).toEqual(["en-US", "de-DE", "es-ES", "pt-BR"]);
    expect(resolveLocaleProductionProfile(validated, "en-US")?.lexicalGate.targetSpokenWpm).toBe(
      155
    );
    expect(resolveLocaleProductionProfile(validated, "de-DE")?.lexicalGate.targetSpokenWpm).toBe(
      150
    );
    expect(resolveLocaleProductionProfile(validated, "es-ES")?.lexicalGate.targetSpokenWpm).toBe(
      155
    );
    expect(resolveLocaleProductionProfile(validated, "pt-BR")?.lexicalGate.targetSpokenWpm).toBe(
      155
    );
  });

  it("keeps lexical and audio gates separate with uncalibrated audio policy", () => {
    const enProfile = resolveLocaleProductionProfile(profile, "en-US");
    expect(enProfile?.lexicalGate.gateKind).toBe("LEXICAL_GATE");
    expect(enProfile?.audioGate.gateKind).toBe("AUDIO_GATE");
    expect(enProfile?.audioGate.calibrationStatus).toBe("UNCALIBRATED");
    expect(enProfile?.audioGate.softDurationSeconds).toBeNull();
    expect(enProfile?.audioGate.hardDurationSeconds).toBeNull();
  });

  it("rejects heritage 160 WPM as V5 runtime authority", () => {
    expect(heritageWpmIsRuntimeAuthority(HERITAGE_SINGLE_VALUE_WPM)).toBe(false);
    const resolution = resolveLexicalTimingAuthority(profile, "en-US", [
      {
        source: "heritage_series_state",
        locale: "en-US",
        spokenWpm: HERITAGE_SINGLE_VALUE_WPM,
      },
    ]);
    expect(resolution.ok).toBe(false);
    if (resolution.ok) {
      throw new Error("expected heritage WPM rejection");
    }
    expect(resolution.code).toBe("heritage_wpm_rejected");
  });

  it("resolves registered V5 locale profile precedence over heritage hints", () => {
    const resolution = resolveLexicalTimingAuthority(profile, "de-DE", [
      {
        source: "heritage_series_state",
        locale: "de-DE",
        spokenWpm: 150,
      },
      {
        source: "manifest",
        locale: "de-DE",
        spokenWpm: 150,
      },
    ]);
    expect(resolution.ok).toBe(true);
    if (!resolution.ok) {
      throw new Error(resolution.message);
    }
    expect(resolution.authoritySource).toBe("v5_locale_profile");
    expect(resolution.localeProfile.lexicalGate.targetSpokenWpm).toBe(150);
  });
});
