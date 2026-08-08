import type OpenAI from "openai";
import {
  type HistoricalVisualDirectionProfileV1,
  getOrResolvePersistedHistoricalVisualDirectionV1,
  loadHistoryVisualPlanV35,
} from "@mediaforge/history";
import { resolveHistoricalVisualDirectionWithOpenAiV1 } from "./history-visual-direction-openai-v1.js";

export async function getOrResolveHistoricalVisualDirectionForEpisode(input: {
  readonly episodeDir: string;
  readonly episodeId: string;
  readonly refreshVisualDirection?: boolean;
  readonly client?: OpenAI;
  readonly model?: string;
}): Promise<HistoricalVisualDirectionProfileV1> {
  const plan = await loadHistoryVisualPlanV35(input.episodeDir);
  if (!plan) {
    throw new Error(
      `History visual plan is required before resolving visual direction for ${input.episodeId}.`
    );
  }
  return getOrResolvePersistedHistoricalVisualDirectionV1({
    episodeDir: input.episodeDir,
    plan,
    ...(input.refreshVisualDirection ? { refresh: true } : {}),
    resolveWithProvider: async (resolverInput) =>
      resolveHistoricalVisualDirectionWithOpenAiV1({
        resolverInput,
        ...(input.client ? { client: input.client } : {}),
        ...(input.model ? { model: input.model } : {}),
      }),
    fallbackModel: input.model ?? "deterministic-fallback",
  });
}
