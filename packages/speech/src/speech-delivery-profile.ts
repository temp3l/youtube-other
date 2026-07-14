import { z } from "zod";
import type { OpenAiSpeechOutputFormat } from "./openai-tts-request.js";

export const educationalSpeechLanguageSchema = z.enum([
  "de",
  "en",
  "es",
  "fr",
  "pt",
]);
export type EducationalSpeechLanguage = z.infer<
  typeof educationalSpeechLanguageSchema
>;

export const educationalPauseKindSchema = z.enum([
  "micro",
  "step-transition",
  "board-reading",
  "result-reveal",
  "section-transition",
]);
export type EducationalPauseKind = z.infer<
  typeof educationalPauseKindSchema
>;

export const educationalNarrationBeatKindSchema = z.enum([
  "introduction",
  "problem-statement",
  "definition",
  "explanation",
  "calculation-step",
  "intermediate-result",
  "warning",
  "guided-practice",
  "think-pause",
  "final-answer",
  "recap",
]);
export type EducationalNarrationBeatKind = z.infer<
  typeof educationalNarrationBeatKindSchema
>;

export const speechDeliveryProfileIdSchema = z.enum([
  "education-natural-teacher",
  "education-legacy-baseline",
]);
export type SpeechDeliveryProfileId = z.infer<
  typeof speechDeliveryProfileIdSchema
>;

export interface PauseDurationRange {
  readonly minMs: number;
  readonly maxMs: number;
}

export type PausePolicy = Readonly<
  Record<EducationalPauseKind, PauseDurationRange>
>;

export interface ChunkingPolicy {
  readonly version: string;
  readonly preferredDurationMs: PauseDurationRange;
  readonly targetDurationMs: number;
  readonly minimumTextCharacters: number;
  readonly maximumTextCharacters: number;
  readonly hardMaximumTextCharacters: number;
  readonly preferCompleteParagraphs: boolean;
  readonly contextWords: number;
}

export interface AudioPostProcessingPolicy {
  readonly version: string;
  readonly outputFormat: OpenAiSpeechOutputFormat;
  readonly providerSampleRateHz: number;
  readonly assemblySampleRateHz: number;
  readonly channels: 1;
  readonly crossfadeMs: number;
  readonly targetLoudnessLufs: number;
  readonly truePeakLimitDb: number;
  readonly tempoCorrection: {
    readonly enabled: boolean;
    readonly safeRatio: { readonly min: number; readonly max: number };
    readonly outOfRange: "warn" | "fail";
  };
}

export interface SpeechDeliveryProfile {
  readonly id: SpeechDeliveryProfileId;
  readonly version: string;
  readonly description: string;
  readonly language: EducationalSpeechLanguage;
  readonly instructions: string;
  readonly targetWordsPerMinute?: number;
  readonly model: string;
  readonly modelSnapshot?: string;
  readonly voice: string;
  readonly providerSpeed: number;
  readonly pausePolicy: PausePolicy;
  readonly chunkingPolicy: ChunkingPolicy;
  readonly postProcessingPolicy: AudioPostProcessingPolicy;
  readonly pronunciationDictionaryVersion: string;
  readonly presentationPresetId: "chalkboard-natural-teacher-v1";
}

export interface ResolveSpeechDeliveryProfileOptions {
  readonly model?: string;
  readonly modelSnapshot?: string;
  readonly voice?: string;
  readonly targetWordsPerMinute?: number;
  readonly providerSpeed?: number;
}

export const EDUCATION_NATURAL_TEACHER_PROFILE_VERSION =
  "education-natural-teacher.v1" as const;
export const EDUCATION_LEGACY_BASELINE_PROFILE_VERSION =
  "education-legacy-baseline.v1" as const;

const instructionsByLanguage: Readonly<
  Record<EducationalSpeechLanguage, readonly string[]>
> = {
  en: [
    "Speak like an experienced secondary-school mathematics teacher explaining a problem while writing naturally on a board.",
    "Use a calm, conversational, patient delivery with subtle changes in rhythm, pacing, and emphasis.",
    "Do not sound like an announcer, commercial voice-over, newsreader, audiobook narrator, customer-service assistant, or exaggerated children's presenter.",
    "Pause naturally after a new concept, before an important result, between calculation steps, while the viewer inspects the board, and after a rhetorical question.",
    "Slightly emphasize mathematical terms, changed values, operators, intermediate results, and final answers, but do not emphasize every sentence.",
    "Allow small natural imperfections in timing. Speak clearly without over-articulating or sounding excessively polished.",
    "Keep the intensity steady. Sound confident, approachable, and human.",
  ],
  de: [
    "Sprich wie eine erfahrene Mathematiklehrkraft an einer weiterführenden Schule, die eine Aufgabe erklärt und dabei natürlich an die Tafel schreibt.",
    "Sprich ruhig, geduldig und im Gesprächston, mit kleinen natürlichen Unterschieden in Rhythmus, Tempo und Betonung.",
    "Klinge nicht wie ein Ansager, Werbesprecher, Nachrichtensprecher, Hörbucherzähler, Kundendienst oder übertriebener Kinderanimateur.",
    "Mache natürliche Pausen nach einem neuen Begriff, vor einem wichtigen Ergebnis, zwischen Rechenschritten, während die Tafel betrachtet wird und nach einer rhetorischen Frage.",
    "Betone mathematische Begriffe, veränderte Werte, Operatoren, Zwischenergebnisse und Endergebnisse leicht, aber nicht jeden Satz.",
    "Lass kleine natürliche Unregelmäßigkeiten im Timing zu. Sprich deutlich, aber nicht überartikuliert oder übermäßig perfekt.",
    "Steigere die Intensität nicht fortlaufend. Klinge sicher, zugänglich und menschlich.",
  ],
  es: [
    "Habla como un profesor de matemáticas de secundaria con experiencia que explica un problema mientras escribe de forma natural en la pizarra.",
    "Usa una voz tranquila, conversacional y paciente, con pequeñas variaciones naturales de ritmo, velocidad y énfasis.",
    "No suenes como locutor, voz publicitaria, presentador de noticias, narrador de audiolibro, agente de atención al cliente ni animador infantil exagerado.",
    "Haz pausas naturales después de presentar un concepto, antes de un resultado importante, entre pasos de cálculo, mientras se observa la pizarra y después de una pregunta retórica.",
    "Destaca ligeramente los términos matemáticos, los valores que cambian, los operadores, los resultados intermedios y la respuesta final, pero no todas las frases.",
    "Permite pequeñas imperfecciones naturales en el tiempo. Habla con claridad sin articular de forma excesiva.",
    "No aumentes la intensidad continuamente. Suena seguro, cercano y humano.",
  ],
  fr: [
    "Parle comme un professeur de mathématiques expérimenté du secondaire qui explique un problème tout en écrivant naturellement au tableau.",
    "Adopte un ton calme, conversationnel et patient, avec de petites variations naturelles de rythme, de débit et d'accentuation.",
    "Ne prends pas la voix d'un annonceur, d'une publicité, d'un présentateur de journal, d'un livre audio, d'un service client ou d'un animateur pour enfants exagéré.",
    "Marque des pauses naturelles après un nouveau concept, avant un résultat important, entre les étapes de calcul, pendant l'observation du tableau et après une question rhétorique.",
    "Souligne légèrement les termes mathématiques, les valeurs modifiées, les opérateurs, les résultats intermédiaires et la réponse finale, sans accentuer chaque phrase.",
    "Garde de petites irrégularités naturelles dans le timing. Articule clairement sans paraître trop travaillé.",
    "N'augmente pas continuellement l'intensité. Reste assuré, accessible et humain.",
  ],
  pt: [
    "Fale como um professor experiente de matemática do ensino secundário que explica um problema enquanto escreve naturalmente no quadro.",
    "Use uma entrega calma, conversacional e paciente, com pequenas variações naturais de ritmo, velocidade e ênfase.",
    "Não soe como locutor, voz de publicidade, apresentador de notícias, narrador de audiolivro, atendente ou animador infantil exagerado.",
    "Faça pausas naturais depois de um novo conceito, antes de um resultado importante, entre etapas do cálculo, enquanto o quadro é observado e depois de uma pergunta retórica.",
    "Dê leve ênfase aos termos matemáticos, valores alterados, operadores, resultados intermediários e resposta final, mas não a todas as frases.",
    "Permita pequenas imperfeições naturais no tempo. Fale com clareza sem articulação excessivamente polida.",
    "Não aumente a intensidade continuamente. Soe confiante, acessível e humano.",
  ],
};

const pausePolicy: PausePolicy = {
  micro: { minMs: 100, maxMs: 250 },
  "step-transition": { minMs: 300, maxMs: 500 },
  "board-reading": { minMs: 500, maxMs: 900 },
  "result-reveal": { minMs: 350, maxMs: 650 },
  "section-transition": { minMs: 600, maxMs: 1_000 },
};

const chunkingPolicy: ChunkingPolicy = {
  version: "education-semantic-chunking.v1",
  preferredDurationMs: { minMs: 20_000, maxMs: 45_000 },
  targetDurationMs: 30_000,
  minimumTextCharacters: 140,
  maximumTextCharacters: 3_000,
  hardMaximumTextCharacters: 4_096,
  preferCompleteParagraphs: true,
  contextWords: 18,
};

const postProcessingPolicy: AudioPostProcessingPolicy = {
  version: "education-audio-post.v1",
  outputFormat: "wav",
  providerSampleRateHz: 24_000,
  assemblySampleRateHz: 48_000,
  channels: 1,
  crossfadeMs: 30,
  targetLoudnessLufs: -17,
  truePeakLimitDb: -2,
  tempoCorrection: {
    enabled: false,
    safeRatio: { min: 0.97, max: 1.03 },
    outOfRange: "warn",
  },
};

const dictionaryVersions: Readonly<Record<EducationalSpeechLanguage, string>> = {
  de: "education-math-pronunciation-de.v1",
  en: "education-math-pronunciation-en.v1",
  es: "education-math-pronunciation-es.v1",
  fr: "education-math-pronunciation-fr.v1",
  pt: "education-math-pronunciation-pt.v1",
};

const naturalTeacherVoices: Readonly<
  Record<EducationalSpeechLanguage, "cedar" | "marin">
> = {
  en: "cedar",
  de: "marin",
  es: "cedar",
  fr: "marin",
  pt: "cedar",
};

function assertTargetWordsPerMinute(value: number): number {
  if (!Number.isFinite(value) || value < 80 || value > 220) {
    throw new Error("Educational speech rate must be between 80 and 220 words per minute.");
  }
  return value;
}

function assertProviderSpeed(value: number): number {
  if (!Number.isFinite(value) || value < 0.8 || value > 1.2) {
    throw new Error("Educational provider speed must remain between 0.8 and 1.2.");
  }
  return value;
}

export function resolveSpeechDeliveryProfile(
  profileId: SpeechDeliveryProfileId,
  languageInput: EducationalSpeechLanguage,
  overrides: ResolveSpeechDeliveryProfileOptions = {}
): SpeechDeliveryProfile {
  const id = speechDeliveryProfileIdSchema.parse(profileId);
  const language = educationalSpeechLanguageSchema.parse(languageInput);
  const targetWordsPerMinute = assertTargetWordsPerMinute(
    overrides.targetWordsPerMinute ?? (id === "education-natural-teacher" ? 150 : 165)
  );
  const providerSpeed = assertProviderSpeed(overrides.providerSpeed ?? 1);
  const rateInstruction =
    language === "de"
      ? `Halte im Durchschnitt ungefähr ${targetWordsPerMinute} Wörter pro Minute.`
      : language === "es"
        ? `Mantén una media aproximada de ${targetWordsPerMinute} palabras por minuto.`
        : language === "fr"
          ? `Maintiens un débit moyen d'environ ${targetWordsPerMinute} mots par minute.`
          : language === "pt"
            ? `Mantenha uma média aproximada de ${targetWordsPerMinute} palavras por minuto.`
            : `Maintain an average rate of approximately ${targetWordsPerMinute} words per minute.`;
  const instructions = id === "education-natural-teacher"
    ? [...instructionsByLanguage[language], rateInstruction].join(" ")
    : {
        de: `Lies den Bildungstext gleichmäßig, deutlich und vollständig vor. ${rateInstruction}`,
        en: `Read the educational text evenly, clearly, and completely. ${rateInstruction}`,
        es: `Lee el texto educativo de manera uniforme, clara y completa. ${rateInstruction}`,
        fr: `Lis le texte pédagogique de façon régulière, claire et complète. ${rateInstruction}`,
        pt: `Leia o texto educativo de forma uniforme, clara e completa. ${rateInstruction}`,
      }[language];
  return {
    id,
    version:
      id === "education-natural-teacher"
        ? EDUCATION_NATURAL_TEACHER_PROFILE_VERSION
        : EDUCATION_LEGACY_BASELINE_PROFILE_VERSION,
    description:
      id === "education-natural-teacher"
        ? "Calm, conversational secondary-school teacher delivery synchronized to progressive board work."
        : "Manual evaluation baseline approximating the previous generic, even educational read.",
    language,
    instructions,
    targetWordsPerMinute,
    model: overrides.model ?? "gpt-4o-mini-tts",
    ...(overrides.modelSnapshot
      ? { modelSnapshot: overrides.modelSnapshot }
      : {}),
    voice:
      overrides.voice ??
      (id === "education-natural-teacher"
        ? naturalTeacherVoices[language]
        : "onyx"),
    providerSpeed,
    pausePolicy,
    chunkingPolicy,
    postProcessingPolicy,
    pronunciationDictionaryVersion: dictionaryVersions[language],
    presentationPresetId: "chalkboard-natural-teacher-v1",
  };
}
