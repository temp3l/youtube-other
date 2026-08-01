import {
  hashText,
  normalizeContentVariant,
  normalizeEpisodeId,
  normalizeLocaleCode,
  resolveAuthoredScript,
  type ResolvedAuthoredScript,
} from "@mediaforge/shared";
import { workflowManifestSchema } from "./story-workflow.schemas.js";
import {
  type ArtifactLineage,
  type FingerprintInputs,
  type StageContractInput,
  type StageContractOutput,
  stageContractSchemaVersion,
  type StageDependencyFingerprint,
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
  /** Opt-in strategic route: Italian is the reviewed canonical parent. */
  readonly strategicItalianCanonical?: boolean;
}

export interface WorkspacePlannedStoryWorkflowInput
  extends PlannedStoryWorkflowInput {
  readonly workspaceRoot: string;
}

export type PlannedStoryWorkflowManifest = WorkflowManifest<ArtifactLineage>;

/**
 * Deliberately separate from the legacy manifest API: consumers must opt in to
 * the Italian-parent evidence route rather than treating a strategic manifest
 * as an ordinary English-canonical workflow.
 */
export interface StrategicItalianWorkflowPlan {
  readonly route: "strategic-italian";
  readonly manifest: PlannedStoryWorkflowManifest;
  readonly canonicalLocale: "it";
  readonly childLocales: readonly ["en", "es"];
  readonly contentProfileId: "strategic-reinvention";
}

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

interface StageContractFields {
  readonly fingerprintInputs: FingerprintInputs;
  readonly stageInputs: readonly StageContractInput[];
  readonly stageOutputs: readonly StageContractOutput[];
  readonly dependencyFingerprints: readonly StageDependencyFingerprint[];
  readonly contractFingerprint: string;
  readonly usesLegacySyntheticFingerprints: boolean;
}

function syntheticFingerprintInputs(args: {
  readonly episodeId: string;
  readonly stageType: StageType;
  readonly locale?: WorkflowLocale;
  readonly format?: StoryFormat;
  readonly parentFingerprints: readonly string[];
}): FingerprintInputs {
  const base = [args.episodeId, args.stageType, args.locale ?? "none", args.format ?? "none"].join(":");
  return {
    sourceFingerprint: hashText(`${base}:source`),
    parentFingerprints: args.parentFingerprints,
    promptFingerprint: hashText(`${base}:prompt`),
    schemaFingerprint: hashText(workflowSchemaVersion),
    configFingerprint: hashText(`${base}:config`),
    workflowSchemaVersion,
  };
}

function authoredSourceFingerprint(source: ResolvedAuthoredScript): string {
  return hashText(
    JSON.stringify({
      boundary: "ingest-source",
      contentHash: source.contentHash,
      cacheIdentity: source.cacheIdentity,
      resolverVersion: source.resolverVersion,
      locale: source.language,
      variant: source.variant,
      workflowSchemaVersion,
    })
  );
}

function fingerprintInputsForAuthoredSource(
  source: ResolvedAuthoredScript
): FingerprintInputs {
  return {
    sourceFingerprint: authoredSourceFingerprint(source),
    parentFingerprints: [],
    schemaFingerprint: hashText(workflowSchemaVersion),
    configFingerprint: hashText(
      JSON.stringify({
        boundary: "ingest-source",
        locale: source.language,
        variant: source.variant,
        resolverVersion: source.resolverVersion,
        workflowSchemaVersion,
      })
    ),
    workflowSchemaVersion,
  };
}

function contractFields(args: {
  readonly stageId: StageId;
  readonly stageType: StageType;
  readonly locale?: WorkflowLocale;
  readonly format?: StoryFormat;
  readonly fingerprintInputs: FingerprintInputs;
  readonly dependencyFingerprints: readonly StageDependencyFingerprint[];
  readonly sourceInput?: StageContractInput;
  readonly outputPath?: string;
  readonly usesLegacySyntheticFingerprints: boolean;
}): StageContractFields {
  const stageInputs =
    args.sourceInput
      ? [args.sourceInput]
      : [
          {
            name: "stage-config",
            fingerprint:
              args.fingerprintInputs.configFingerprint ??
              hashText(`${args.stageId}:stage-config`),
          },
        ];
  const outputFingerprint = hashText(
    JSON.stringify({
      stageId: args.stageId,
      stageType: args.stageType,
      locale: args.locale ?? null,
      format: args.format ?? null,
      sourceFingerprint: args.fingerprintInputs.sourceFingerprint ?? null,
      parentFingerprints: args.fingerprintInputs.parentFingerprints,
      promptFingerprint: args.fingerprintInputs.promptFingerprint ?? null,
      schemaFingerprint: args.fingerprintInputs.schemaFingerprint ?? null,
      configFingerprint: args.fingerprintInputs.configFingerprint ?? null,
      workflowSchemaVersion: args.fingerprintInputs.workflowSchemaVersion,
    })
  );
  const stageOutputs: readonly StageContractOutput[] = [
    {
      name: `${args.stageType}-output`,
      fingerprint: outputFingerprint,
      ...(args.outputPath ? { path: args.outputPath } : {}),
    },
  ];
  const contractFingerprint = hashText(
    JSON.stringify({
      schemaVersion: stageContractSchemaVersion,
      stageId: args.stageId,
      stageType: args.stageType,
      locale: args.locale ?? null,
      format: args.format ?? null,
      stageInputs,
      stageOutputs,
      dependencyFingerprints: args.dependencyFingerprints,
      usesLegacySyntheticFingerprints: args.usesLegacySyntheticFingerprints,
      workflowSchemaVersion,
    })
  );
  return {
    fingerprintInputs: args.fingerprintInputs,
    stageInputs,
    stageOutputs,
    dependencyFingerprints: args.dependencyFingerprints,
    contractFingerprint,
    usesLegacySyntheticFingerprints: args.usesLegacySyntheticFingerprints,
  };
}

function ingestSourceContractFields(args: {
  readonly stageId: StageId;
  readonly source: ResolvedAuthoredScript | undefined;
}): StageContractFields | undefined {
  if (!args.source) {
    return undefined;
  }
  const fingerprintInputs = fingerprintInputsForAuthoredSource(args.source);
  const fingerprint = fingerprintInputs.sourceFingerprint ?? authoredSourceFingerprint(args.source);
  return contractFields({
    stageId: args.stageId,
    stageType: "ingest-source",
    locale: args.source.language as WorkflowLocale,
    format: args.source.variant as StoryFormat,
    fingerprintInputs,
    dependencyFingerprints: [],
    sourceInput: {
      name: "authored-script",
      fingerprint,
      source: args.source.relativePath,
      contentHash: args.source.contentHash,
      cacheIdentity: args.source.cacheIdentity,
      resolverVersion: args.source.resolverVersion,
      locale: args.source.language as WorkflowLocale,
      format: args.source.variant as StoryFormat,
    },
    outputPath: args.source.relativePath,
    usesLegacySyntheticFingerprints: false,
  });
}

function stageId(stageType: StageType, locale?: WorkflowLocale, format?: StoryFormat): StageId {
  return ["stage", stageType, locale, format].filter(Boolean).join(":") as StageId;
}

function buildPlannedStoryWorkflowManifestWithContracts(args: {
  readonly input: PlannedStoryWorkflowInput;
  readonly authoredSource?: ResolvedAuthoredScript;
}): PlannedStoryWorkflowManifest {
  const input = args.input;
  const episodeId = normalizeEpisodeId(input.episodeId);
  const locales = input.strategicItalianCanonical
    ? unique((input.locales?.length ? input.locales : ["it", "en", "es"]).map((value) => normalizeLocaleCode(value) as WorkflowLocale))
    : parseLocales(input.locales);
  if (input.strategicItalianCanonical && !locales.includes("it")) {
    throw new Error("Strategic Italian-canonical workflows require the it locale.");
  }
  const formats = parseFormats(input.formats);
  const createdAt = input.createdAt ?? new Date().toISOString();
  const stamp = compactTimestamp(createdAt);
  const idBasis = `${episodeId}:${locales.join(",")}:${formats.join(",")}:${createdAt}`;
  const workflowId = `wf_${episodeId}_${stamp}_${shortHash(idBasis)}` as WorkflowId;
  const executionId = `exec_${stamp}_${shortHash(`${idBasis}:execution`)}` as ExecutionId;
  const stages: WorkflowStageState<ArtifactLineage>[] = [];
  const stagesById = new Map<StageId, WorkflowStageState<ArtifactLineage>>();

  const addStage = (
    stageType: StageType,
    locale: WorkflowLocale | undefined,
    format: StoryFormat | undefined,
    dependsOn: readonly StageId[]
  ): StageId => {
    const id = stageId(stageType, locale, format);
    const dependencyFingerprints: StageDependencyFingerprint[] = dependsOn.map(
      (dependencyStageId) => {
        const dependency = stagesById.get(dependencyStageId);
        const contractFingerprint =
          dependency?.contractFingerprint ??
          hashText(`${dependencyStageId}:legacy-contract`);
        return {
          stageId: dependencyStageId,
          contractFingerprint,
          ...(dependency?.usesLegacySyntheticFingerprints !== false
            ? { legacySyntheticFingerprint: true }
            : {}),
        };
      }
    );
    const parentFingerprints = dependencyFingerprints.map(
      (dependency) => dependency.contractFingerprint
    );
    const realIngestContract =
      stageType === "ingest-source" && locale === canonicalLocale && format === "full"
        ? ingestSourceContractFields({ stageId: id, source: args.authoredSource })
        : undefined;
    const stageContract =
      realIngestContract ??
      contractFields({
        stageId: id,
        stageType,
        ...(locale ? { locale } : {}),
        ...(format ? { format } : {}),
        fingerprintInputs: syntheticFingerprintInputs({
          episodeId,
          stageType,
          ...(locale ? { locale } : {}),
          ...(format ? { format } : {}),
          parentFingerprints,
        }),
        dependencyFingerprints,
        usesLegacySyntheticFingerprints: true,
      });
    const stage: WorkflowStageState<ArtifactLineage> = {
      stageId: id,
      stageType,
      ...(locale ? { locale } : {}),
      ...(format ? { format } : {}),
      dependsOn,
      status: "planned",
      outcomeKind: "planned",
      fingerprintInputs: stageContract.fingerprintInputs,
      stageInputs: stageContract.stageInputs,
      stageOutputs: stageContract.stageOutputs,
      dependencyFingerprints: stageContract.dependencyFingerprints,
      contractFingerprint: stageContract.contractFingerprint,
      usesLegacySyntheticFingerprints:
        stageContract.usesLegacySyntheticFingerprints,
      cache: {
        status: input.dryRun ? "bypassed" : "miss",
        invalidationReasons: input.dryRun ? ["dry-run"] : [],
      },
    };
    stages.push(stage);
    stagesById.set(id, stage);
    return id;
  };

  const canonicalLocale: WorkflowLocale = input.strategicItalianCanonical ? "it" : "en";
  const ingest = addStage("ingest-source", canonicalLocale, "full", []);
  const rewriteFull = addStage("rewrite-full", canonicalLocale, "full", [ingest]);
  const validateFull = addStage("validate-full", canonicalLocale, "full", [rewriteFull]);
  const qualityFull = addStage("quality-full", canonicalLocale, "full", [validateFull]);
  const fullScenePlan = addStage("visual-model", canonicalLocale, "full", [qualityFull]);
  const fullPrompt = addStage("image-prompt", canonicalLocale, "full", [fullScenePlan]);
  addStage("image-generation", canonicalLocale, "full", [fullPrompt]);
  const fullByLocale = new Map<WorkflowLocale, StageId>([[canonicalLocale, qualityFull]]);

  if (formats.includes("full")) {
    for (const locale of locales.filter((entry) => entry !== canonicalLocale)) {
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

export function buildPlannedStoryWorkflowManifest(
  input: PlannedStoryWorkflowInput
): PlannedStoryWorkflowManifest {
  return buildPlannedStoryWorkflowManifestWithContracts({ input });
}

export function buildStrategicItalianWorkflowPlan(
  input: Omit<PlannedStoryWorkflowInput, "strategicItalianCanonical" | "locales">
): StrategicItalianWorkflowPlan {
  const manifest = buildPlannedStoryWorkflowManifest({
    ...input,
    locales: ["it", "en", "es"],
    strategicItalianCanonical: true,
  });
  return { route: "strategic-italian", manifest, canonicalLocale: "it", childLocales: ["en", "es"], contentProfileId: "strategic-reinvention" };
}

export async function buildWorkspacePlannedStoryWorkflowManifest(
  input: WorkspacePlannedStoryWorkflowInput
): Promise<PlannedStoryWorkflowManifest> {
  const episodeId = normalizeEpisodeId(input.episodeId);
  let authoredSource: ResolvedAuthoredScript | undefined;
  try {
    authoredSource = await resolveAuthoredScript({
      workspaceRoot: input.workspaceRoot,
      episode: episodeId,
      language: input.strategicItalianCanonical ? "it" : "en",
      variant: "full",
    });
  } catch (error) {
    // A strategic plan is evidence-bound: unlike the compatibility planner it
    // must never silently substitute a synthetic ingest fingerprint.
    if (input.strategicItalianCanonical) throw error;
    authoredSource = undefined;
  }
  if (input.strategicItalianCanonical && (!authoredSource || authoredSource.language !== "it" || authoredSource.variant !== "full")) {
    throw new Error("Strategic Italian workflows require an authored it/full source.");
  }
  return buildPlannedStoryWorkflowManifestWithContracts({
    input,
    ...(authoredSource ? { authoredSource } : {}),
  });
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
