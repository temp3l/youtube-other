import {
  FAST_NARRATION_WPM,
  NORMAL_NARRATION_WPM,
  resolveShortDurationProfile,
} from "./narration-constraints.js";
import { type LanguageCode, type LanguageProfile } from "./story-localization.types.js";

export const LANGUAGE_PROFILES: Readonly<Record<LanguageCode, LanguageProfile>> = {
  en: {
    code: "en",
    displayName: "English",
    locale: "en-US",
    narratorLanguageName: "English",
    defaultNarrationPace: "fast",
    narrationPaces: { normal: NORMAL_NARRATION_WPM.en, fast: FAST_NARRATION_WPM.en },
    fullNarrationWpm: FAST_NARRATION_WPM.en.full,
    shortNarrationWpm: resolveShortDurationProfile({
      language: "en",
      durationSeconds: 60,
    }).targetNarrationWpm,
    shortWordRange: resolveShortDurationProfile({
      language: "en",
      durationSeconds: 60,
    }).targetWordRange,
    stylisticGuidance: [
      "Use natural international English.",
      "Keep spoken narration clear and direct.",
      "Avoid documentary filler that does not move the story.",
      "Prefer short and medium clauses for fast narration.",
      "Avoid deeply nested sentences, repeated commas, and unnecessary ellipses.",
      "Use natural contractions when appropriate and keep names easy to pronounce.",
    ],
    defaultFullHashtags: ["#HorrorStory", "#ScaryStories", "#DarkTruthEpisodes"],
    defaultShortHashtags: ["#Shorts", "#Horror", "#DarkTruthEpisodes"],
  },
  de: {
    code: "de",
    displayName: "German",
    locale: "de-DE",
    narratorLanguageName: "German",
    defaultNarrationPace: "fast",
    narrationPaces: { normal: NORMAL_NARRATION_WPM.de, fast: FAST_NARRATION_WPM.de },
    fullNarrationWpm: FAST_NARRATION_WPM.de.full,
    shortNarrationWpm: resolveShortDurationProfile({
      language: "de",
      durationSeconds: 60,
    }).targetNarrationWpm,
    shortWordRange: resolveShortDurationProfile({
      language: "de",
      durationSeconds: 60,
    }).targetWordRange,
    stylisticGuidance: [
      "Use natural standard German.",
      "Avoid bureaucratic wording and nested clauses.",
      "Keep the narration concise and spoken.",
      "Prefer short and medium clauses for fast narration.",
      "Avoid repeated commas, ellipses, and tongue-twisting alliteration.",
    ],
    defaultFullHashtags: ["#Horrorgeschichte", "#Gruselgeschichten", "#DarkTruthEpisodes"],
    defaultShortHashtags: ["#Shorts", "#Horror", "#DarkTruthEpisodes"],
  },
  es: {
    code: "es",
    displayName: "Spanish",
    locale: "es-419",
    narratorLanguageName: "Spanish",
    defaultNarrationPace: "fast",
    narrationPaces: { normal: NORMAL_NARRATION_WPM.es, fast: FAST_NARRATION_WPM.es },
    fullNarrationWpm: FAST_NARRATION_WPM.es.full,
    shortNarrationWpm: resolveShortDurationProfile({
      language: "es",
      durationSeconds: 60,
    }).targetNarrationWpm,
    shortWordRange: resolveShortDurationProfile({
      language: "es",
      durationSeconds: 60,
    }).targetWordRange,
    stylisticGuidance: [
      "Use neutral international Spanish.",
      "Keep the language simple and natural for speech.",
      "Avoid regional slang and overly formal phrasing.",
      "Prefer short and medium clauses for fast narration.",
      "Avoid deeply nested sentences, repeated commas, and unnecessary ellipses.",
    ],
    defaultFullHashtags: ["#HistoriaDeTerror", "#HistoriasDeMiedo", "#DarkTruthEpisodes"],
    defaultShortHashtags: ["#Shorts", "#Terror", "#DarkTruthEpisodes"],
  },
  fr: {
    code: "fr",
    displayName: "French",
    locale: "fr-FR",
    narratorLanguageName: "French",
    defaultNarrationPace: "fast",
    narrationPaces: { normal: NORMAL_NARRATION_WPM.fr, fast: FAST_NARRATION_WPM.fr },
    fullNarrationWpm: FAST_NARRATION_WPM.fr.full,
    shortNarrationWpm: resolveShortDurationProfile({
      language: "fr",
      durationSeconds: 60,
    }).targetNarrationWpm,
    shortWordRange: resolveShortDurationProfile({
      language: "fr",
      durationSeconds: 60,
    }).targetWordRange,
    stylisticGuidance: [
      "Use natural international French.",
      "Keep sentences direct and easy to speak.",
      "Avoid academic or overly literary phrasing.",
      "Prefer short and medium clauses for fast narration.",
      "Avoid repeated commas, ellipses, and hard-to-pronounce name clusters.",
    ],
    defaultFullHashtags: ["#HistoireDHorreur", "#HistoiresEffrayantes", "#DarkTruthEpisodes"],
    defaultShortHashtags: ["#Shorts", "#Horreur", "#DarkTruthEpisodes"],
  },
  pt: {
    code: "pt",
    displayName: "Portuguese",
    locale: "pt-BR",
    narratorLanguageName: "Brazilian Portuguese",
    defaultNarrationPace: "fast",
    narrationPaces: { normal: NORMAL_NARRATION_WPM.pt, fast: FAST_NARRATION_WPM.pt },
    fullNarrationWpm: FAST_NARRATION_WPM.pt.full,
    shortNarrationWpm: resolveShortDurationProfile({
      language: "pt",
      durationSeconds: 60,
    }).targetNarrationWpm,
    shortWordRange: resolveShortDurationProfile({
      language: "pt",
      durationSeconds: 60,
    }).targetWordRange,
    stylisticGuidance: [
      "Use Brazilian Portuguese.",
      "Keep the narration natural and broadly understandable.",
      "Avoid European Portuguese by default.",
      "Prefer short and medium clauses for fast narration.",
      "Avoid deeply nested sentences, repeated commas, and unnecessary ellipses.",
    ],
    defaultFullHashtags: ["#HistoriaDeTerror", "#HistoriasAssustadoras", "#DarkTruthEpisodes"],
    defaultShortHashtags: ["#Shorts", "#Terror", "#DarkTruthEpisodes"],
  },
};

export function getLanguageProfile(code: LanguageCode): LanguageProfile {
  return LANGUAGE_PROFILES[code];
}

export function isShortLanguage(code: string): code is Exclude<LanguageCode, "en"> {
  return code === "de" || code === "es" || code === "fr" || code === "pt";
}
