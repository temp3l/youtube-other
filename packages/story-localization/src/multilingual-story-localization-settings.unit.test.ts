import { describe, expect, it } from "vitest";
import { getLanguageProfile } from "./language-profiles.js";
import {
  getLanguageRewriteSettings,
  loadMultilingualStoryLocalizationSettings,
} from "./multilingual-story-localization-settings.js";

const supportedLanguages = ["en", "de", "es", "fr", "pt"] as const;

describe("multilingual story localization settings", () => {
  it.each(supportedLanguages)(
    "loads the %s localization block through the resolver",
    (language) => {
      const profile = getLanguageProfile(language);
      const settings = getLanguageRewriteSettings(profile.locale);
      const section = loadMultilingualStoryLocalizationSettings(profile.locale);
      expect(settings.language).toBe(language);
      expect(settings.locale).toBe(profile.locale.toLowerCase());
      expect(settings.heading).toMatch(/Localization$/u);
      expect(settings.instructions).toBe(section);
      expect(settings.instructions).toContain(`## ${settings.heading}`);
      expect(settings.instructions.match(/^## /gmu)).toHaveLength(1);
    }
  );

  it("rejects unsupported locales", () => {
    expect(() => getLanguageRewriteSettings("it-IT")).toThrow(
      "Unsupported locale for multilingual settings: it-IT"
    );
  });
});
