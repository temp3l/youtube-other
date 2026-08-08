import type { RuntimeConfig } from "@mediaforge/config";
import type { NarrationPipelineStage } from "@mediaforge/speech";

type NarrationTtsConfig = Pick<
  RuntimeConfig,
  "ttsProvider" | "openAiCompatibleApiKey" | "elevenLabsApiKey"
>;

const NARRATION_TTS_ERROR =
  "OpenAI speech is required for narration generation; mocked audio is disabled.";

export function narrationStageRequiresTts(stage: NarrationPipelineStage): boolean {
  return stage === "generate" || stage === "all";
}

export function assertNarrationTtsConfigured(config: NarrationTtsConfig): void {
  if (config.ttsProvider === "mock") {
    throw new Error(NARRATION_TTS_ERROR);
  }
  if (config.ttsProvider === "openai-compatible") {
    if (!config.openAiCompatibleApiKey) {
      throw new Error(NARRATION_TTS_ERROR);
    }
    return;
  }
  if (config.ttsProvider === "elevenlabs") {
    if (!config.elevenLabsApiKey?.trim()) {
      throw new Error(
        "ElevenLabs TTS was selected, but ELEVENLABS_API_KEY is not configured."
      );
    }
    return;
  }
  throw new Error(NARRATION_TTS_ERROR);
}

export { NARRATION_TTS_ERROR };
