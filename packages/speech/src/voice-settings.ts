import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { VoiceProfile } from "@mediaforge/domain";

const moduleDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(moduleDir, "../../..");
const voiceSettingsPath = path.join(repoRoot, "docs", "voice-settings.md");

export const speechVoicePresetSchema = {
  values: ["slow", "fast"] as const
} as const;
export type SpeechVoicePreset = (typeof speechVoicePresetSchema.values)[number];

const fallbackVoiceInstructions: Record<SpeechVoicePreset, string> = {
  slow: [
    "Use a calm adult male narrator voice.",
    "Speak in natural, conversational English with a curious and thoughtful tone.",
    "Keep the delivery concise, clear, and documentary-like.",
    "Use a measured pace of approximately 145 words per minute.",
    "Pause briefly between paragraphs and after important conclusions.",
    "Emphasize contrasts such as abundance versus instability.",
    'Pronounce "Calhoun" clearly and consistently.',
    'Pronounce "Universe 25" as "Universe Twenty-Five."',
    "Avoid theatrical acting, exaggerated emotion, advertising energy, and unnaturally long pauses.",
    "Maintain consistent volume, pacing, and vocal character across all chunks."
  ].join(" "),
  fast: [
    "Use a calm adult male narrator voice.",
    "Speak in natural, conversational English with a curious, confident, and thoughtful tone.",
    "Keep the delivery brisk, clear, and documentary-like.",
    "Use a measured pace of approximately 180 words per minute.",
    "Use short, natural pauses only after major conclusions or important transitions.",
    "Emphasize contrasts such as abundance versus instability without slowing down excessively.",
    'Pronounce "Calhoun" clearly and consistently.',
    'Pronounce "Universe 25" as "Universe Twenty-Five."',
    "Avoid theatrical acting, exaggerated emotion, advertising energy, drawn-out words, and unnaturally long pauses.",
    "Maintain consistent volume, tempo, and speaking rhythm across every generated chunk."
  ].join(" ")
};

const fallbackVoiceSettingsDocument = [
  "## slow voice",
  "",
  fallbackVoiceInstructions.slow,
  "",
  "## fast voice",
  "",
  fallbackVoiceInstructions.fast
].join("\n");

function inferPresetFromHeading(heading: string): SpeechVoicePreset | null {
  const normalized = heading.trim().toLowerCase();
  if (normalized === "slow voice") {
    return "slow";
  }
  if (normalized === "fast voice") {
    return "fast";
  }
  return null;
}

function extractPresetInstructions(documentText: string, preset: SpeechVoicePreset): string | null {
  const headingRegex = /^##\s+(.+?)\s*$/gim;
  const headings = [...documentText.matchAll(headingRegex)];
  const currentHeading = headings.find((match) => inferPresetFromHeading(match[1] ?? "") === preset);
  if (!currentHeading) {
    return null;
  }
  const startIndex = (currentHeading.index ?? 0) + currentHeading[0].length;
  const nextHeading = headings.find((match) => (match.index ?? 0) > (currentHeading.index ?? 0));
  const endIndex = nextHeading?.index ?? documentText.length;
  const section = documentText.slice(startIndex, endIndex).trim();
  return section.length > 0 ? section : null;
}

function instructionsForPreset(documentText: string, preset: SpeechVoicePreset): string {
  return extractPresetInstructions(documentText, preset) ?? fallbackVoiceInstructions[preset];
}

function resolveLanguageDisplayName(languageCode: string): string {
  try {
    const displayNames = new Intl.DisplayNames(["en"], { type: "language" });
    return displayNames.of(languageCode) ?? languageCode;
  } catch {
    return languageCode;
  }
}

function buildLanguageAdjustment(languageCode?: string): string {
  if (!languageCode || languageCode.toLowerCase() === "en") {
    return "";
  }
  const languageName = resolveLanguageDisplayName(languageCode);
  return [
    `Deliver the narration in ${languageName} (${languageCode}).`,
    `Use pronunciation, rhythm, and pauses that sound natural for ${languageName}.`
  ].join(" ");
}

export interface SpeechVoiceSettings {
  readonly preset: SpeechVoicePreset;
  readonly language?: string;
  readonly instructions: string;
  readonly profile: VoiceProfile;
  readonly model: string;
  readonly voice: string;
}

function readVoiceSettingsFile(): string {
  try {
    return fs.readFileSync(voiceSettingsPath, "utf8").trim();
  } catch {
    return fallbackVoiceSettingsDocument;
  }
}

export interface SpeechVoiceSettingsOverrides {
  readonly preset?: SpeechVoicePreset;
  readonly language?: string;
  readonly model?: string;
  readonly voice?: string;
}

export function loadSpeechVoiceSettings(overrides: SpeechVoiceSettingsOverrides = {}): SpeechVoiceSettings {
  const preset = overrides.preset ?? "fast";
  const language = overrides.language;
  const instructions = [buildLanguageAdjustment(language), instructionsForPreset(readVoiceSettingsFile(), preset)].filter((part) => part.length > 0).join(" ");
  const profile =
    preset === "fast"
      ? {
          id: "chatgpt-fast-male-documentary",
          label: "ChatGPT fast male documentary",
          gender: "male" as const,
          style: "brisk, confident, clear, informative, documentary-like",
          paceWpm: 180
        }
      : {
          id: "chatgpt-calm-male-documentary",
          label: "ChatGPT calm male documentary",
          gender: "male" as const,
          style: "calm, mature, clear, informative, warm but not theatrical",
          paceWpm: 145
        };
  return {
    preset,
    ...(language ? { language } : {}),
    instructions,
    model: overrides.model ?? "gpt-4o-mini-tts",
    voice: overrides.voice ?? "onyx",
    profile
  };
}

export const speechVoiceSettings = loadSpeechVoiceSettings();
