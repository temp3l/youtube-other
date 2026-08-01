import {
  FAST_NARRATION_WPM,
  NORMAL_NARRATION_WPM,
  resolveShortDurationProfile,
} from "./narration-constraints.js";
import {
  type LanguageCode,
  type LanguageProfile,
} from "./story-localization.types.js";

export const LANGUAGE_PROFILE_REGISTRY_VERSION = "language-profiles-v2";

const FULL_LOCALIZATION_LENGTH_POLICY = {
  minDurationRatio: 0.85,
  maxDurationRatio: 1.15,
  minSceneCoverageRatio: 1,
  maxEnglishLeakageRatio: 0.08,
} as const;

export const LANGUAGE_PROFILES: Readonly<
  Record<LanguageCode, LanguageProfile>
> = {
  en: {
    code: "en",
    displayName: "English",
    locale: "en-US",
    narratorLanguageName: "English",
    defaultNarrationPace: "fast",
    narrationPaces: {
      normal: NORMAL_NARRATION_WPM.en,
      fast: FAST_NARRATION_WPM.en,
    },
    fullNarrationWpm: FAST_NARRATION_WPM.en.full,
    shortNarrationWpm: resolveShortDurationProfile({
      language: "en",
      durationSeconds: 60,
    }).targetNarrationWpm,
    shortWordRange: resolveShortDurationProfile({
      language: "en",
      durationSeconds: 60,
    }).targetWordRange,
    localizationLengthPolicy: FULL_LOCALIZATION_LENGTH_POLICY,
    fullProductionInstructions: [
      "Use one consistent adult narrator.",
      "Speak in natural English with a restrained dark-documentary tone.",
      "Begin calmly and build tension steadily.",
      "Keep dialogue grounded and believable.",
      "Keep sound effects below narration.",
      "Use silence briefly before the final reveal.",
    ],
    shortProductionInstructions: [
      "Use the same narrator as the full episode.",
      "Speak in natural English.",
      "Begin immediately without a channel introduction.",
      "Keep the delivery restrained and credible.",
      "Pause briefly before the final sentence.",
      "Do not narrate headings or metadata.",
    ],
    stylisticGuidance: [
      "Use natural international English.",
      "Keep spoken narration clear and direct.",
      "Avoid documentary filler that does not move the story.",
      "Prefer short and medium clauses for fast narration.",
      "Avoid deeply nested sentences, repeated commas, and unnecessary ellipses.",
      "Use natural contractions when appropriate and keep names easy to pronounce.",
    ],
    defaultFullHashtags: [
      "#HorrorStory",
      "#ScaryStories",
      "#DarkTruthEpisodes",
    ],
    defaultShortHashtags: ["#Shorts", "#Horror", "#DarkTruthEpisodes"],
  },
  de: {
    code: "de",
    displayName: "German",
    locale: "de-DE",
    narratorLanguageName: "German",
    defaultNarrationPace: "fast",
    narrationPaces: {
      normal: NORMAL_NARRATION_WPM.de,
      fast: FAST_NARRATION_WPM.de,
    },
    fullNarrationWpm: FAST_NARRATION_WPM.de.full,
    shortNarrationWpm: resolveShortDurationProfile({
      language: "de",
      durationSeconds: 60,
    }).targetNarrationWpm,
    shortWordRange: resolveShortDurationProfile({
      language: "de",
      durationSeconds: 60,
    }).targetWordRange,
    localizationLengthPolicy: FULL_LOCALIZATION_LENGTH_POLICY,
    fullProductionInstructions: [
      "Eine durchgehend gleichbleibende erwachsene Erzählstimme verwenden.",
      "In natürlichem Deutsch mit zurückhaltendem, düster-dokumentarischem Ton sprechen.",
      "Ruhig beginnen und die Spannung stetig steigern.",
      "Dialoge glaubwürdig und bodenständig halten.",
      "Geräusche leiser als die Erzählung mischen.",
      "Vor der letzten Enthüllung kurz schweigen.",
    ],
    shortProductionInstructions: [
      "Dieselbe Erzählstimme wie in der vollständigen Episode verwenden.",
      "In natürlichem Deutsch sprechen.",
      "Ohne Kanaleinleitung sofort beginnen.",
      "Zurückhaltend und glaubwürdig vortragen.",
      "Vor dem letzten Satz kurz pausieren.",
      "Überschriften und Metadaten nicht vorlesen.",
    ],
    stylisticGuidance: [
      "Use natural standard German.",
      "Avoid bureaucratic wording and nested clauses.",
      "Keep the narration concise and spoken.",
      "Prefer short and medium clauses for fast narration.",
      "Avoid repeated commas, ellipses, and tongue-twisting alliteration.",
    ],
    defaultFullHashtags: [
      "#Horrorgeschichte",
      "#Gruselgeschichten",
      "#DarkTruthEpisodes",
    ],
    defaultShortHashtags: ["#Shorts", "#Horror", "#DarkTruthEpisodes"],
  },
  es: {
    code: "es",
    displayName: "Spanish",
    locale: "es-419",
    narratorLanguageName: "Spanish",
    defaultNarrationPace: "fast",
    narrationPaces: {
      normal: NORMAL_NARRATION_WPM.es,
      fast: FAST_NARRATION_WPM.es,
    },
    fullNarrationWpm: FAST_NARRATION_WPM.es.full,
    shortNarrationWpm: resolveShortDurationProfile({
      language: "es",
      durationSeconds: 60,
    }).targetNarrationWpm,
    shortWordRange: resolveShortDurationProfile({
      language: "es",
      durationSeconds: 60,
    }).targetWordRange,
    localizationLengthPolicy: FULL_LOCALIZATION_LENGTH_POLICY,
    fullProductionInstructions: [
      "Usar una sola voz narradora adulta y constante.",
      "Hablar en español natural con un tono documental oscuro y contenido.",
      "Comenzar con calma y aumentar la tensión de forma constante.",
      "Mantener los diálogos creíbles y naturales.",
      "Mantener los efectos de sonido por debajo de la narración.",
      "Hacer un breve silencio antes de la revelación final.",
    ],
    shortProductionInstructions: [
      "Usar la misma voz narradora que en el episodio completo.",
      "Hablar en español natural.",
      "Comenzar de inmediato, sin introducción del canal.",
      "Mantener una interpretación contenida y creíble.",
      "Hacer una breve pausa antes de la última frase.",
      "No narrar encabezados ni metadatos.",
    ],
    stylisticGuidance: [
      "Use neutral international Spanish.",
      "Keep the language simple and natural for speech.",
      "Avoid regional slang and overly formal phrasing.",
      "Prefer short and medium clauses for fast narration.",
      "Avoid deeply nested sentences, repeated commas, and unnecessary ellipses.",
    ],
    defaultFullHashtags: [
      "#HistoriaDeTerror",
      "#HistoriasDeMiedo",
      "#DarkTruthEpisodes",
    ],
    defaultShortHashtags: ["#Shorts", "#Terror", "#DarkTruthEpisodes"],
  },
  fr: {
    code: "fr",
    displayName: "French",
    locale: "fr-FR",
    narratorLanguageName: "French",
    defaultNarrationPace: "fast",
    narrationPaces: {
      normal: NORMAL_NARRATION_WPM.fr,
      fast: FAST_NARRATION_WPM.fr,
    },
    fullNarrationWpm: FAST_NARRATION_WPM.fr.full,
    shortNarrationWpm: resolveShortDurationProfile({
      language: "fr",
      durationSeconds: 60,
    }).targetNarrationWpm,
    shortWordRange: resolveShortDurationProfile({
      language: "fr",
      durationSeconds: 60,
    }).targetWordRange,
    localizationLengthPolicy: FULL_LOCALIZATION_LENGTH_POLICY,
    fullProductionInstructions: [
      "Utiliser une seule voix adulte cohérente.",
      "Parler dans un français naturel, avec un ton documentaire sombre et retenu.",
      "Commencer calmement et faire monter la tension progressivement.",
      "Garder les dialogues crédibles et naturels.",
      "Maintenir les effets sonores sous le niveau de la narration.",
      "Marquer un bref silence avant la révélation finale.",
    ],
    shortProductionInstructions: [
      "Utiliser la même voix que pour l’épisode complet.",
      "Parler dans un français naturel.",
      "Commencer immédiatement, sans introduction de chaîne.",
      "Garder une interprétation retenue et crédible.",
      "Faire une brève pause avant la dernière phrase.",
      "Ne pas lire les titres ni les métadonnées.",
    ],
    stylisticGuidance: [
      "Use natural international French.",
      "Keep sentences direct and easy to speak.",
      "Avoid academic or overly literary phrasing.",
      "Prefer short and medium clauses for fast narration.",
      "Avoid repeated commas, ellipses, and hard-to-pronounce name clusters.",
    ],
    defaultFullHashtags: [
      "#HistoireDHorreur",
      "#HistoiresEffrayantes",
      "#DarkTruthEpisodes",
    ],
    defaultShortHashtags: ["#Shorts", "#Horreur", "#DarkTruthEpisodes"],
  },
  it: {
    code: "it",
    displayName: "Italian",
    locale: "it-IT",
    narratorLanguageName: "Italian",
    defaultNarrationPace: "fast",
    narrationPaces: { normal: NORMAL_NARRATION_WPM.it, fast: FAST_NARRATION_WPM.it },
    fullNarrationWpm: FAST_NARRATION_WPM.it.full,
    shortNarrationWpm: resolveShortDurationProfile({ language: "it", durationSeconds: 60 }).targetNarrationWpm,
    shortWordRange: resolveShortDurationProfile({ language: "it", durationSeconds: 60 }).targetWordRange,
    localizationLengthPolicy: FULL_LOCALIZATION_LENGTH_POLICY,
    fullProductionInstructions: [
      "Usare una sola voce narrante adulta e coerente.",
      "Parlare in italiano naturale con un tono editoriale chiaro e misurato.",
      "Presentare argomenti e transizioni con ritmo naturale.",
      "Mantenere esempi e citazioni fedeli alle fonti approvate.",
      "Usare pause brevi solo per rendere chiari i passaggi importanti.",
      "Concludere con una sintesi precisa, senza enfasi drammatica.",
    ],
    shortProductionInstructions: [
      "Usare la stessa voce narrante dell'episodio completo.",
      "Parlare in italiano naturale.",
      "Iniziare subito, senza introduzione del canale.",
      "Mantenere un'interpretazione misurata e credibile.",
      "Fare una breve pausa prima dell'ultima frase.",
      "Non leggere titoli o metadati.",
    ],
    stylisticGuidance: [
      "Use natural contemporary Italian.",
      "Keep protected names, dates, quotations, and source terms unchanged unless an approved glossary says otherwise.",
      "Prefer direct spoken clauses and avoid literary ornament that changes meaning.",
      "Avoid regional slang, repeated commas, ellipses, and difficult consonant clusters.",
    ],
    // Creator packages supply reviewed metadata; the locale profile never adds tags.
    defaultFullHashtags: [],
    defaultShortHashtags: [],
  },
  pt: {
    code: "pt",
    displayName: "Portuguese",
    locale: "pt-BR",
    narratorLanguageName: "Brazilian Portuguese",
    defaultNarrationPace: "fast",
    narrationPaces: {
      normal: NORMAL_NARRATION_WPM.pt,
      fast: FAST_NARRATION_WPM.pt,
    },
    fullNarrationWpm: FAST_NARRATION_WPM.pt.full,
    shortNarrationWpm: resolveShortDurationProfile({
      language: "pt",
      durationSeconds: 60,
    }).targetNarrationWpm,
    shortWordRange: resolveShortDurationProfile({
      language: "pt",
      durationSeconds: 60,
    }).targetWordRange,
    localizationLengthPolicy: FULL_LOCALIZATION_LENGTH_POLICY,
    fullProductionInstructions: [
      "Usar uma única voz adulta e consistente.",
      "Falar em português brasileiro natural, com tom documental sombrio e contido.",
      "Começar com calma e aumentar a tensão gradualmente.",
      "Manter os diálogos naturais e convincentes.",
      "Manter os efeitos sonoros abaixo da narração.",
      "Fazer um breve silêncio antes da revelação final.",
    ],
    shortProductionInstructions: [
      "Usar a mesma voz do episódio completo.",
      "Falar em português brasileiro natural.",
      "Começar imediatamente, sem introdução do canal.",
      "Manter uma interpretação contida e convincente.",
      "Fazer uma breve pausa antes da última frase.",
      "Não narrar títulos nem metadados.",
    ],
    stylisticGuidance: [
      "Use Brazilian Portuguese.",
      "Keep the narration natural and broadly understandable.",
      "Avoid European Portuguese by default.",
      "Prefer short and medium clauses for fast narration.",
      "Avoid deeply nested sentences, repeated commas, and unnecessary ellipses.",
    ],
    defaultFullHashtags: [
      "#HistoriaDeTerror",
      "#HistoriasAssustadoras",
      "#DarkTruthEpisodes",
    ],
    defaultShortHashtags: ["#Shorts", "#Terror", "#DarkTruthEpisodes"],
  },
};

export function getLanguageProfile(code: LanguageCode): LanguageProfile {
  return LANGUAGE_PROFILES[code];
}

export function isShortLanguage(
  code: string
): code is Exclude<LanguageCode, "en"> {
  return code === "de" || code === "es" || code === "fr" || code === "it" || code === "pt";
}
