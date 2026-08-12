import { z } from "zod";

import type {
  BeatPlanPayload,
  EpisodeSpecPayload,
} from "@mediaforge/narrative-core";

const localeSchema = z.enum(["en-US", "de-DE", "es-ES", "pt-BR"]);

export const microdramaScriptLineageRefSchema = z
  .object({
    episodeId: z.string().regex(/^E\d{3}$/u),
    locale: localeSchema,
    episodeSpecRevisionId: z.string().min(1).max(160),
    beatPlanRevisionId: z.string().min(1).max(160),
    scriptRevisionId: z.string().min(1).max(160),
    boundaryRevisionId: z.string().min(1).max(160),
    proseAuthority: z.literal("script_revision"),
    hookSemanticId: z.string().min(1).max(160),
    cliffhangerSemanticId: z.string().min(1).max(160),
  })
  .strict();
export type MicrodramaScriptLineageRef = z.infer<
  typeof microdramaScriptLineageRefSchema
>;

export type MicrodramaProductionRevisionRefs = {
  episodeId: string;
  locale: z.infer<typeof localeSchema>;
  episodeSpecRevisionId: string;
  beatPlanRevisionId: string;
  scriptRevisionId: string;
  boundaryRevisionId: string;
  episodeSpec: EpisodeSpecPayload;
  beatPlan: BeatPlanPayload;
};

export function resolveMicrodramaScriptLineage(
  input: MicrodramaProductionRevisionRefs
): MicrodramaScriptLineageRef {
  return microdramaScriptLineageRefSchema.parse({
    episodeId: input.episodeId,
    locale: input.locale,
    episodeSpecRevisionId: input.episodeSpecRevisionId,
    beatPlanRevisionId: input.beatPlanRevisionId,
    scriptRevisionId: input.scriptRevisionId,
    boundaryRevisionId: input.boundaryRevisionId,
    proseAuthority: "script_revision",
    hookSemanticId: input.episodeSpec.hook.semanticId,
    cliffhangerSemanticId: input.episodeSpec.cliffhanger.semanticId,
  });
}

export function assertProseIsNotCanonical(lineage: MicrodramaScriptLineageRef): void {
  if (lineage.proseAuthority !== "script_revision") {
    throw new Error("Microdrama prose must remain bound to ScriptRevision artifacts.");
  }
}

export function lineageUsesRevisionIdsOnly(lineage: MicrodramaScriptLineageRef): boolean {
  const keys = Object.keys(lineage) as (keyof MicrodramaScriptLineageRef)[];
  return keys.every((key) => {
    const value = lineage[key];
    return typeof value === "string" || value === "script_revision";
  });
}

export const microdramaRollingPlanLineageRefSchema = z
  .object({
    episodeId: z.string().regex(/^E\d{3}$/u),
    rollingPlanRevisionId: z.string().min(1).max(160),
    episodeSpecRevisionId: z.string().min(1).max(160),
    beatPlanRevisionId: z.string().min(1).max(160),
    boundaryRevisionId: z.string().min(1).max(160),
    pendingScriptRevisionId: z.string().min(1).max(160),
    proseAuthority: z.literal("pending_script"),
    hookSemanticId: z.string().min(1).max(160),
    cliffhangerSemanticId: z.string().min(1).max(160),
  })
  .strict();
export type MicrodramaRollingPlanLineageRef = z.infer<
  typeof microdramaRollingPlanLineageRefSchema
>;

export type MicrodramaRollingPlanProductionRevisionRefs = {
  episodeId: string;
  rollingPlanRevisionId: string;
  episodeSpecRevisionId: string;
  beatPlanRevisionId: string;
  boundaryRevisionId: string;
  pendingScriptRevisionId: string;
  episodeSpec: EpisodeSpecPayload;
  beatPlan: BeatPlanPayload;
};

export function resolveMicrodramaRollingPlanLineage(
  input: MicrodramaRollingPlanProductionRevisionRefs
): MicrodramaRollingPlanLineageRef {
  return microdramaRollingPlanLineageRefSchema.parse({
    episodeId: input.episodeId,
    rollingPlanRevisionId: input.rollingPlanRevisionId,
    episodeSpecRevisionId: input.episodeSpecRevisionId,
    beatPlanRevisionId: input.beatPlanRevisionId,
    boundaryRevisionId: input.boundaryRevisionId,
    pendingScriptRevisionId: input.pendingScriptRevisionId,
    proseAuthority: "pending_script",
    hookSemanticId: input.episodeSpec.hook.semanticId,
    cliffhangerSemanticId: input.episodeSpec.cliffhanger.semanticId,
  });
}

export function rollingPlanLineageUsesRevisionIdsOnly(
  lineage: MicrodramaRollingPlanLineageRef
): boolean {
  const keys = Object.keys(lineage) as (keyof MicrodramaRollingPlanLineageRef)[];
  return keys.every((key) => {
    const value = lineage[key];
    return typeof value === "string" || value === "pending_script";
  });
}
