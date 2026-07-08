import type { RuntimeConfig } from "@mediaforge/config";
import type { NarrationPipelineStage } from "@mediaforge/speech";

type NarrationTtsConfig = Pick<
  RuntimeConfig,
  "ttsProvider" | "openAiCompatibleApiKey"
>;

const NARRATION_TTS_ERROR =
  "OpenAI speech is required for narration generation; mocked audio is disabled.";

export function narrationStageRequiresTts(stage: NarrationPipelineStage): boolean {
  return stage === "generate" || stage === "all";
}

export function assertNarrationTtsConfigured(config: NarrationTtsConfig): void {
  if (
    config.ttsProvider !== "openai-compatible" ||
    !config.openAiCompatibleApiKey
  ) {
    throw new Error(NARRATION_TTS_ERROR);
  }
}

export { NARRATION_TTS_ERROR };
