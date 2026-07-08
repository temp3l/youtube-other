export interface StoryGenerationWarningInput {
  readonly storyModel?: string | undefined;
  readonly localizationModel?: string | undefined;
  readonly shortMaxOutputTokens?: number | undefined;
  readonly validatorMaxOutputTokens?: number | undefined;
  readonly storyMaxOutputTokens?: number | undefined;
  readonly targetWords?: number | undefined;
}

export function buildStoryGenerationWarnings(
  input: StoryGenerationWarningInput
): string[] {
  const warnings: string[] = [];
  if (
    input.shortMaxOutputTokens !== undefined &&
    input.shortMaxOutputTokens > 2_000
  ) {
    warnings.push(
      `Short max output tokens ${input.shortMaxOutputTokens} exceeds the cost-safe cap of 2000.`
    );
  }
  if (
    input.localizationModel &&
    input.storyModel &&
    input.localizationModel === input.storyModel
  ) {
    warnings.push(
      "Localization model matches the story model. This usually costs more than necessary."
    );
  }
  if (
    input.storyMaxOutputTokens !== undefined &&
    input.storyMaxOutputTokens > 7_000 &&
    (input.targetWords ?? 0) < 2_000
  ) {
    warnings.push(
      `Story max output tokens ${input.storyMaxOutputTokens} is high for a target below 2000 words.`
    );
  }
  if (
    input.validatorMaxOutputTokens !== undefined &&
    input.validatorMaxOutputTokens > 3_000
  ) {
    warnings.push(
      `Validator max output tokens ${input.validatorMaxOutputTokens} exceeds the cost-safe cap of 3000.`
    );
  }
  return warnings;
}
