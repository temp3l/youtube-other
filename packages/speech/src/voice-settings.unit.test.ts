import { describe, expect, it } from "vitest";
import { loadSpeechVoiceSettings } from "./voice-settings.js";

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

  it("adapts instructions for the requested language", () => {
    const settings = loadSpeechVoiceSettings({ preset: "fast", language: "es" });
    expect(settings.language).toBe("es");
    expect(settings.instructions).toContain("Spanish");
    expect(settings.instructions).toContain("es");
  });
});
