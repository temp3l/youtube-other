import { describe, expect, it } from "vitest";
import { getLanguageProfile } from "./language-profiles.js";
import { languageCodes } from "./story-localization.types.js";
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

  it("documents only implemented language sections and runtime artifact conventions", () => {
    expect(supportedLanguages).toEqual(languageCodes);
    const english = loadMultilingualStoryLocalizationSettings("en-US");
    expect(english).toContain("## English Localization");
    expect(english).not.toContain("## German Localization");

    const portuguese = loadMultilingualStoryLocalizationSettings("pt-BR");
    expect(portuguese).toContain("## Portuguese Localization");
    expect(portuguese).toContain("pt-BR");

    for (const language of supportedLanguages) {
      const profile = getLanguageProfile(language);
      expect(() => getLanguageRewriteSettings(profile.locale)).not.toThrow();
    }
  });
});
