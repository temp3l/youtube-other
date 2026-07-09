import { describe, expect, it } from "vitest";
import {
  loadSpeechVoiceInstructionTemplate,
  loadSpeechVoiceSettings,
  resolveSpeechVoiceInstructionPath,
} from "./voice-settings.js";

describe("speech voice settings", () => {
  it("loads the fast preset by default", () => {
    const settings = loadSpeechVoiceSettings();
    expect(settings.preset).toBe("fast");
    expect(settings.voice).toBe("onyx");
    expect(settings.profile.paceWpm).toBe(180);
    expect(settings.instructions).toContain("180 words per minute");
  });

  it("loads the fast preset when requested", () => {
    const settings = loadSpeechVoiceSettings({ preset: "fast" });
    expect(settings.preset).toBe("fast");
    expect(settings.profile.paceWpm).toBe(180);
    expect(settings.instructions).toContain("180 words per minute");
  });

  it("loads the very-fast preset when requested", () => {
    const settings = loadSpeechVoiceSettings({ preset: "very-fast" });
    expect(settings.preset).toBe("very-fast");
    expect(settings.profile.paceWpm).toBe(190);
    expect(settings.speed).toBe(1.5);
    expect(settings.instructions).toContain("190 words per minute");
  });

  it("adapts instructions for the requested language", () => {
    const settings = loadSpeechVoiceSettings({
      preset: "fast",
      language: "es",
      artifactType: "full",
    });
    expect(settings.language).toBe("es");
    expect(settings.narrationPacingPreset?.id).toBe("dark-truth-es-full-pace-v1");
    expect(settings.instructions).toContain("Spanish");
    expect(settings.instructions).toContain("es");
    expect(settings.instructions).toContain("182 palabras por minuto");
  });

  it("loads artifact-specific voice templates from config", () => {
    const fullTemplate = loadSpeechVoiceInstructionTemplate({
      preset: "fast",
      language: "de",
      artifactType: "full",
    });
    const shortTemplate = loadSpeechVoiceInstructionTemplate({
      preset: "very-fast",
      language: "de",
      artifactType: "short",
    });

    expect(fullTemplate.path).toBe(resolveSpeechVoiceInstructionPath("de", "full"));
    expect(fullTemplate.instructions).toContain("düsteren Dokumentarton");
    expect(shortTemplate.path).toBe(resolveSpeechVoiceInstructionPath("de", "short"));
    expect(shortTemplate.instructions).toContain("Halte die Lieferung kompakt");
  });

  it("applies centralized narration pacing when language and profile are provided", () => {
    const settings = loadSpeechVoiceSettings({
      preset: "fast",
      language: "de",
      artifactType: "full",
    });

    expect(settings.paceWpm).toBe(184);
    expect(settings.profile.paceWpm).toBe(184);
    expect(settings.speed).toBe(1.45);
    expect(settings.instructions).toContain("184 Wörter pro Minute");
  });

  it("applies explicit pace and speed overrides", () => {
    const settings = loadSpeechVoiceSettings({
      preset: "fast",
      language: "de",
      artifactType: "full",
      paceWpm: 186,
      speed: 1.24,
    });

    expect(settings.paceWpm).toBe(186);
    expect(settings.profile.paceWpm).toBe(186);
    expect(settings.speed).toBe(1.24);
  });

  it("loads Portuguese templates without falling back to generic instructions", () => {
    const settings = loadSpeechVoiceSettings({
      preset: "very-fast",
      language: "pt",
      artifactType: "short",
    });

    expect(settings.narrationPacingPreset?.id).toBe("dark-truth-pt-short-pace-v1");
    expect(settings.instructions).toContain("188 palavras por minuto");
    expect(settings.instructions).toContain("Portuguese");
  });
});
