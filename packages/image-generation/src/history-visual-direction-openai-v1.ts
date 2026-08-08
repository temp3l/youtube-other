import OpenAI from "openai";
import { z } from "zod";
import {
  HISTORY_VISUAL_DIRECTION_SCHEMA_V1,
  type VisualDirectionResolverInputV1,
  globalVisualDirectionSchemaV1,
  sceneVisualDirectionSchemaV1,
} from "@mediaforge/history";

const VISUAL_DIRECTION_STABLE_PREFIX_V1 = [
  "You are a historical documentary visual-direction planner.",
  "Derive episode-level camera, lighting, composition, and aesthetic direction from the supplied historical context.",
  "Historical constraints override aesthetic choices.",
  "Do not select photographic equipment merely because it is aesthetically popular.",
  "For periods predating photography, lens terminology describes virtual perspective only and must not imply historical photography.",
  "Do not fabricate missing facts; stay conservative when evidence is incomplete.",
  "Return only scene overrides that differ from the global profile.",
].join(" ");

const openAiVisualDirectionBodySchema = z
  .object({
    global: globalVisualDirectionSchemaV1,
    scenes: z.array(sceneVisualDirectionSchemaV1).optional(),
  })
  .strict();

function buildDynamicPayload(input: VisualDirectionResolverInputV1): string {
  return JSON.stringify(
    {
      episodeId: input.episodeId,
      title: input.title,
      trustSnapshotHash: input.trustSnapshotHash,
      periods: input.periods,
      geographies: input.geographies,
      personReferences: input.personReferences,
      sceneSummaries: input.sceneSummaries,
    },
    null,
    2
  );
}

export function resolveDefaultVisualDirectionModel(env: NodeJS.ProcessEnv = process.env): string {
  return (
    env["OPENAI_VISUAL_DIRECTION_MODEL"] ??
    env["OPENAI_STORY_MODEL"] ??
    "gpt-4.1-mini"
  );
}

export async function resolveHistoricalVisualDirectionWithOpenAiV1(input: {
  readonly resolverInput: VisualDirectionResolverInputV1;
  readonly client?: OpenAI;
  readonly model?: string;
  readonly apiKey?: string;
}): Promise<{
  readonly schemaVersion: typeof HISTORY_VISUAL_DIRECTION_SCHEMA_V1;
  readonly global: z.infer<typeof globalVisualDirectionSchemaV1>;
  readonly scenes?: z.infer<typeof sceneVisualDirectionSchemaV1>[];
}> {
  const apiKey = input.apiKey ?? process.env["OPENAI_API_KEY"];
  if (!apiKey || apiKey === "dry-run") {
    throw new Error("OpenAI visual-direction resolver unavailable (missing API key or dry-run).");
  }
  const client = input.client ?? new OpenAI({ apiKey });
  const model = input.model ?? resolveDefaultVisualDirectionModel();
  const schema = z.toJSONSchema(openAiVisualDirectionBodySchema) as Record<string, unknown>;
  delete schema["$schema"];
  const response = await client.responses.create({
    model,
    max_output_tokens: 4096,
    input: [
      {
        role: "system",
        content: [{ type: "input_text", text: VISUAL_DIRECTION_STABLE_PREFIX_V1 }],
      },
      {
        role: "user",
        content: [{ type: "input_text", text: buildDynamicPayload(input.resolverInput) }],
      },
    ],
    text: {
      format: {
        type: "json_schema",
        name: "history_visual_direction_v1",
        strict: true,
        schema,
      },
    },
  });
  const parsed = openAiVisualDirectionBodySchema.parse(
    JSON.parse(response.output_text ?? "null") as unknown
  );
  return {
    schemaVersion: HISTORY_VISUAL_DIRECTION_SCHEMA_V1,
    global: parsed.global,
    ...(parsed.scenes ? { scenes: parsed.scenes } : {}),
  };
}
