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
    const settings = loadSpeechVoiceSettings({ preset: "fast", language: "es" });
    expect(settings.language).toBe("es");
    expect(settings.instructions).toContain("Spanish");
    expect(settings.instructions).toContain("es");
    expect(settings.instructions).toContain("Mantén un ritmo aproximado de 175 palabras por minuto.");
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
    expect(fullTemplate.instructions).toContain("168 Wörter pro Minute");
    expect(shortTemplate.path).toBe(resolveSpeechVoiceInstructionPath("de", "short"));
    expect(shortTemplate.instructions).toContain("170 Wörter pro Minute");
  });

  it("applies explicit pace and speed overrides", () => {
    const settings = loadSpeechVoiceSettings({
      preset: "fast",
      language: "de",
      artifactType: "full",
      paceWpm: 168,
      speed: 0.933,
    });

    expect(settings.paceWpm).toBe(168);
    expect(settings.profile.paceWpm).toBe(168);
    expect(settings.speed).toBe(0.933);
  });
});
