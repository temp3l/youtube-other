import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { VoiceProfile } from "@mediaforge/domain";

const moduleDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(moduleDir, "../../..");
const voiceSettingsPath = path.join(repoRoot, "docs", "voice-settings.md");

const fallbackVoiceInstructions = [
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
].join(" ");

export interface SpeechVoiceSettings {
  readonly instructions: string;
  readonly profile: VoiceProfile;
  readonly model: string;
  readonly voice: string;
}

function readVoiceSettingsFile(): string {
  try {
    return fs.readFileSync(voiceSettingsPath, "utf8").trim();
  } catch {
    return fallbackVoiceInstructions;
  }
}

export interface SpeechVoiceSettingsOverrides {
  readonly model?: string;
  readonly voice?: string;
}

export function loadSpeechVoiceSettings(overrides: SpeechVoiceSettingsOverrides = {}): SpeechVoiceSettings {
  return {
    instructions: readVoiceSettingsFile(),
    model: overrides.model ?? "gpt-4o-mini-tts",
    voice: overrides.voice ?? "onyx",
    profile: {
      id: "chatgpt-calm-male-documentary",
      label: "ChatGPT calm male documentary",
      gender: "male",
      style: "calm, mature, clear, informative, warm but not theatrical",
      paceWpm: 145
    }
  };
}

export const speechVoiceSettings = loadSpeechVoiceSettings();
