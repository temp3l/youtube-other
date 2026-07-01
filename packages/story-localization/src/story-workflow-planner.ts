import { hashText, normalizeContentVariant, normalizeEpisodeId, normalizeLocaleCode } from "@mediaforge/shared";
import {
  workflowManifestSchema,
  type fingerprintInputsSchema,
} from "./story-workflow.schemas.js";
import {
  type ArtifactLineage,
  type FingerprintInputs,
  type StageId,
  type StageType,
  type StoryFormat,
  type WorkflowStageState,
  type WorkflowId,
  type WorkflowLocale,
  type WorkflowManifest,
  workflowSchemaVersion,
  type ExecutionId,
} from "./story-workflow.types.js";

export interface PlannedStoryWorkflowInput {
  readonly episodeId: string;
  readonly locales?: readonly string[];
  readonly formats?: readonly string[];
  readonly createdAt?: string;
  readonly dryRun?: boolean;
}

export type PlannedStoryWorkflowManifest = WorkflowManifest<ArtifactLineage>;

const defaultLocales: readonly WorkflowLocale[] = ["en", "de", "es", "fr", "pt"];
const defaultFormats: readonly StoryFormat[] = ["full", "short"];

function compactTimestamp(value: string): string {
  return value.replace(/[-:.]/gu, "").replace("T", "T").slice(0, 15) + "Z";
}

function shortHash(value: string): string {
  return hashText(value).slice(0, 8);
}

function unique<T>(values: readonly T[]): T[] {
  return [...new Set(values)];
}

function parseLocales(values: readonly string[] | undefined): WorkflowLocale[] {
  return unique((values?.length ? values : defaultLocales).map((value) => normalizeLocaleCode(value) as WorkflowLocale));
}

function parseFormats(values: readonly string[] | undefined): StoryFormat[] {
  return unique((values?.length ? values : defaultFormats).map((value) => normalizeContentVariant(value) as StoryFormat));
}

function fingerprintInputs(args: {
  readonly episodeId: string;
  readonly stageType: StageType;
  readonly locale?: WorkflowLocale;
  readonly format?: StoryFormat;
}): FingerprintInputs {
  const base = [args.episodeId, args.stageType, args.locale ?? "none", args.format ?? "none"].join(":");
  return {
    sourceFingerprint: hashText(`${base}:source`),
    parentFingerprints: [],
    promptFingerprint: hashText(`${base}:prompt`),
    schemaFingerprint: hashText(workflowSchemaVersion),
    configFingerprint: hashText(`${base}:config`),
    workflowSchemaVersion,
  };
}

function stageId(stageType: StageType, locale?: WorkflowLocale, format?: StoryFormat): StageId {
  return ["stage", stageType, locale, format].filter(Boolean).join(":") as StageId;
}

export function buildPlannedStoryWorkflowManifest(
  input: PlannedStoryWorkflowInput
): PlannedStoryWorkflowManifest {
  const episodeId = normalizeEpisodeId(input.episodeId);
  const locales = parseLocales(input.locales);
  const formats = parseFormats(input.formats);
  const createdAt = input.createdAt ?? new Date().toISOString();
  const stamp = compactTimestamp(createdAt);
  const idBasis = `${episodeId}:${locales.join(",")}:${formats.join(",")}:${createdAt}`;
  const workflowId = `wf_${episodeId}_${stamp}_${shortHash(idBasis)}` as WorkflowId;
  const executionId = `exec_${stamp}_${shortHash(`${idBasis}:execution`)}` as ExecutionId;
  const stages: WorkflowStageState<ArtifactLineage>[] = [];

  const addStage = (
    stageType: StageType,
    locale: WorkflowLocale | undefined,
    format: StoryFormat | undefined,
    dependsOn: readonly StageId[]
  ): StageId => {
    const id = stageId(stageType, locale, format);
    stages.push({
      stageId: id,
      stageType,
      ...(locale ? { locale } : {}),
      ...(format ? { format } : {}),
      dependsOn,
      status: "planned",
      fingerprintInputs: fingerprintInputs({
        episodeId,
        stageType,
        ...(locale ? { locale } : {}),
        ...(format ? { format } : {}),
      }),
      cache: {
        status: input.dryRun ? "bypassed" : "miss",
        invalidationReasons: input.dryRun ? ["dry-run"] : [],
      },
    });
    return id;
  };

  const ingest = addStage("ingest-source", "en", "full", []);
  const rewriteFull = addStage("rewrite-full", "en", "full", [ingest]);
  const validateFull = addStage("validate-full", "en", "full", [rewriteFull]);
  const qualityFull = addStage("quality-full", "en", "full", [validateFull]);
  const fullByLocale = new Map<WorkflowLocale, StageId>([["en", qualityFull]]);

  if (formats.includes("full")) {
    for (const locale of locales.filter((entry) => entry !== "en")) {
      const localized = addStage("localize-full", locale, "full", [qualityFull]);
      const validated = addStage("validate-full", locale, "full", [localized]);
      const quality = addStage("quality-full", locale, "full", [validated]);
      fullByLocale.set(locale, quality);
    }
  }

  if (formats.includes("short")) {
    for (const locale of locales) {
      const fullDependency = fullByLocale.get(locale) ?? qualityFull;
      const short = addStage("rewrite-short", locale, "short", [fullDependency]);
      const validated = addStage("validate-short", locale, "short", [short]);
      const quality = addStage("quality-short", locale, "short", [validated]);
      const scenes = addStage("scene-extraction", locale, "short", [quality]);
      const visual = addStage("visual-model", locale, "short", [scenes]);
      const prompt = addStage("image-prompt", locale, "short", [visual]);
      const image = addStage("image-generation", locale, "short", [prompt]);
      const thumbnail = addStage("thumbnail", locale, "short", [image]);
      const audio = addStage("audio", locale, "short", [quality]);
      const captions = addStage("captions", locale, "short", [audio]);
      const metadata = addStage("metadata", locale, "short", [quality]);
      const render = addStage("render", locale, "short", [
        image,
        thumbnail,
        audio,
        captions,
        metadata,
      ]);
      addStage("publish", locale, "short", [render, metadata]);
    }
  }

  if (formats.includes("full")) {
    for (const locale of locales) {
      const fullDependency = fullByLocale.get(locale) ?? qualityFull;
      const audio = addStage("audio", locale, "full", [fullDependency]);
      const captions = addStage("captions", locale, "full", [audio]);
      const metadata = addStage("metadata", locale, "full", [fullDependency]);
      const render = addStage("render", locale, "full", [audio, captions, metadata]);
      addStage("publish", locale, "full", [render, metadata]);
    }
  }

  return workflowManifestSchema.parse({
    schemaVersion: workflowSchemaVersion,
    workflowId,
    executionId,
    episodeId,
    locales,
    formats,
    createdAt,
    updatedAt: createdAt,
    plannedStageCount: stages.length,
    stages,
    attemptHistory: [],
    artifacts: [],
    batches: [],
    warnings: [],
  }) as PlannedStoryWorkflowManifest;
}

export function summarizePlannedStoryWorkflow(manifest: PlannedStoryWorkflowManifest) {
  return {
    workflowId: manifest.workflowId,
    executionId: manifest.executionId,
    episodeId: manifest.episodeId,
    locales: manifest.locales,
    formats: manifest.formats,
    plannedStageCount: manifest.plannedStageCount,
  };
}
