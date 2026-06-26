import { type LanguageCode, type LanguageProfile } from "./story-localization.types.js";

export const LANGUAGE_PROFILES: Readonly<Record<LanguageCode, LanguageProfile>> = {
  en: {
    code: "en",
    displayName: "English",
    locale: "en-US",
    narratorLanguageName: "English",
    fullNarrationWpm: 178,
    shortNarrationWpm: 180,
    shortWordRange: { min: 160, target: 175, max: 190 },
    stylisticGuidance: [
      "Use natural international English.",
      "Keep spoken narration clear and direct.",
      "Avoid documentary filler that does not move the story.",
    ],
    defaultFullHashtags: ["#HorrorStory", "#ScaryStories", "#DarkTruthEpisodes"],
    defaultShortHashtags: ["#Shorts", "#Horror", "#DarkTruthEpisodes"],
  },
  de: {
    code: "de",
    displayName: "German",
    locale: "de-DE",
    narratorLanguageName: "German",
    fullNarrationWpm: 168,
    shortNarrationWpm: 170,
    shortWordRange: { min: 145, target: 165, max: 180 },
    stylisticGuidance: [
      "Use natural standard German.",
      "Avoid bureaucratic wording and nested clauses.",
      "Keep the narration concise and spoken.",
    ],
    defaultFullHashtags: ["#Horrorgeschichte", "#Gruselgeschichten", "#DarkTruthEpisodes"],
    defaultShortHashtags: ["#Shorts", "#Horror", "#DarkTruthEpisodes"],
  },
  es: {
    code: "es",
    displayName: "Spanish",
    locale: "es-419",
    narratorLanguageName: "Spanish",
    fullNarrationWpm: 175,
    shortNarrationWpm: 178,
    shortWordRange: { min: 160, target: 178, max: 195 },
    stylisticGuidance: [
      "Use neutral international Spanish.",
      "Keep the language simple and natural for speech.",
      "Avoid regional slang and overly formal phrasing.",
    ],
    defaultFullHashtags: ["#HistoriaDeTerror", "#HistoriasDeMiedo", "#DarkTruthEpisodes"],
    defaultShortHashtags: ["#Shorts", "#Terror", "#DarkTruthEpisodes"],
  },
  fr: {
    code: "fr",
    displayName: "French",
    locale: "fr-FR",
    narratorLanguageName: "French",
    fullNarrationWpm: 172,
    shortNarrationWpm: 172,
    shortWordRange: { min: 155, target: 172, max: 190 },
    stylisticGuidance: [
      "Use natural international French.",
      "Keep sentences direct and easy to speak.",
      "Avoid academic or overly literary phrasing.",
    ],
    defaultFullHashtags: ["#HistoireDHorreur", "#HistoiresEffrayantes", "#DarkTruthEpisodes"],
    defaultShortHashtags: ["#Shorts", "#Horreur", "#DarkTruthEpisodes"],
  },
  pt: {
    code: "pt",
    displayName: "Portuguese",
    locale: "pt-BR",
    narratorLanguageName: "Brazilian Portuguese",
    fullNarrationWpm: 175,
    shortNarrationWpm: 178,
    shortWordRange: { min: 160, target: 178, max: 195 },
    stylisticGuidance: [
      "Use Brazilian Portuguese.",
      "Keep the narration natural and broadly understandable.",
      "Avoid European Portuguese by default.",
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

