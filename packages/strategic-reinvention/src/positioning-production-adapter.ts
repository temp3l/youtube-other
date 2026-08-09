import fs from "node:fs/promises";
import path from "node:path";
import {
  episodeManifestSchema,
  scenePlanSchema,
  type ScenePlan,
} from "@mediaforge/domain";
import {
  fileExists,
  normalizeEpisodeId,
  normalizeWhitespace,
  writeJsonAtomic,
  writeTextAtomic,
} from "@mediaforge/shared";
import { z } from "zod";

export const POSITIONING_PRODUCTION_ADAPTER_VERSION =
  "veronicabenini-positioning-production-adapter.v1" as const;

const productionSceneSchema = z.object({
  sceneId: z.string().min(1),
  progressionStage: z.string().min(1),
  narrationAnchor: z.string().min(1),
  startMs: z.number().int().nonnegative(),
  durationMs: z.number().int().positive(),
  treatment: z.object({
    narrativeBeat: z.string().min(1),
    communicationIntent: z.string().min(1),
    subjectRequirement: z.string().min(1),
    environment: z.string().min(1),
    composition: z.string().min(1),
    camera: z.string().min(1),
    lighting: z.string().min(1),
    action: z.string().min(1),
    props: z.array(z.string()),
  }).passthrough(),
}).passthrough();

const productionAssetSchema = z.object({
  sceneId: z.string().min(1),
  prompt: z.string().min(1),
  nativeAspectRatio: z.enum(["16:9", "9:16"]),
  textFree: z.literal(true),
  textInGeneratedImage: z.literal(false),
}).passthrough();

export const positioningProductionPlanSchema = z.object({
  schemaVersion: z.literal("veronicabenini-positioning-visual-plan.v2"),
  contentId: z.string().min(1),
  format: z.enum(["long", "short"]),
  aspectRatio: z.enum(["16:9", "9:16"]),
  scenes: z.array(productionSceneSchema).min(1),
  assets: z.array(productionAssetSchema).min(1),
  validation: z.object({ status: z.literal("pass") }).passthrough(),
  planHash: z.string().regex(/^[a-f0-9]{64}$/u),
}).passthrough();

export type PositioningProductionPlan = z.infer<
  typeof positioningProductionPlanSchema
>;

export interface PreparePositioningProductionEpisodeInput {
  readonly workspaceRoot: string;
  readonly episodeId: string;
  readonly planPath?: string;
  readonly scriptPath?: string;
  readonly language: "en" | "de" | "es" | "fr" | "pt" | "it";
  readonly variant: "full" | "short";
}

export interface PreparePositioningProductionEpisodeResult {
  readonly schemaVersion: typeof POSITIONING_PRODUCTION_ADAPTER_VERSION;
  readonly episodeId: string;
  readonly contentId: string;
  readonly language: string;
  readonly variant: "full" | "short";
  readonly planPath: string;
  readonly scriptPath: string;
  readonly manifestPath: string;
  readonly scenePlanPath: string;
  readonly sceneCount: number;
}

function defaultScriptPath(
  episodeDir: string,
  language: string,
  variant: "full" | "short",
): string {
  return variant === "short"
    ? path.join(episodeDir, "languages", "short", `script-${language}.md`)
    : path.join(episodeDir, "languages", `script-${language}.md`);
}

function splitNarration(narration: string, count: number): readonly string[] {
  const normalized = normalizeWhitespace(
    narration.replace(/^---[\s\S]*?---\s*/u, "").replace(/^#{1,6}\s+.*$/gmu, ""),
  );
  if (!normalized) {
    throw new Error("Veronica production preparation requires non-empty narration.");
  }
  const sentences = normalized
    .split(/(?<=[.!?…])\s+/u)
    .map((entry) => normalizeWhitespace(entry))
    .filter(Boolean);
  const units = sentences.length > 0 ? sentences : [normalized];
  const chunks = Array.from({ length: count }, () => "");
  const totalWords = units.reduce(
    (sum, unit) => sum + unit.split(/\s+/u).filter(Boolean).length,
    0,
  );
  let sceneIndex = 0;
  let assignedWords = 0;
  for (const unit of units) {
    const remainingScenes = count - sceneIndex;
    const remainingWords = totalWords - assignedWords;
    const target = remainingWords / Math.max(1, remainingScenes);
    const currentWords = chunks[sceneIndex]!.split(/\s+/u).filter(Boolean).length;
    if (sceneIndex < count - 1 && currentWords > 0 && currentWords >= target) {
      sceneIndex += 1;
    }
    chunks[sceneIndex] = normalizeWhitespace(`${chunks[sceneIndex]} ${unit}`);
    assignedWords += unit.split(/\s+/u).filter(Boolean).length;
  }
  for (let index = 0; index < chunks.length; index += 1) {
    if (!chunks[index]) chunks[index] = chunks[index - 1] ?? normalized;
  }
  return chunks;
}

export function compilePositioningProductionScenePlan(input: {
  readonly episodeId: string;
  readonly narration: string;
  readonly plan: PositioningProductionPlan;
}): ScenePlan {
  const episodeId = normalizeEpisodeId(input.episodeId);
  const orderedScenes = [...input.plan.scenes].sort(
    (left, right) => left.startMs - right.startMs,
  );
  const narrationChunks = splitNarration(input.narration, orderedScenes.length);
  const assets = new Map(input.plan.assets.map((asset) => [asset.sceneId, asset]));
  return scenePlanSchema.parse({
    sourceId: episodeId,
    scenes: orderedScenes.map((planned, index) => {
      const asset = assets.get(planned.sceneId);
      if (!asset) {
        throw new Error(`Missing generated-asset plan for ${planned.sceneId}.`);
      }
      const sceneId = `scene-${String(index + 1).padStart(3, "0")}`;
      const startSeconds = planned.startMs / 1_000;
      const endSeconds = (planned.startMs + planned.durationMs) / 1_000;
      return {
        id: sceneId,
        sequenceNumber: index + 1,
        canonicalNarration: narrationChunks[index],
        sourceSegmentIds: [sceneId],
        estimatedDurationSeconds: planned.durationMs / 1_000,
        timing: { startSeconds, endSeconds },
        visualPurpose: `${planned.progressionStage}: ${planned.treatment.communicationIntent}`,
        textRequirement: { required: false },
        subject: planned.treatment.subjectRequirement,
        action: planned.treatment.action,
        setting: planned.treatment.environment,
        composition: planned.treatment.composition,
        cameraFraming: planned.treatment.camera,
        mood: `${planned.treatment.lighting}; ${planned.progressionStage.toLowerCase()}`,
        continuityReferences: index > 0 ? [`scene-${String(index).padStart(3, "0")}`] : [],
        onScreenText: "",
        negativeConstraints: [
          "no readable text, letters, numbers, logos, UI, or watermarks",
          "no depiction or synthetic likeness of Veronica Benini",
          "no generic motivational stock montage, laptop-at-desk pose, or stock handshake",
        ],
        aspectRatios: [asset.nativeAspectRatio],
        imagePrompt: asset.prompt,
        expectedImageFilenames: [`${sceneId}-${asset.nativeAspectRatio.replace(":", "x")}.png`],
        qualityStatus: "approved",
      };
    }),
  });
}

export async function preparePositioningProductionEpisode(
  input: PreparePositioningProductionEpisodeInput,
): Promise<PreparePositioningProductionEpisodeResult> {
  const workspaceRoot = path.resolve(input.workspaceRoot);
  const episodeId = normalizeEpisodeId(input.episodeId);
  const episodeDir = path.join(workspaceRoot, episodeId);
  const planPath = path.resolve(
    input.planPath ?? path.join(episodeDir, "source", "visual-plan.json"),
  );
  const scriptPath = path.resolve(
    input.scriptPath ?? defaultScriptPath(episodeDir, input.language, input.variant),
  );
  const manifestPath = path.join(episodeDir, "manifest.json");
  const scenePlanPath = path.join(episodeDir, "shared", "scenes.json");
  const [planRaw, narration] = await Promise.all([
    fs.readFile(planPath, "utf8"),
    fs.readFile(scriptPath, "utf8"),
  ]);
  const plan = positioningProductionPlanSchema.parse(JSON.parse(planRaw) as unknown);
  const expectedFormat = input.variant === "short" ? "short" : "long";
  if (plan.format !== expectedFormat) {
    throw new Error(
      `Veronica plan format ${plan.format} does not match requested ${input.variant} production.`,
    );
  }
  const scenePlan = compilePositioningProductionScenePlan({
    episodeId,
    narration,
    plan,
  });
  const existing = (await fileExists(manifestPath))
    ? episodeManifestSchema.parse(
        JSON.parse(await fs.readFile(manifestPath, "utf8")) as unknown,
      )
    : null;
  const now = new Date().toISOString();
  const manifest = episodeManifestSchema.parse({
    ...(existing ?? {
      episodeId,
      slug: episodeId,
      source: { platform: "local-file", filePath: scriptPath },
      images: [],
      artifacts: [],
      pipelineRuns: [],
      createdAt: now,
    }),
    scenePlan,
    sourceMetadata: {
      ...(existing?.sourceMetadata && typeof existing.sourceMetadata === "object"
        ? existing.sourceMetadata
        : {}),
      genre: "veronicabenini",
      creatorProfileId: "veronica-benini",
      contentId: plan.contentId,
      locale: input.language,
      variant: input.variant,
      positioningPlanHash: plan.planHash,
      syntheticCreatorLikenessAllowed: false,
    },
    updatedAt: now,
  });
  const canonicalScriptPath = path.join(
    episodeDir,
    "locales",
    input.language,
    input.variant,
    "script.md",
  );
  const languageScriptPath = defaultScriptPath(
    episodeDir,
    input.language,
    input.variant,
  );
  await Promise.all([
    writeJsonAtomic(manifestPath, manifest),
    writeJsonAtomic(scenePlanPath, scenePlan),
    writeTextAtomic(canonicalScriptPath, narration),
    writeTextAtomic(languageScriptPath, narration),
  ]);
  return {
    schemaVersion: POSITIONING_PRODUCTION_ADAPTER_VERSION,
    episodeId,
    contentId: plan.contentId,
    language: input.language,
    variant: input.variant,
    planPath,
    scriptPath,
    manifestPath,
    scenePlanPath,
    sceneCount: scenePlan.scenes.length,
  };
}
