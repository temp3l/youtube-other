import fs from "node:fs/promises";
import path from "node:path";
import {
  POSITIONING_LOCALES,
  POSITIONING_PLAN_VERSION,
  POSITIONING_PLANNER_VERSION,
  POSITIONING_REVIEW_VERSION,
  POSITIONING_TITLE_QA_VERSION,
  POSITIONING_VOCABULARY_VERSION,
  type AspectRatio,
  type AssetReuseDecision,
  type CadenceMetrics,
  type ContinuityPlan,
  type DiagramTopology,
  type GeneratedVisualAsset,
  type PlannedScene,
  type PositioningFormat,
  type PositioningLocale,
  type PositioningPlannerConfiguration,
  type PositioningVisualPlanV2,
  type PositioningVisualCalibrationResult,
  type PositioningVisualPlanningResult,
  type ProgressionStage,
  type RatioAdaptation,
  type SafeRegion,
  type TitleTranscreationQa,
  type VisualEvent,
  type VisualEventKind,
  type VisualVocabulary,
} from "./positioning-visual-contracts.js";
import {
  buildTreatment,
  calculateOpeningDiversityDiagnostics,
  calculateDiversityMetrics,
  canonicalJson,
  semanticHash,
  semanticTokens,
  stableHash,
  validateDiagramTopology,
  validDiagramTopologies,
  visualGrammarSimilarity,
  viewerVisibleFingerprintSimilarity,
  viewerVisibleHookSignature,
} from "./positioning-visual-semantics.js";
import { resolveOpeningTreatmentProfile } from "./positioning-opening-treatments.js";
import {
  VERONICA_VISUAL_LANGUAGE_VERSION,
  buildLongFormChapters,
  buildVeronicaStoryBible,
  narrativeFunctionForStage,
  validateVeronicaVisualSequence,
  visibleThesisFor,
  visualFamilyFor,
} from "./veronica-visual-language.js";
import { resolveVeronicaProductionPolicy } from "./veronica-production-policy.js";
import {
  canonicalSourcePlannerInputSchema,
  type CanonicalSourcePlannerInput,
} from "./veronica-content-pack-2-ingestion.js";

export type {
  AssetReuseDecision,
  DiagramTopology,
  PositioningVisualPlanV2,
  PositioningVisualCalibrationResult,
  PositioningVisualPlanningResult,
} from "./positioning-visual-contracts.js";
export {
  DIVERSITY_THRESHOLDS,
  calculateOpeningDiversityDiagnostics,
  calculateDiversityMetrics,
  createViewerVisibleHookFingerprint,
  selectDiagramTopology,
  validateDiagramTopology,
  validDiagramTopologies,
  visualGrammarSimilarity,
  viewerVisibleFingerprintSimilarity,
  viewerVisibleHookSignature,
} from "./positioning-visual-semantics.js";

interface SourceBeat {
  readonly sceneId: string;
  readonly concept: string;
}

interface SourceContent {
  readonly contentId: string;
  readonly format: PositioningFormat;
  readonly titles: Readonly<Record<PositioningLocale, string>>;
  readonly narrationFiles: Readonly<Record<PositioningLocale, string>>;
  readonly visualAssetKey: string;
  readonly visualBeats: readonly SourceBeat[];
}

interface SourceManifest {
  readonly seriesId: string;
  readonly canonicalLocale: "en";
  readonly contents: readonly SourceContent[];
}

interface NarrationLength {
  readonly contentId: string;
  readonly locale: PositioningLocale;
  readonly estimatedMinutes: number;
}

interface PlanDraft extends Omit<PositioningVisualPlanV2, "assetReuseDecisions" | "validation" | "planHash"> {
  readonly assetReuseDecisions: readonly AssetReuseDecision[];
}

interface ReviewPlanSummary {
  readonly contentId: string;
  readonly format: PositioningFormat;
  readonly parentLongFormId: string;
  readonly planPath: string;
  readonly planHash: string;
  readonly semanticPlanCacheKey: string;
  readonly canonicalImagePlanHash: string;
  readonly titleQaArtifactHash: string;
  readonly vocabularyHash: string;
  readonly localizedTitles: TitleTranscreationQa["locales"];
  readonly visualVocabulary: VisualVocabulary;
  readonly assetCount: number;
  readonly visualEventCount: number;
  readonly diagramCount: number;
  readonly coldOpen: PlannedScene | null;
  readonly progression: readonly ProgressionStage[];
  readonly continuity: ContinuityPlan;
  readonly sceneToNarrationAlignment: readonly PlannedScene[];
  readonly generatedAssets: readonly GeneratedVisualAsset[];
  readonly visualEvents: readonly VisualEvent[];
  readonly diagramStructures: PositioningVisualPlanV2["diagrams"];
  readonly reuseDecisions: readonly AssetReuseDecision[];
  readonly diversityMetrics: PositioningVisualPlanV2["diversityMetrics"];
  readonly cadenceMetrics: CadenceMetrics;
  readonly titleQa: TitleTranscreationQa;
  readonly productionCoverage: PositioningVisualPlanV2["productionCoverage"];
  readonly validation: "pass" | "fail";
}

const DEFAULT_CONFIGURATION: PositioningPlannerConfiguration = {
  imageProviderModel: "provider-unbound:text-free-canonical-v1",
  rendererVersion: "ffmpeg-event-compiler.v1",
};
const POSITIONING_SERIES_ID = "positioning-series-v2-optimized" as const;
const POSITIONING_CONTENT_IDS = new Set([
  ...Array.from({ length: 6 }, (_, index) => `L0${index + 1}`),
  ...Array.from({ length: 6 }, (_, parent) =>
    Array.from({ length: 3 }, (_, short) => `L0${parent + 1}-S0${short + 1}`),
  ).flat(),
]);

const LEGACY_BASELINE = {
  source: "veronicabenini-positioning-visual-plan.v1 fixture review",
  visualGrammarDuplicateRate: 0.984,
  subjectArchetypeDuplicateRate: 0.9894,
  environmentDuplicateRate: 0.9894,
  compositionDuplicateRate: 0.9894,
  cameraDuplicateRate: 0.984,
  propDuplicateRate: 0.9894,
  diagramTopologyDuplicateRate: 0.898,
  consecutiveSceneSimilarity: 0.8462,
  shortsHookProgressionPassRate: 0,
  meanSecondsPerVisualEvent: 23.2144,
  reusableAssetOpportunities: 0,
  hookExactDuplicateRate: 0.9583,
  maxHookSignatureFrequency: 24,
  localizedTitleOverlayRiskCount: 26,
  diagramTopologyDistribution: {
    "hub-spoke": 13,
    funnel: 11,
    comparison: 8,
    "before-after": 6,
    sequence: 5,
    "cause-effect": 4,
    intersection: 4,
    hierarchy: 3,
    matrix: 1,
  },
} as const;

function isObject(value: unknown): value is { readonly [key: string]: unknown } {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isStringArray(value: unknown): value is readonly string[] {
  return Array.isArray(value) && value.every((item) => typeof item === "string");
}

function requiredString(record: { readonly [key: string]: unknown }, key: string): string {
  const value = record[key];
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new Error(`Invalid positioning source: ${key} must be a non-empty string.`);
  }
  return value;
}

function parseLocaleRecord(
  record: { readonly [key: string]: unknown },
  key: string,
  filePaths = false,
): Readonly<Record<PositioningLocale, string>> {
  const value = record[key];
  if (!isObject(value)) throw new Error(`Invalid positioning source: ${key} must be an object.`);
  const parsed = {
    en: requiredString(value, "en"),
    de: requiredString(value, "de"),
    it: requiredString(value, "it"),
    fr: requiredString(value, "fr"),
    pt: requiredString(value, "pt"),
  };
  if (!filePaths) return parsed;
  for (const [locale, filePath] of Object.entries(parsed)) {
    if (
      path.isAbsolute(filePath) ||
      path.normalize(filePath) === ".." ||
      path.normalize(filePath).startsWith(`..${path.sep}`)
    ) {
      throw new Error(`Invalid positioning narration path for ${locale}: path escapes pack root.`);
    }
  }
  return parsed;
}

function isPositioningLocale(value: unknown): value is PositioningLocale {
  return POSITIONING_LOCALES.some((candidate) => candidate === value);
}

function parseSourceManifest(value: unknown): SourceManifest {
  if (!isObject(value)) throw new Error("Invalid positioning source manifest.");
  if (value["seriesId"] !== POSITIONING_SERIES_ID) {
    throw new Error(`Positioning planner only accepts Veronica series ${POSITIONING_SERIES_ID}.`);
  }
  if (value["canonicalLocale"] !== "en") {
    throw new Error("Positioning visual planning requires English canonical content.");
  }
  const contentsValue = value["contents"];
  if (!Array.isArray(contentsValue)) throw new Error("Positioning manifest contents must be an array.");
  const contents = contentsValue.map((item, contentIndex): SourceContent => {
    if (!isObject(item)) throw new Error(`Invalid positioning content at index ${contentIndex}.`);
    const formatValue = item["format"];
    if (formatValue !== "long" && formatValue !== "short") {
      throw new Error(`Invalid positioning format at index ${contentIndex}.`);
    }
    const beatsValue = item["visualBeats"];
    if (!Array.isArray(beatsValue) || beatsValue.length === 0) {
      throw new Error(`Positioning content ${contentIndex} requires visual beats.`);
    }
    const visualBeats = beatsValue.map((beat, beatIndex): SourceBeat => {
      if (!isObject(beat)) throw new Error(`Invalid visual beat ${contentIndex}:${beatIndex}.`);
      return { sceneId: requiredString(beat, "sceneId"), concept: requiredString(beat, "concept") };
    });
    if (new Set(visualBeats.map((beat) => beat.sceneId)).size !== visualBeats.length) {
      throw new Error(`Duplicate visual beat IDs for ${requiredString(item, "contentId")}.`);
    }
    const contentId = requiredString(item, "contentId");
    if (!POSITIONING_CONTENT_IDS.has(contentId)) {
      throw new Error(`Unexpected Veronica positioning content ID: ${contentId}.`);
    }
    return {
      contentId,
      format: formatValue,
      titles: parseLocaleRecord(item, "titles"),
      narrationFiles: parseLocaleRecord(item, "narrationFiles", true),
      visualAssetKey: requiredString(item, "visualAssetKey"),
      visualBeats,
    };
  });
  if (contents.length !== 24 || contents.filter((item) => item.format === "long").length !== 6) {
    throw new Error("Positioning visual planning requires the complete 6 long + 18 Short pack.");
  }
  const contentIds = contents.map((item) => item.contentId);
  if (new Set(contentIds).size !== contentIds.length) throw new Error("Duplicate positioning content IDs.");
  if (POSITIONING_CONTENT_IDS.size !== contentIds.length || [...POSITIONING_CONTENT_IDS].some((id) => !contentIds.includes(id))) {
    throw new Error("Veronica positioning content ID topology is incomplete.");
  }
  return { seriesId: POSITIONING_SERIES_ID, canonicalLocale: "en", contents };
}

function parseNarrationLengths(value: unknown): readonly NarrationLength[] {
  if (!Array.isArray(value)) throw new Error("Narration lengths must be an array.");
  return value.map((item, index): NarrationLength => {
    if (!isObject(item)) throw new Error(`Invalid narration length at index ${index}.`);
    const locale = item["locale"];
    const minutes = item["estimatedMinutes"];
    if (!isPositioningLocale(locale)) {
      throw new Error(`Invalid narration locale at index ${index}.`);
    }
    if (typeof minutes !== "number" || !Number.isFinite(minutes) || minutes <= 0) {
      throw new Error(`Invalid narration minutes at index ${index}.`);
    }
    return { contentId: requiredString(item, "contentId"), locale, estimatedMinutes: minutes };
  });
}

async function readUnknownJson(filePath: string): Promise<unknown> {
  return JSON.parse(await fs.readFile(filePath, "utf8")) as unknown;
}

async function readContainedPackFile(packDir: string, relativePath: string): Promise<string> {
  const [realPackDir, realTarget] = await Promise.all([
    fs.realpath(packDir),
    fs.realpath(path.resolve(packDir, relativePath)),
  ]);
  if (realTarget !== realPackDir && !realTarget.startsWith(`${realPackDir}${path.sep}`)) {
    throw new Error(`Invalid positioning source: ${relativePath} resolves outside pack root.`);
  }
  return fs.readFile(realTarget, "utf8");
}

async function readContainedPackJson(packDir: string, relativePath: string): Promise<unknown> {
  return JSON.parse(await readContainedPackFile(packDir, relativePath)) as unknown;
}

function parentLongFormId(contentId: string): string {
  return contentId.split("-")[0] ?? contentId;
}

function episodeDomains(concepts: readonly string[], narration: string): readonly string[] {
  const joined = `${concepts.join(" ")} ${narration}`.toLowerCase();
  const candidates = [
    ["expertise-perceived-value", ["expert", "value", "client", "proof", "evidence"]],
    ["niche-positioning", ["niche", "segment", "market", "specific"]],
    ["authority-recognition", ["authority", "recognition", "recommend", "speaking", "interview"]],
    ["content-positioning", ["content", "topic", "editorial", "publish", "memory"]],
    ["book-positioning", ["book", "manuscript", "chapter", "reader", "publisher"]],
    ["repositioning", ["reposition", "old", "new identity", "transition", "changed"]],
  ] as const;
  return candidates
    .map(([domain, terms]) => ({ domain, score: terms.filter((term) => joined.includes(term)).length }))
    .filter((candidate) => candidate.score > 0)
    .sort((left, right) => right.score - left.score || left.domain.localeCompare(right.domain))
    .slice(0, 4)
    .map((candidate) => candidate.domain);
}

function motifForDomain(domain: string): string {
  switch (domain) {
    case "expertise-perceived-value":
      return "visible evidence trails and consequential client choices";
    case "niche-positioning":
      return "crowds resolving into selected audience clusters";
    case "authority-recognition":
      return "knowledge moving through stages, interviews, and recommendations";
    case "content-positioning":
      return "one core idea propagating across a physical media ecosystem";
    case "book-positioning":
      return "manuscript-to-book-to-reader artifact lifecycle";
    case "repositioning":
      return "thresholds, bridges, and matched old/new identity states";
    default:
      return "semantic evidence expressed through real objects and environments";
  }
}

async function loadOrBuildVocabulary(input: {
  readonly outputDir: string;
  readonly content: SourceContent;
  readonly narration: string;
}): Promise<VisualVocabulary> {
  const sourceSemanticHash = semanticHash(
    `${input.narration}\n${input.content.visualBeats.map((beat) => beat.concept).join("\n")}`,
  );
  const cacheKey = stableHash({
    version: POSITIONING_VOCABULARY_VERSION,
    episodeId: input.content.contentId,
    sourceSemanticHash,
  });
  const vocabularyPath = path.join(
    input.outputDir,
    "vocabularies",
    `${input.content.contentId.toLowerCase()}.visual-vocabulary.json`,
  );
  try {
    const cached = await readUnknownJson(vocabularyPath);
    if (
      isObject(cached) &&
      cached["schemaVersion"] === POSITIONING_VOCABULARY_VERSION &&
      typeof cached["episodeId"] === "string" &&
      isStringArray(cached["semanticDomains"]) &&
      isStringArray(cached["recurringMotifs"]) &&
      isStringArray(cached["environments"]) &&
      isStringArray(cached["materialPalette"]) &&
      isStringArray(cached["excludedCliches"]) &&
      typeof cached["sourceSemanticHash"] === "string" &&
      typeof cached["cacheKey"] === "string" &&
      typeof cached["vocabularyHash"] === "string"
    ) {
      const withoutHash = {
        schemaVersion: cached["schemaVersion"],
        episodeId: cached["episodeId"],
        semanticDomains: cached["semanticDomains"],
        recurringMotifs: cached["recurringMotifs"],
        environments: cached["environments"],
        materialPalette: cached["materialPalette"],
        excludedCliches: cached["excludedCliches"],
        sourceSemanticHash: cached["sourceSemanticHash"],
        cacheKey: cached["cacheKey"],
      };
      if (
        cached["cacheKey"] === cacheKey &&
        stableHash(withoutHash) === cached["vocabularyHash"]
      ) {
        return { ...withoutHash, vocabularyHash: cached["vocabularyHash"] };
      }
    }
  } catch {
    // A missing or stale vocabulary is deterministically rebuilt below.
  }
  const domains = episodeDomains(
    input.content.visualBeats.map((beat) => beat.concept),
    input.narration,
  );
  const base = {
    schemaVersion: POSITIONING_VOCABULARY_VERSION,
    episodeId: input.content.contentId,
    semanticDomains: domains,
    recurringMotifs: domains.map(motifForDomain),
    environments: domains.flatMap((domain) => {
      switch (domain) {
        case "book-positioning":
          return ["author worktable", "small print workshop", "reader recommendation setting"];
        case "content-positioning":
          return ["editorial wall", "podcast booth", "multi-format production table"];
        case "niche-positioning":
          return ["crowded trade hall", "audience concourse", "specialist service context"];
        case "repositioning":
          return ["identity threshold corridor", "old workplace", "new client context"];
        default:
          return ["case-study archive", "client decision setting", "active professional context"];
      }
    }),
    materialPalette: ["warm paper", "coral accent", "ink", "glass", "unfinished wood"],
    excludedCliches: [
      "generic professional in office",
      "laptop-at-desk pose",
      "repeated notebook-and-cards staging",
      "unmotivated business handshake",
    ],
    sourceSemanticHash,
    cacheKey,
  } as const;
  const vocabulary: VisualVocabulary = { ...base, vocabularyHash: stableHash(base) };
  await fs.mkdir(path.dirname(vocabularyPath), { recursive: true });
  await fs.writeFile(vocabularyPath, `${JSON.stringify(vocabulary, null, 2)}\n`, "utf8");
  return vocabulary;
}

function continuityFor(content: SourceContent, parent: SourceContent): ContinuityPlan {
  const joined = parent.visualBeats.map((beat) => beat.concept).join(" ").toLowerCase();
  const persistent =
    (joined.includes("identity") || joined.includes("position")) &&
    (joined.includes("old") || joined.includes("new") || joined.includes("past-to-new"));
  if (!persistent) {
    return {
      mode: "ensemble-independent",
      variationDimensions: ["age", "gender-presentation", "profession", "environment", "framing"],
      scenesShareIdentity: false,
    };
  }
  const identityId = `${parent.contentId.toLowerCase()}-protagonist`;
  const appearance = {
    ageBand: "38-45",
    genderPresentation: "feminine",
    hair: "dark shoulder-length wavy hair",
    wardrobeAnchor: "rust jacket with charcoal workwear separates",
  } as const;
  return {
    mode: "persistent-protagonist",
    identityId,
    identityFingerprint: stableHash({ identityId, appearance }),
    appearance,
    referencePolicy: "reuse-only-for-linked-scenes",
    linkedSceneIds: content.visualBeats.map((beat) => beat.sceneId),
  };
}

function stageForLong(index: number, count: number, concept: string): ProgressionStage {
  if (index === count - 1) return "PAYOFF";
  if (index === 0) return "MANIFESTATION";
  if (/test|system|workflow|checklist|method|bridge|alignment/u.test(concept)) return "METHOD";
  if (/vs|gap|conflict|warning|confusion/u.test(concept)) return "REVERSAL";
  return "EXPLANATION";
}

function stagesForShort(count: number): readonly ProgressionStage[] {
  const middle: readonly ProgressionStage[] = ["PROOF", "MANIFESTATION", "REVERSAL", "METHOD"];
  if (count === 1) return ["PAYOFF"];
  return Array.from({ length: count }, (_, index) =>
    index === count - 1 ? "PAYOFF" : (middle[index % middle.length] ?? "EXPLANATION"),
  );
}

function durationAwareVisualBeats(input: {
  readonly contentId: string;
  readonly format: PositioningFormat;
  readonly durationMs: number;
  readonly authored: readonly SourceBeat[];
}): readonly SourceBeat[] {
  if (input.format !== "short") return input.authored;
  const targetSceneCount = Math.max(6, Math.min(9, Math.round(input.durationMs / 9_000)));
  const targetAuthoredCount = targetSceneCount - 1; // the hook is planned separately
  if (input.authored.length >= targetAuthoredCount) return input.authored;
  const additions = Array.from(
    { length: targetAuthoredCount - input.authored.length },
    (_, index): SourceBeat => ({
      sceneId: `${input.contentId}-D${String(index + 1).padStart(2, "0")}`,
      concept: index % 2 === 0 ? "buyer-evaluation" : "evidence-contrast",
    }),
  );
  const first = input.authored[0];
  const last = input.authored.at(-1);
  if (!first || !last) return [...input.authored, ...additions];
  return [first, additions[0]!, ...input.authored.slice(1, -1), ...additions.slice(1), last];
}

function timeline(input: {
  readonly format: PositioningFormat;
  readonly durationMs: number;
  readonly sceneCount: number;
}): { readonly coldOpenMs: number; readonly hookMs: number; readonly sceneMs: readonly number[] } {
  const coldOpenMs = input.format === "long" ? Math.min(12_000, Math.max(5_000, input.durationMs * 0.025)) : 0;
  const hookMs = input.format === "short" ? Math.min(7_000, Math.max(6_000, input.durationMs * 0.12)) : 0;
  const remaining = Math.max(input.sceneCount * 2_000, input.durationMs - coldOpenMs - hookMs);
  const base = Math.floor(remaining / input.sceneCount);
  const sceneMs = Array.from({ length: input.sceneCount }, (_, index) =>
    index === input.sceneCount - 1 ? remaining - base * (input.sceneCount - 1) : base,
  );
  return { coldOpenMs: Math.round(coldOpenMs), hookMs: Math.round(hookMs), sceneMs };
}

function safeRegions(aspectRatio: AspectRatio): readonly SafeRegion[] {
  return aspectRatio === "16:9"
    ? [
        { id: "subject", x: 0.08, y: 0.08, width: 0.52, height: 0.72 },
        { id: "overlay", x: 0.64, y: 0.1, width: 0.28, height: 0.38 },
        { id: "subtitle", x: 0.08, y: 0.78, width: 0.84, height: 0.14 },
      ]
    : [
        { id: "subject", x: 0.12, y: 0.18, width: 0.76, height: 0.54 },
        { id: "overlay", x: 0.12, y: 0.1, width: 0.76, height: 0.2 },
        { id: "subtitle", x: 0.12, y: 0.72, width: 0.76, height: 0.16 },
      ];
}

function ratioAdaptations(nativeAspectRatio: AspectRatio, strategy: GeneratedVisualAsset["strategy"]): readonly RatioAdaptation[] {
  const verticalSafe = !["market-crowd", "before-after"].includes(strategy);
  return (["16:9", "9:16"] as const).map((aspectRatio) => ({
    aspectRatio,
    supported: aspectRatio === nativeAspectRatio || verticalSafe,
    cropMode:
      aspectRatio === nativeAspectRatio
        ? "native"
        : verticalSafe
          ? "subject-aware-crop"
          : "not-safe",
    safeRegions: safeRegions(aspectRatio),
    reason:
      aspectRatio === nativeAspectRatio
        ? "native composition"
        : verticalSafe
          ? "protected subject and overlay regions survive a subject-aware derivative"
          : "wide multi-subject topology loses meaning in a vertical crop",
  }));
}

function assetPrompt(treatment: PlannedScene["treatment"], aspectRatio: AspectRatio): string {
  const diagramClause = treatment.diagram
    ? `Proposition-specific ${treatment.diagram.type} structure with ${treatment.diagram.overlayLabelKeys.length} separately rendered label anchors.`
    : "No decorative diagram; make the proposition visible through the selected scene model.";
  return [
    `Text-free ${aspectRatio} ${treatment.strategy} treatment for ${treatment.narrativeBeat.replace(/-/gu, " ")}.`,
    `Communication intent: ${treatment.communicationIntent}.`,
    `Subject: ${treatment.subjectRequirement}.`,
    `Environment: ${treatment.environment}.`,
    `Composition: ${treatment.composition}. Camera: ${treatment.camera}.`,
    `Props: ${treatment.props.join(", ")}. ${diagramClause}`,
    "Contemporary European editorial realism; no readable text, letters, numbers, logos, UI, generic office, laptop-at-desk pose, stock handshake, or repeated notebook staging.",
  ].join(" ");
}

function buildAsset(input: {
  readonly contentId: string;
  readonly scene: Omit<PlannedScene, "assetId" | "eventIds">;
  readonly aspectRatio: AspectRatio;
  readonly configuration: PositioningPlannerConfiguration;
  readonly priorReferenceAssetId: string | null;
}): GeneratedVisualAsset {
  const assetId = `${input.scene.sceneId}-base`.toLowerCase();
  const prompt = assetPrompt(input.scene.treatment, input.aspectRatio);
  const semanticFingerprint = stableHash({
    contentId: input.contentId,
    sceneId: input.scene.sceneId,
    prompt,
    aspectRatio: input.aspectRatio,
    subjectIdentityId: input.scene.treatment.grammar.continuityIdentityId,
  });
  const subjectIdentityId = input.scene.treatment.grammar.continuityIdentityId;
  return {
    assetId,
    contentId: input.contentId,
    sceneId: input.scene.sceneId,
    semanticPurpose: input.scene.treatment.narrativeBeat,
    strategy: input.scene.treatment.strategy,
    prompt,
    textFree: true,
    textInGeneratedImage: false,
    nativeAspectRatio: input.aspectRatio,
    ratioAdaptations: ratioAdaptations(input.aspectRatio, input.scene.treatment.strategy),
    subjectIdentityId,
    referenceAssetId: subjectIdentityId === null ? null : input.priorReferenceAssetId,
    semanticFingerprint,
    generatedAssetCacheKey: stableHash({
      semanticFingerprint,
      imageProviderModel: input.configuration.imageProviderModel,
    }),
  };
}

function buildEvents(input: {
  readonly sceneId: string;
  readonly assetId: string;
  readonly startMs: number;
  readonly durationMs: number;
  readonly stage: ProgressionStage;
  readonly aspectRatio: AspectRatio;
  readonly kinds: readonly VisualEventKind[];
  readonly rendererVersion: string;
  readonly format: PositioningFormat;
}): readonly VisualEvent[] {
  const [, maximumSeconds] = resolveVeronicaProductionPolicy(input.format).eventDurationRangeSeconds;
  const count = Math.max(1, Math.ceil(input.durationMs / (maximumSeconds * 1_000)));
  const duration = Math.floor(input.durationMs / count);
  return Array.from({ length: count }, (_, index): VisualEvent => {
    const eventDuration = index === count - 1 ? input.durationMs - duration * (count - 1) : duration;
    const kind = input.kinds[index % input.kinds.length] ?? "slow-push";
    const eventBase = {
      eventId: `${input.sceneId}-event-${String(index + 1).padStart(2, "0")}`.toLowerCase(),
      sceneId: input.sceneId,
      assetId: input.assetId,
      kind,
      startMs: input.startMs + duration * index,
      durationMs: eventDuration,
      aspectRatio: input.aspectRatio,
      safeRegionIds: ["subject", "overlay", "subtitle"] as const,
      deterministicParameters: {
        startScale: kind === "punch-in" ? 1.12 : 1,
        endScale: kind === "slow-push" || kind === "punch-in" ? 1.16 : 1.04,
        anchor: kind === "prop-detail" ? ("prop" as const) : kind === "subject-detail" ? ("subject" as const) : ("center" as const),
      },
    };
    return {
      ...eventBase,
      renderCacheKey: stableHash({ rendererVersion: input.rendererVersion, ...eventBase }),
    };
  });
}

function cadenceMetrics(format: PositioningFormat, durationMs: number, assets: readonly GeneratedVisualAsset[], events: readonly VisualEvent[]): CadenceMetrics {
  const durations = events.map((event) => event.durationMs / 1000);
  const targetRangeSeconds = resolveVeronicaProductionPolicy(format).eventDurationRangeSeconds;
  const compliant = durations.filter((duration) => duration >= targetRangeSeconds[0] && duration <= targetRangeSeconds[1]).length;
  const hookEvents = events.filter((event) => /cold-open|hook/u.test(event.sceneId.toLowerCase()));
  const round = (value: number): number => Math.round(value * 10_000) / 10_000;
  return {
    durationMs,
    baseAssetCount: assets.length,
    visualEventCount: events.length,
    eventsPerBaseAsset: round(events.length / Math.max(1, assets.length)),
    meanSecondsPerEvent: round(durationMs / Math.max(1, events.length) / 1000),
    shortestEventSeconds: round(Math.min(...durations)),
    longestEventSeconds: round(Math.max(...durations)),
    targetRangeSeconds,
    targetComplianceRate: round(compliant / Math.max(1, events.length)),
    hookMeanSecondsPerEvent:
      hookEvents.length === 0
        ? null
        : round(hookEvents.reduce((sum, event) => sum + event.durationMs, 0) / hookEvents.length / 1000),
  };
}

function titleQaFor(content: SourceContent): TitleTranscreationQa {
  const sourceTitlesHash = stableHash(content.titles);
  const compactDisplayOverrides: Readonly<
    Record<string, { readonly expectedMetadataTitle: string; readonly lines: readonly [string, string] }>
  > = {
    "L03:fr": {
      expectedMetadataTitle: "Comment devenir reconnue comme experte quand personne ne vous connaît encore",
      lines: ["Devenir experte reconnue", "quand personne ne vous connaît"],
    },
    "L03:pt": {
      expectedMetadataTitle: "Como se tornar conhecida como especialista quando ninguém conhece você ainda",
      lines: ["Ser reconhecida como especialista", "sem ninguém conhecer você"],
    },
    "L01-S02:fr": {
      expectedMetadataTitle: "Plus de compétence ne résout pas ce problème de positionnement",
      lines: ["La compétence ne suffit pas", "pour vous positionner"],
    },
    "L01-S02:pt": {
      expectedMetadataTitle: "Mais habilidade não resolve este problema de posicionamento",
      lines: ["Mais habilidade não resolve", "seu posicionamento"],
    },
    "L05-S01:fr": {
      expectedMetadataTitle: "Vous n’avez pas besoin d’un éditeur pour construire votre autorité",
      lines: ["Pas besoin d’éditeur", "pour bâtir votre autorité"],
    },
    "L06-S01:fr": {
      expectedMetadataTitle: "Votre audience se souvient encore de l’ancienne version de vous",
      lines: ["Votre audience vous voit encore", "comme avant"],
    },
  };
  const displayLayoutConfigurationHash = stableHash(compactDisplayOverrides);
  const cacheKey = stableHash({
    schemaVersion: POSITIONING_TITLE_QA_VERSION,
    contentId: content.contentId,
    sourceTitlesHash,
    displayLayoutConfigurationHash,
  });
  const enLength = content.titles.en.length;
  const splitForOverlay = (title: string): readonly [string] | readonly [string, string] => {
    if (title.length <= 38) return [title];
    const words = title.split(/\s+/gu);
    let bestIndex = 1;
    let bestDistance = Number.POSITIVE_INFINITY;
    for (let index = 1; index < words.length; index += 1) {
      const leftLength = words.slice(0, index).join(" ").length;
      const rightLength = words.slice(index).join(" ").length;
      const distance = Math.abs(leftLength - rightLength);
      if (distance < bestDistance) {
        bestIndex = index;
        bestDistance = distance;
      }
    }
    return [words.slice(0, bestIndex).join(" "), words.slice(bestIndex).join(" ")];
  };
  const localeQa = (locale: PositioningLocale): TitleTranscreationQa["locales"][PositioningLocale] => {
    const title = content.titles[locale];
    const excessiveLength = title.length > (content.format === "short" ? 56 : 72);
    const ratio = title.length / Math.max(1, enLength);
    const awkwardLiteralTranslation =
      locale !== "en" && /\b(the|your|you|why|how|expert)\b/iu.test(title);
    const sourceOverlayOverflowRisk =
      title.length > 72 ? ("high" as const) : title.length > 52 ? ("medium" as const) : ("low" as const);
    const compactOverride = compactDisplayOverrides[`${content.contentId}:${locale}`];
    if (compactOverride && compactOverride.expectedMetadataTitle !== title) {
      throw new Error(`Stale compact display-title override for ${content.contentId}:${locale}.`);
    }
    const displayLines = compactOverride?.lines ?? splitForOverlay(title);
    const displayTitle = displayLines.join(" ");
    const longestDisplayLine = Math.max(...displayLines.map((line) => line.length));
    const overlayOverflowRisk =
      longestDisplayLine > 42 ? ("high" as const) : longestDisplayLine > 38 ? ("medium" as const) : ("low" as const);
    return {
      metadataTitle: title,
      displayTitle,
      displayLines,
      displayTitleDistinctFromMetadata: displayTitle !== title,
      minimumFontScale: 1,
      naturalness: awkwardLiteralTranslation ? "warning" : "reviewed-source",
      semanticPreservation: ratio < 0.45 || ratio > 1.9 ? "warning" : "pass",
      excessiveLength,
      sourceOverlayOverflowRisk,
      overlayOverflowRisk,
      awkwardLiteralTranslation,
      warnings: [
        ...(excessiveLength ? ["youtube-title-length"] : []),
        ...(ratio > 1.65 ? ["expansion-vs-canonical"] : []),
        ...(awkwardLiteralTranslation ? ["possible-literal-or-untranslated-phrase"] : []),
        ...(sourceOverlayOverflowRisk !== "low" && overlayOverflowRisk === "low"
          ? ["overlay-fit-resolved-with-approved-display-layout"]
          : []),
      ],
    };
  };
  const locales: TitleTranscreationQa["locales"] = {
    en: localeQa("en"),
    de: localeQa("de"),
    it: localeQa("it"),
    fr: localeQa("fr"),
    pt: localeQa("pt"),
  };
  const withoutHash = {
    schemaVersion: POSITIONING_TITLE_QA_VERSION,
    contentId: content.contentId,
    locales,
    sourceTitlesHash,
    cacheKey,
  } as const;
  return { ...withoutHash, artifactHash: stableHash(withoutHash) };
}

async function persistTitleQa(outputDir: string, artifact: TitleTranscreationQa): Promise<void> {
  const target = path.join(outputDir, "localization", `${artifact.contentId.toLowerCase()}.title-qa.json`);
  await fs.mkdir(path.dirname(target), { recursive: true });
  try {
    const cached = await fs.readFile(target, "utf8");
    if (cached === `${JSON.stringify(artifact, null, 2)}\n`) return;
  } catch {
    // Missing title QA is written below.
  }
  await fs.writeFile(target, `${JSON.stringify(artifact, null, 2)}\n`, "utf8");
}

async function buildDraft(input: {
  readonly packDir: string;
  readonly outputDir: string;
  readonly content: SourceContent;
  readonly parent: SourceContent;
  readonly narrationLengthMinutes: number;
  readonly configuration: PositioningPlannerConfiguration;
  readonly priorClusterDiagramTopologies: readonly DiagramTopology["type"][];
  readonly narration?: string;
  readonly parentNarration?: string;
}): Promise<PlanDraft> {
  const narration = input.narration ?? await readContainedPackFile(input.packDir, input.content.narrationFiles.en);
  const aspectRatio: AspectRatio = input.content.format === "long" ? "16:9" : "9:16";
  const parentNarration = input.parentNarration ?? await readContainedPackFile(input.packDir, input.parent.narrationFiles.en);
  const vocabulary = await loadOrBuildVocabulary({
    outputDir: input.outputDir,
    content: input.parent,
    narration: parentNarration,
  });
  const titleQa = titleQaFor(input.content);
  await persistTitleQa(input.outputDir, titleQa);
  const continuity = continuityFor(input.content, input.parent);
  const durationMs = Math.round(input.narrationLengthMinutes * 60_000);
  const visualBeats = durationAwareVisualBeats({
    contentId: input.content.contentId,
    format: input.content.format,
    durationMs,
    authored: input.content.visualBeats,
  });
  const visualStoryBible = buildVeronicaStoryBible({
    format: input.content.format,
    narration,
    concepts: visualBeats.map((beat) => beat.concept),
    parentLongFormId: input.parent.contentId,
  });
  const times = timeline({ format: input.content.format, durationMs, sceneCount: visualBeats.length });
  const normalStages =
    input.content.format === "short"
      ? stagesForShort(visualBeats.length)
      : visualBeats.map((beat, index) =>
          stageForLong(index, visualBeats.length, beat.concept),
        );
  const specs: Array<{
    readonly sceneId: string;
    readonly concept: string;
    readonly stage: ProgressionStage;
    readonly startMs: number;
    readonly durationMs: number;
  }> = [];
  let cursor = 0;
  if (input.content.format === "long") {
    const firstConcept = visualBeats[0]?.concept ?? "unresolved-positioning-consequence";
    specs.push({
      sceneId: `${input.content.contentId}-COLD_OPEN`,
      concept: `unresolved-contradiction-consequence-${firstConcept}`,
      stage: "COLD_OPEN",
      startMs: 0,
      durationMs: times.coldOpenMs,
    });
    cursor += times.coldOpenMs;
  } else {
    specs.push({
      sceneId: `${input.content.contentId}-HOOK`,
      concept: `provocative-tension-unresolved-${input.content.titles.en}`,
      stage: "HOOK",
      startMs: 0,
      durationMs: times.hookMs,
    });
    cursor += times.hookMs;
  }
  visualBeats.forEach((beat, index) => {
    const duration = times.sceneMs[index] ?? 2_000;
    specs.push({
      sceneId: beat.sceneId,
      concept: beat.concept,
      stage: normalStages[index] ?? "EXPLANATION",
      startMs: cursor,
      durationMs: duration,
    });
    cursor += duration;
  });

  const scenes: PlannedScene[] = [];
  const assets: GeneratedVisualAsset[] = [];
  const events: VisualEvent[] = [];
  let referenceAssetId: string | null = null;
  const selectedDiagramTopologies: DiagramTopology["type"][] = [
    ...input.priorClusterDiagramTopologies,
  ];
  let previousDiagramTopology: DiagramTopology["type"] | null =
    input.priorClusterDiagramTopologies.at(-1) ?? null;
  specs.forEach((spec, index) => {
    const treatment = buildTreatment({
      sceneId: spec.sceneId,
      concept: spec.concept,
      stage: spec.stage,
      ordinal: index,
      continuity,
      ...(spec.stage === "COLD_OPEN" || spec.stage === "HOOK"
        ? { openingProfile: resolveOpeningTreatmentProfile(input.content.contentId) }
        : {}),
      diagramSelectionContext: {
        usedTopologies: selectedDiagramTopologies,
        previousTopology: previousDiagramTopology,
      },
    });
    if (treatment.diagram) {
      selectedDiagramTopologies.push(treatment.diagram.type);
      previousDiagramTopology = treatment.diagram.type;
    }
    const sceneWithoutAsset = {
      sceneId: spec.sceneId,
      progressionStage: spec.stage,
      narrationAnchor: spec.concept,
      startMs: spec.startMs,
      durationMs: spec.durationMs,
      treatment,
      overlayKey: `${input.content.contentId.toLowerCase()}.${spec.sceneId.toLowerCase()}`,
      visibleThesis: visibleThesisFor({
        stage: spec.stage,
        concept: spec.concept,
        family: visualFamilyFor({ stage: spec.stage, concept: spec.concept, diagram: treatment.diagram !== null }),
      }),
      newInformation:
        index === 0
          ? "Introduces the buyer consequence and unresolved positioning conflict."
          : `Advances the visual argument with ${spec.concept.replace(/-/gu, " ")}; it is not a decorative restatement.`,
      narrativeFunction: narrativeFunctionForStage(spec.stage),
      visualFamily: visualFamilyFor({ stage: spec.stage, concept: spec.concept, diagram: treatment.diagram !== null }),
      ...(continuity.mode === "persistent-protagonist"
        ? { continuityGroup: `${input.content.contentId.toLowerCase()}-causal-arc` }
        : {}),
      ...(spec.stage === "PAYOFF" && scenes[0]
        ? { callbackToBeatId: scenes[0].sceneId, callbackPurpose: "resolves the opening buyer conflict through recognition or choice" }
        : {}),
    } as const;
    const asset = buildAsset({
      contentId: input.content.contentId,
      scene: sceneWithoutAsset,
      aspectRatio,
      configuration: input.configuration,
      priorReferenceAssetId: referenceAssetId,
    });
    if (asset.subjectIdentityId !== null && referenceAssetId === null) {
      referenceAssetId = asset.assetId;
    }
    const sceneEvents = buildEvents({
      sceneId: spec.sceneId,
      assetId: asset.assetId,
      startMs: spec.startMs,
      durationMs: spec.durationMs,
      stage: spec.stage,
      aspectRatio,
      kinds: treatment.motionOpportunities,
      rendererVersion: input.configuration.rendererVersion,
      format: input.content.format,
    });
    assets.push(asset);
    events.push(...sceneEvents);
    scenes.push({
      ...sceneWithoutAsset,
      assetId: asset.assetId,
      eventIds: sceneEvents.map((event) => event.eventId),
    });
  });
  const effectiveContinuity: ContinuityPlan =
    continuity.mode === "persistent-protagonist"
      ? {
          ...continuity,
          linkedSceneIds: scenes
            .filter((scene) => scene.treatment.grammar.continuityIdentityId === continuity.identityId)
            .map((scene) => scene.sceneId),
        }
      : continuity;
  const diversityMetrics = calculateDiversityMetrics({
    sceneIds: scenes.map((scene) => scene.sceneId),
    features: scenes.map((scene) => scene.treatment.grammar),
    stages: scenes.map((scene) => scene.progressionStage),
    continuity: effectiveContinuity,
  });
  const semanticBeatStructureHash = stableHash(visualBeats);
  const sourceNarrationSemanticHash = semanticHash(narration);
  const sceneCountRationale =
    input.content.format === "short"
      ? `duration-aware: ${Math.round(durationMs / 1_000)} seconds requires ${visualBeats.length + 1} total scenes including hook; ${input.content.visualBeats.length} authored beats were expanded with ${visualBeats.length - input.content.visualBeats.length} Buyer-evaluation/contrast beats.`
      : `long-form chapter planning retains ${visualBeats.length} authored semantic beats plus cold open.`;
  const semanticPlanCacheKey = stableHash({
    plannerVersion: POSITIONING_PLANNER_VERSION,
    contentId: input.content.contentId,
    sourceNarrationSemanticHash,
    semanticBeatStructureHash,
    sceneCountRationale,
    visualAssetKey: input.content.visualAssetKey,
    vocabularyHash: vocabulary.vocabularyHash,
    visualLanguageVersion: VERONICA_VISUAL_LANGUAGE_VERSION,
    visualStoryBibleFingerprint: visualStoryBible.fingerprint,
  });
  const canonicalImagePlanHash = stableHash({
    semanticPlanCacheKey,
    assets,
  });
  return {
    schemaVersion: POSITIONING_PLAN_VERSION,
    plannerVersion: POSITIONING_PLANNER_VERSION,
    contentId: input.content.contentId,
    parentLongFormId: input.parent.contentId,
    format: input.content.format,
    aspectRatio,
    canonicalNarrationSource: input.content.narrationFiles.en,
    canonicalSourceHash: stableHash(narration),
    sourceNarrationSemanticHash,
    semanticBeatStructureHash,
    sceneCountRationale,
    semanticPlanCacheKey,
    canonicalImagePlanHash,
    renderEventPlanHash: stableHash(events),
    localizedTitleArtifact: titleQa,
    visualVocabulary: vocabulary,
    visualStoryBible,
    chapters:
      input.content.format === "long"
        ? buildLongFormChapters({
            contentId: input.content.contentId,
            sceneIds: scenes.map((scene) => scene.sceneId),
            concepts: scenes.map((scene) => scene.narrationAnchor),
          })
        : [],
    coldOpen: input.content.format === "long" ? (scenes[0] ?? null) : null,
    progression: scenes.map((scene) => scene.progressionStage),
    continuity: effectiveContinuity,
    scenes,
    assets,
    visualEvents: events,
    diagrams: scenes.flatMap((scene) => (scene.treatment.diagram ? [scene.treatment.diagram] : [])),
    assetReuseDecisions: [],
    diversityMetrics,
    cadenceMetrics: cadenceMetrics(input.content.format, durationMs, assets, events),
    localizationCompatibility: {
      locales: POSITIONING_LOCALES,
      canonicalImageryLocale: "en",
      textInGeneratedImage: false,
      translationInvalidatesCanonicalImagery: false,
      overlaysRenderedSeparately: true,
    },
    productionCoverage: {
      ctaEndScreenPlacement: "planned",
      motionTreatment: "planned",
      overlayStrategy: "planned",
      musicSfx: "unsupported-not-planned",
      thumbnail: {
        concept: `${vocabulary.recurringMotifs[0] ?? "recognizable positioning consequence"}; one legible tension, no generic portrait`,
        titleRelationship: "thumbnail visualizes the consequence or contradiction; title supplies the claim",
        localeStrategy: "text-free-image-localized-overlay",
      },
    },
    cacheInvalidation: {
      semanticPlanInvalidatesOn: [
        "canonical-narrative-semantic-change",
        "semantic-beat-structure-change",
        "visual-vocabulary-change",
        "veronica-visual-language-version-change",
        "planner-algorithm-version-change",
      ],
      canonicalImageInvalidatesOn: ["semantic-plan-change", "image-provider-or-model-change", "prompt-contract-change"],
      titleQaInvalidatesOn: ["localized-title-change", "title-qa-version-change"],
      renderEventsInvalidateOn: ["semantic-plan-change", "ffmpeg-renderer-version-change", "timing-change"],
    },
    migration: {
      legacyV1Plan: "inspect-only-replan-required",
      legacyAssetReuse: "eligible-only-after-semantic-fingerprint-match",
    },
  };
}

function setSimilarity(left: readonly string[], right: readonly string[]): number {
  const a = new Set(left);
  const b = new Set(right);
  const union = new Set([...a, ...b]);
  if (union.size === 0) return 0;
  return [...a].filter((item) => b.has(item)).length / union.size;
}

export function analyzeAssetReuse(input: {
  readonly source: GeneratedVisualAsset;
  readonly targetContentId: string;
  readonly targetSceneId: string;
  readonly targetAspectRatio: AspectRatio;
  readonly targetSemanticPurpose: string;
  readonly targetStrategy: GeneratedVisualAsset["strategy"];
  readonly continuityCompatible: boolean;
}): AssetReuseDecision {
  const adaptation = input.source.ratioAdaptations.find(
    (candidate) => candidate.aspectRatio === input.targetAspectRatio,
  );
  const tokenScore = setSimilarity(
    semanticTokens(input.source.semanticPurpose),
    semanticTokens(input.targetSemanticPurpose),
  );
  const semanticCompatibility = Math.round(
    (tokenScore * 0.6 + (input.source.strategy === input.targetStrategy ? 0.4 : 0)) * 10_000,
  ) / 10_000;
  // Crop safety is only a necessary condition. Veronica's causal Shorts keep
  // a protagonist and motif contract, so loose token overlap is review-only.
  const eligible =
    Boolean(adaptation?.supported) && input.continuityCompatible && semanticCompatibility >= 0.8;
  const reason = !adaptation?.supported
    ? "unsafe-aspect-ratio-adaptation"
    : !input.continuityCompatible
      ? "subject-continuity-incompatible"
      : semanticCompatibility < 0.8
        ? "semantic-purpose-insufficiently-compatible"
        : "semantic purpose, continuity, and protected crop regions are compatible";
  return {
    sourceAssetId: input.source.assetId,
    sourceContentId: input.source.contentId,
    targetContentId: input.targetContentId,
    targetSceneId: input.targetSceneId,
    eligible,
    reuseMode: eligible
      ? input.source.strategy === input.targetStrategy
        ? "vertical-derivative"
        : "graphical-derivative"
      : "not-reusable",
    cropAdaptation: eligible
      ? adaptation?.cropMode === "center-crop"
        ? "center-crop"
        : "subject-aware-crop"
      : "none",
    semanticCompatibility,
    decision: eligible ? "AUTO_REUSE_APPROVED" : semanticCompatibility >= 0.4 ? "REUSE_REQUIRES_SEMANTIC_REVIEW" : "REUSE_REJECTED",
    reason,
  };
}

function attachReuse(drafts: readonly PlanDraft[]): readonly PlanDraft[] {
  const decisionsByContent = new Map<string, AssetReuseDecision[]>();
  for (const short of drafts.filter((plan) => plan.format === "short")) {
    const parent = drafts.find(
      (plan) => plan.contentId === short.parentLongFormId && plan.format === "long",
    );
    if (!parent) throw new Error(`Missing parent long-form plan for ${short.contentId}.`);
    for (const targetScene of short.scenes) {
      const candidates = parent.assets.map((source) =>
        analyzeAssetReuse({
          source,
          targetContentId: short.contentId,
          targetSceneId: targetScene.sceneId,
          targetAspectRatio: short.aspectRatio,
          targetSemanticPurpose: targetScene.treatment.narrativeBeat,
          targetStrategy: targetScene.treatment.strategy,
          continuityCompatible:
            source.subjectIdentityId === null ||
            (short.continuity.mode === "persistent-protagonist" &&
              source.subjectIdentityId === short.continuity.identityId),
        }),
      );
      const best = [...candidates].sort(
        (left, right) =>
          Number(right.eligible) - Number(left.eligible) ||
          right.semanticCompatibility - left.semanticCompatibility ||
          left.sourceAssetId.localeCompare(right.sourceAssetId),
      )[0];
      if (!best) continue;
      decisionsByContent.set(short.contentId, [...(decisionsByContent.get(short.contentId) ?? []), best]);
      decisionsByContent.set(parent.contentId, [...(decisionsByContent.get(parent.contentId) ?? []), best]);
    }
  }
  return drafts.map((draft) => ({
    ...draft,
    assetReuseDecisions: (decisionsByContent.get(draft.contentId) ?? []).sort(
      (left, right) =>
        left.targetContentId.localeCompare(right.targetContentId) ||
        left.targetSceneId.localeCompare(right.targetSceneId),
    ),
  }));
}

function validatePlan(plan: PlanDraft): readonly string[] {
  const failures = [
    ...plan.diagrams.flatMap(validateDiagramTopology),
    ...plan.diversityMetrics.failures,
    ...validateVeronicaVisualSequence({
      scenes: plan.scenes,
      format: plan.format,
      chapters: plan.chapters,
    }),
  ];
  if (plan.format === "long" && plan.aspectRatio !== "16:9") failures.push("long-aspect-ratio");
  if (plan.format === "short" && plan.aspectRatio !== "9:16") failures.push("short-aspect-ratio");
  if (plan.assets.some((asset) => !asset.textFree || asset.textInGeneratedImage)) {
    failures.push("generated-image-text-prohibition");
  }
  if (plan.assets.some((asset) => !asset.prompt.startsWith("Text-free"))) failures.push("prompt-text-free-prefix");
  if (plan.assets.some((asset) => !plan.visualEvents.some((event) => event.assetId === asset.assetId))) {
    failures.push("base-asset-missing-visual-event");
  }
  if (plan.visualEvents.some((event) => !plan.assets.some((asset) => asset.assetId === event.assetId))) {
    failures.push("visual-event-missing-base-asset");
  }
  if (plan.format === "long") {
    if (!plan.coldOpen || plan.coldOpen.progressionStage !== "COLD_OPEN") failures.push("cold-open-missing");
    const firstNormal = plan.scenes[1];
    if (
      plan.coldOpen &&
      firstNormal &&
      visualGrammarSimilarity(plan.coldOpen.treatment.grammar, firstNormal.treatment.grammar) > 0.72
    ) {
      failures.push("cold-open-duplicates-v01");
    }
  }
  if (plan.format === "short" && plan.diversityMetrics.hookVsScene1Similarity === null) {
    failures.push("short-hook-similarity-not-evaluated");
  }
  if (plan.cadenceMetrics.targetComplianceRate < 0.9) failures.push("visual-event-cadence-outside-target");
  if (plan.continuity.mode === "ensemble-independent") {
    const subjects = new Set(plan.scenes.map((scene) => scene.treatment.grammar.subjectArchetype));
    if (subjects.size < Math.min(3, plan.scenes.length)) failures.push("ensemble-subjects-not-varied");
  }
  return [...new Set(failures)].sort();
}

function finalizePlans(drafts: readonly PlanDraft[]): readonly PositioningVisualPlanV2[] {
  return drafts.map((draft) => {
    const failures = validatePlan(draft);
    const validated = {
      ...draft,
      validation: { status: failures.length === 0 ? ("pass" as const) : ("fail" as const), failures },
    };
    return { ...validated, planHash: stableHash(validated) };
  });
}

function average(values: readonly number[]): number {
  if (values.length === 0) return 0;
  return Math.round((values.reduce((sum, value) => sum + value, 0) / values.length) * 10_000) / 10_000;
}

function duplicateRate(values: readonly string[]): number {
  if (values.length === 0) return 0;
  return Math.round(((values.length - new Set(values).size) / values.length) * 10_000) / 10_000;
}

export function classifyLongFormSimilarity(score: number): "pass" | "warning" | "blocker" {
  if (score > 0.88) return "blocker";
  if (score > 0.82) return "warning";
  return "pass";
}

function orderedWindowSimilarity(
  left: readonly PlannedScene[],
  right: readonly PlannedScene[],
): {
  readonly similarity: number;
  readonly matchingWindow: {
    readonly leftSceneIds: readonly string[];
    readonly rightSceneIds: readonly string[];
    readonly sceneSimilarities: readonly number[];
    readonly exposureWeightsMs: readonly number[];
  };
} {
  const windowSize = Math.min(2, left.length, right.length);
  if (windowSize === 0) {
    return {
      similarity: 0,
      matchingWindow: {
        leftSceneIds: [],
        rightSceneIds: [],
        sceneSimilarities: [],
        exposureWeightsMs: [],
      },
    };
  }
  let best = {
    similarity: -1,
    matchingWindow: {
      leftSceneIds: [] as readonly string[],
      rightSceneIds: [] as readonly string[],
      sceneSimilarities: [] as readonly number[],
      exposureWeightsMs: [] as readonly number[],
    },
  };
  for (let leftIndex = 0; leftIndex <= left.length - windowSize; leftIndex += 1) {
    for (let rightIndex = 0; rightIndex <= right.length - windowSize; rightIndex += 1) {
      const similarities = Array.from({ length: windowSize }, (_, offset) =>
        viewerVisibleFingerprintSimilarity(
          left[leftIndex + offset]?.treatment.viewerVisibleFingerprint ??
            left[leftIndex]!.treatment.viewerVisibleFingerprint,
          right[rightIndex + offset]?.treatment.viewerVisibleFingerprint ??
            right[rightIndex]!.treatment.viewerVisibleFingerprint,
        ),
      );
      const exposureWeightsMs = Array.from({ length: windowSize }, (_, offset) =>
        Math.min(
          left[leftIndex + offset]?.durationMs ?? 0,
          right[rightIndex + offset]?.durationMs ?? 0,
        ),
      );
      const totalExposureMs = exposureWeightsMs.reduce((sum, durationMs) => sum + durationMs, 0);
      const similarity =
        totalExposureMs === 0
          ? average(similarities)
          : Math.round(
              (similarities.reduce(
                (sum, sceneSimilarity, index) =>
                  sum + sceneSimilarity * (exposureWeightsMs[index] ?? 0),
                0,
              ) /
                totalExposureMs) *
                10_000,
            ) / 10_000;
      if (similarity > best.similarity) {
        best = {
          similarity,
          matchingWindow: {
            leftSceneIds: left
              .slice(leftIndex, leftIndex + windowSize)
              .map((scene) => scene.sceneId),
            rightSceneIds: right
              .slice(rightIndex, rightIndex + windowSize)
              .map((scene) => scene.sceneId),
            sceneSimilarities: similarities,
            exposureWeightsMs,
          },
        };
      }
    }
  }
  return best;
}

function countDistribution(values: readonly string[]): readonly {
  readonly archetype: string;
  readonly count: number;
}[] {
  const counts = new Map<string, number>();
  values.forEach((value) => counts.set(value, (counts.get(value) ?? 0) + 1));
  return [...counts.entries()]
    .map(([archetype, count]) => ({ archetype, count }))
    .sort((left, right) => right.count - left.count || left.archetype.localeCompare(right.archetype));
}

function diagramDiversityDiagnostics(plans: readonly PositioningVisualPlanV2[]) {
  const topologyDistribution = countDistribution(
    plans.flatMap((plan) => plan.diagrams.map((diagram) => diagram.type)),
  );
  const consecutiveTopologyRepeats = plans.flatMap((plan) =>
    plan.diagrams.slice(1).flatMap((diagram, index) => {
      const previous = plan.diagrams[index];
      if (!previous || previous.type !== diagram.type) return [];
      const alternatives = validDiagramTopologies(diagram.proposition);
      return [
        {
          contentId: plan.contentId,
          previousDiagramId: previous.diagramId,
          diagramId: diagram.diagramId,
          topology: diagram.type,
          semanticallyJustified: alternatives.length === 1 && alternatives[0] === diagram.type,
        },
      ];
    }),
  );
  const parentIds = [...new Set(plans.map((plan) => plan.parentLongFormId))].sort();
  const clusterConcentration = parentIds.map((parentLongFormId) => {
    const diagrams = plans
      .filter((plan) => plan.parentLongFormId === parentLongFormId)
      .flatMap((plan) => plan.diagrams);
    const distribution = countDistribution(diagrams.map((diagram) => diagram.type));
    const dominant = distribution[0];
    const dominance = dominant ? Math.round((dominant.count / diagrams.length) * 10_000) / 10_000 : 0;
    const dominantDiagrams = dominant
      ? diagrams.filter((diagram) => diagram.type === dominant.archetype)
      : [];
    const allDominantUsesJustified = dominantDiagrams.every((diagram) =>
      validDiagramTopologies(diagram.proposition).includes(diagram.type),
    );
    return {
      parentLongFormId,
      diagramCount: diagrams.length,
      dominantTopology: dominant?.archetype ?? null,
      dominance,
      warning: dominance > 0.4,
      allDominantUsesSemanticallyJustified: allDominantUsesJustified,
    };
  });
  const selections = plans.flatMap((plan) =>
    plan.diagrams.map((diagram) => {
      const alternatives = validDiagramTopologies(diagram.proposition);
      return {
        contentId: plan.contentId,
        diagramId: diagram.diagramId,
        selectedTopology: diagram.type,
        validAlternatives: alternatives,
        selectedForLocalDiversity: alternatives.length > 1 && alternatives[0] !== diagram.type,
        semanticJustification: alternatives.includes(diagram.type) ? ("pass" as const) : ("fail" as const),
        fallbackSelected: alternatives.length === 0,
      };
    }),
  );
  return {
    topologyDistribution,
    consecutiveTopologyRepeats,
    clusterConcentration,
    fallbackSelections: selections.filter((selection) => selection.fallbackSelected),
    semanticJustificationFailures: selections.filter(
      (selection) => selection.semanticJustification === "fail",
    ),
    contextAwareAlternativeSelections: selections.filter(
      (selection) => selection.selectedForLocalDiversity,
    ),
  };
}

function aggregateMetrics(plans: readonly PositioningVisualPlanV2[]) {
  const longPlans = plans.filter((plan) => plan.format === "long");
  const allScenes = plans.flatMap((plan) => plan.scenes);
  const crossEpisodePairs: Array<{
    readonly pair: string;
    readonly similarity: number;
    readonly status: "pass" | "warning" | "blocker";
    readonly matchingWindow: {
      readonly leftSceneIds: readonly string[];
      readonly rightSceneIds: readonly string[];
      readonly sceneSimilarities: readonly number[];
      readonly exposureWeightsMs: readonly number[];
    };
  }> = [];
  longPlans.forEach((left, index) => {
    longPlans.slice(index + 1).forEach((right) => {
      const ordered = orderedWindowSimilarity(left.scenes, right.scenes);
      crossEpisodePairs.push({
        pair: `${left.contentId}<->${right.contentId}`,
        similarity: ordered.similarity,
        status: classifyLongFormSimilarity(ordered.similarity),
        matchingWindow: ordered.matchingWindow,
      });
    });
  });
  const eligibleReuse = plans
    .flatMap((plan) => plan.assetReuseDecisions)
    .filter((decision, index, all) =>
      decision.eligible &&
      all.findIndex(
        (candidate) =>
          candidate.sourceAssetId === decision.sourceAssetId &&
          candidate.targetContentId === decision.targetContentId &&
          candidate.targetSceneId === decision.targetSceneId,
      ) === index,
    );
  const openingDiversity = calculateOpeningDiversityDiagnostics(
    plans.map((plan) => {
      const opening = plan.scenes[0];
      if (!opening) throw new Error(`Missing opening scene for ${plan.contentId}.`);
      return {
        contentId: plan.contentId,
        parentLongFormId: plan.parentLongFormId,
        fingerprint: opening.treatment.viewerVisibleFingerprint,
        signature: viewerVisibleHookSignature(opening.treatment.viewerVisibleFingerprint),
      };
    }),
  );
  const localizedTitleEntries = plans.flatMap((plan) =>
    POSITIONING_LOCALES.map((locale) => ({
      contentId: plan.contentId,
      locale,
      ...plan.localizedTitleArtifact.locales[locale],
    })),
  );
  const allFingerprints = allScenes.map((scene) => scene.treatment.viewerVisibleFingerprint);
  const allSignatures = allFingerprints.map(viewerVisibleHookSignature);
  const longestConsecutiveRepetition = Math.max(
    1,
    ...plans.map((plan) => {
      let longest = 1;
      let current = 1;
      const signatures = plan.scenes.map((scene) =>
        viewerVisibleHookSignature(scene.treatment.viewerVisibleFingerprint),
      );
      signatures.slice(1).forEach((signature, index) => {
        current = signature === signatures[index] ? current + 1 : 1;
        longest = Math.max(longest, current);
      });
      return longest;
    }),
  );
  const similarityMatrixIds = longPlans.map((plan) => plan.contentId);
  const similarityByPair = new Map(crossEpisodePairs.map((pair) => [pair.pair, pair.similarity]));
  const hotspotBefore: Readonly<Record<string, number>> = {
    "L01<->L03": 0.9,
    "L01<->L05": 0.825,
    "L03<->L05": 0.825,
  };
  return {
    visualGrammarDuplicateRate: duplicateRate(
      allScenes.map((scene) =>
        canonicalJson({
          strategy: scene.treatment.grammar.strategy,
          subject: scene.treatment.grammar.subjectArchetype,
          environment: scene.treatment.grammar.environment,
          composition: scene.treatment.grammar.composition,
          camera: scene.treatment.grammar.camera,
          props: scene.treatment.grammar.props,
          topology: scene.treatment.grammar.topology,
        }),
      ),
    ),
    environmentDuplicateRate: duplicateRate(allScenes.map((scene) => scene.treatment.grammar.environment)),
    compositionDuplicateRate: duplicateRate(allScenes.map((scene) => scene.treatment.grammar.composition)),
    diagramTopologyDuplicateRate: duplicateRate(
      plans.flatMap((plan) => plan.diagrams.map((diagram) => diagram.type)),
    ),
    consecutiveSceneSimilarity: average(
      plans.map((plan) => plan.diversityMetrics.consecutiveSceneSimilarity.mean),
    ),
    shortsHookProgressionPassRate: average(
      plans
        .filter((plan) => plan.format === "short")
        .map((plan) =>
          (plan.diversityMetrics.hookVsScene1Similarity ?? 1) <= 0.65 ? 1 : 0,
        ),
    ),
    meanSecondsPerVisualEvent: average(plans.map((plan) => plan.cadenceMetrics.meanSecondsPerEvent)),
    reusableAssetOpportunities: eligibleReuse.length,
    openingDiversity,
    localizationOverlayFit: {
      beforeRiskCount: localizedTitleEntries.filter(
        (entry) => entry.sourceOverlayOverflowRisk !== "low",
      ).length,
      afterRiskCount: localizedTitleEntries.filter(
        (entry) => entry.overlayOverflowRisk !== "low",
      ).length,
      beforeRiskByLocale: POSITIONING_LOCALES.map((locale) => ({
        locale,
        count: localizedTitleEntries.filter(
          (entry) => entry.locale === locale && entry.sourceOverlayOverflowRisk !== "low",
        ).length,
      })),
      afterRiskByLocale: POSITIONING_LOCALES.map((locale) => ({
        locale,
        count: localizedTitleEntries.filter(
          (entry) => entry.locale === locale && entry.overlayOverflowRisk !== "low",
        ).length,
      })),
      compactDisplayTitles: localizedTitleEntries
        .filter((entry) => entry.displayTitleDistinctFromMetadata)
        .map((entry) => ({
          contentId: entry.contentId,
          locale: entry.locale,
          metadataTitle: entry.metadataTitle,
          displayTitle: entry.displayTitle,
          displayLines: entry.displayLines,
        })),
      lineBreakLayouts: localizedTitleEntries
        .filter((entry) => entry.displayLines.length > 1)
        .map((entry) => ({
          contentId: entry.contentId,
          locale: entry.locale,
          displayLines: entry.displayLines,
          minimumFontScale: entry.minimumFontScale,
        })),
    },
    treatmentFamilyDiagnostics: {
      countByPrimaryStrategy: countDistribution(allFingerprints.map((item) => item.strategyFamily)),
      countBySubjectArchetype: countDistribution(allFingerprints.map((item) => item.subjectArchetype)),
      countByEnvironmentArchetype: countDistribution(
        allFingerprints.map((item) => item.environmentArchetype),
      ),
      countByCompositionArchetype: countDistribution(
        allFingerprints.map((item) => item.compositionArchetype),
      ),
      countByCameraArchetype: countDistribution(allFingerprints.map((item) => item.cameraArchetype)),
      topExactViewerVisibleSignatures: countDistribution(allSignatures).slice(0, 12),
      longestConsecutiveRepetition,
      clusterTreatmentConcentration: openingDiversity.clusters.map((cluster) => ({
        parentLongFormId: cluster.parentLongFormId,
        strategyConcentration: cluster.strategyConcentration,
        exactSignatureConcentration:
          Math.round(
            ((4 - cluster.materiallyDifferentGrammarCount + 1) / Math.max(1, cluster.contentIds.length)) *
              10_000,
          ) / 10_000,
      })),
    },
    diagramDiversity: diagramDiversityDiagnostics(plans),
    crossEpisodeVisualSimilarity: {
      mean: average(crossEpisodePairs.map((pair) => pair.similarity)),
      maximum: Math.max(...crossEpisodePairs.map((pair) => pair.similarity)),
      pairs: crossEpisodePairs,
      matrix: {
        contentIds: similarityMatrixIds,
        rows: similarityMatrixIds.map((leftId) =>
          similarityMatrixIds.map((rightId) => {
            if (leftId === rightId) return 1;
            return (
              similarityByPair.get(`${leftId}<->${rightId}`) ??
              similarityByPair.get(`${rightId}<->${leftId}`) ??
              0
            );
          }),
        ),
      },
      warningCount: crossEpisodePairs.filter((pair) => pair.status === "warning").length,
      blockerCount: crossEpisodePairs.filter((pair) => pair.status === "blocker").length,
      hotspots: ["L01<->L03", "L01<->L05", "L03<->L05"].map((pair) => {
        const result = crossEpisodePairs.find((candidate) => candidate.pair === pair);
        return {
          pair,
          before: hotspotBefore[pair] ?? null,
          after: result?.similarity ?? null,
          status: result?.status ?? "pass",
          matchingWindow: result?.matchingWindow ?? null,
        };
      }),
    },
    clusterMetrics: longPlans.map((longPlan) => {
      const cluster = plans.filter((plan) => plan.parentLongFormId === longPlan.contentId);
      return {
        parentLongFormId: longPlan.contentId,
        contentIds: cluster.map((plan) => plan.contentId),
        meanConsecutiveSimilarity: average(
          cluster.map((plan) => plan.diversityMetrics.consecutiveSceneSimilarity.mean),
        ),
        eligibleReuseOpportunities: eligibleReuse.filter(
          (decision) => decision.sourceContentId === longPlan.contentId,
        ).length,
      };
    }),
  };
}

function reviewSummary(plan: PositioningVisualPlanV2): ReviewPlanSummary {
  return {
    contentId: plan.contentId,
    format: plan.format,
    parentLongFormId: plan.parentLongFormId,
    planPath: `plans/${plan.contentId.toLowerCase()}.visual-plan.json`,
    planHash: plan.planHash,
    semanticPlanCacheKey: plan.semanticPlanCacheKey,
    canonicalImagePlanHash: plan.canonicalImagePlanHash,
    titleQaArtifactHash: plan.localizedTitleArtifact.artifactHash,
    vocabularyHash: plan.visualVocabulary.vocabularyHash,
    localizedTitles: plan.localizedTitleArtifact.locales,
    visualVocabulary: plan.visualVocabulary,
    assetCount: plan.assets.length,
    visualEventCount: plan.visualEvents.length,
    diagramCount: plan.diagrams.length,
    coldOpen: plan.coldOpen,
    progression: plan.progression,
    continuity: plan.continuity,
    sceneToNarrationAlignment: plan.scenes,
    generatedAssets: plan.assets,
    visualEvents: plan.visualEvents,
    diagramStructures: plan.diagrams,
    reuseDecisions: plan.assetReuseDecisions,
    diversityMetrics: plan.diversityMetrics,
    cadenceMetrics: plan.cadenceMetrics,
    titleQa: plan.localizedTitleArtifact,
    productionCoverage: plan.productionCoverage,
    validation: plan.validation.status,
  };
}

async function writeJson(filePath: string, value: unknown): Promise<void> {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

/**
 * Creates only selected, provider-free plan and prompt-preview artifacts.
 * This is deliberately separate from the full-series review, whose aggregate
 * diversity checks require all 24 catalogue entries.
 */
export async function generatePositioningVisualPlanCalibration(input: {
  readonly packDir: string;
  readonly outputDir: string;
  readonly contentIds: readonly string[];
  readonly configuration?: Partial<PositioningPlannerConfiguration>;
}): Promise<PositioningVisualCalibrationResult> {
  const requestedIds = [...new Set(input.contentIds.map((id) => id.trim()).filter(Boolean))];
  if (requestedIds.length === 0) throw new Error("Positioning calibration requires at least one content ID.");
  const packDir = path.resolve(input.packDir);
  const outputDir = path.resolve(input.outputDir);
  const manifest = parseSourceManifest(await readContainedPackJson(packDir, "meta/visual-reuse-manifest.json"));
  const lengths = parseNarrationLengths(await readContainedPackJson(packDir, "meta/narration-lengths.json"));
  const contentById = new Map(manifest.contents.map((content) => [content.contentId, content] as const));
  const parents = new Map(manifest.contents.filter((content) => content.format === "long").map((content) => [content.contentId, content] as const));
  const selected = requestedIds.map((id) => {
    const content = contentById.get(id);
    if (!content) throw new Error(`Unknown Veronica calibration content ID: ${id}.`);
    return content;
  });
  for (const content of selected.filter((candidate) => candidate.format === "short")) {
    if (!requestedIds.includes(parentLongFormId(content.contentId))) {
      throw new Error(`Calibration for ${content.contentId} requires its parent ${parentLongFormId(content.contentId)} for semantic reuse and continuity.`);
    }
  }
  const configuration: PositioningPlannerConfiguration = {
    imageProviderModel: input.configuration?.imageProviderModel ?? DEFAULT_CONFIGURATION.imageProviderModel,
    rendererVersion: input.configuration?.rendererVersion ?? DEFAULT_CONFIGURATION.rendererVersion,
  };
  const drafts: PlanDraft[] = [];
  const clusterDiagramTopologies = new Map<string, DiagramTopology["type"][]>();
  for (const content of manifest.contents.filter((candidate) => requestedIds.includes(candidate.contentId))) {
    const parent = parents.get(parentLongFormId(content.contentId));
    const duration = lengths.find((entry) => entry.contentId === content.contentId && entry.locale === "en");
    if (!parent || !duration) throw new Error(`Calibration inputs are incomplete for ${content.contentId}.`);
    const draft = await buildDraft({
      packDir,
      outputDir,
      content,
      parent,
      narrationLengthMinutes: duration.estimatedMinutes,
      configuration,
      priorClusterDiagramTopologies: clusterDiagramTopologies.get(parent.contentId) ?? [],
    });
    drafts.push(draft);
    clusterDiagramTopologies.set(parent.contentId, [...(clusterDiagramTopologies.get(parent.contentId) ?? []), ...draft.diagrams.map((diagram) => diagram.type)]);
  }
  const plans = finalizePlans(attachReuse(drafts));
  const failed = plans.filter((plan) => plan.validation.status === "fail");
  if (failed.length > 0) throw new Error(`Positioning calibration failed: ${failed.map((plan) => `${plan.contentId}[${plan.validation.failures.join(",")}]`).join("; ")}`);
  const planPaths = plans.map((plan) => path.join(outputDir, "plans", `${plan.contentId.toLowerCase()}.visual-plan.json`));
  await Promise.all(plans.map((plan, index) => writeJson(planPaths[index]!, plan)));
  const previewPath = path.join(outputDir, "calibration-prompt-previews.json");
  await writeJson(previewPath, {
    schemaVersion: "veronicabenini-positioning-calibration-preview.v1",
    visualLanguageVersion: VERONICA_VISUAL_LANGUAGE_VERSION,
    providerCalls: 0,
    plans: plans.map((plan) => ({
      contentId: plan.contentId,
      format: plan.format,
      visualStoryBible: plan.visualStoryBible,
      chapters: plan.chapters,
      beats: plan.scenes.map((scene) => ({
        sceneId: scene.sceneId,
        visibleThesis: scene.visibleThesis,
        newInformation: scene.newInformation,
        narrativeFunction: scene.narrativeFunction,
        visualFamily: scene.visualFamily,
        continuityGroup: scene.continuityGroup,
        callbackToBeatId: scene.callbackToBeatId,
        promptPreview: plan.assets.find((asset) => asset.assetId === scene.assetId)?.prompt,
      })),
    })),
  });
  return { outputDir, contentIds: plans.map((plan) => plan.contentId), planPaths, previewPath, providerCalls: 0 };
}

export async function generatePositioningVisualPlans(input: {
  readonly packDir: string;
  readonly outputDir: string;
  readonly configuration?: Partial<PositioningPlannerConfiguration>;
}): Promise<PositioningVisualPlanningResult> {
  const packDir = path.resolve(input.packDir);
  const outputDir = path.resolve(input.outputDir);
  const manifest = parseSourceManifest(
    await readContainedPackJson(packDir, "meta/visual-reuse-manifest.json"),
  );
  const lengths = parseNarrationLengths(
    await readContainedPackJson(packDir, "meta/narration-lengths.json"),
  );
  const configuration: PositioningPlannerConfiguration = {
    imageProviderModel: input.configuration?.imageProviderModel ?? DEFAULT_CONFIGURATION.imageProviderModel,
    rendererVersion: input.configuration?.rendererVersion ?? DEFAULT_CONFIGURATION.rendererVersion,
  };
  const parents = new Map(
    manifest.contents.filter((content) => content.format === "long").map((content) => [content.contentId, content]),
  );
  const drafts: PlanDraft[] = [];
  const clusterDiagramTopologies = new Map<string, DiagramTopology["type"][]>();
  for (const content of manifest.contents) {
    const parentId = parentLongFormId(content.contentId);
    const parent = parents.get(parentId);
    if (!parent) throw new Error(`Missing parent long-form source for ${content.contentId}.`);
    const duration = lengths.find(
      (entry) => entry.contentId === content.contentId && entry.locale === "en",
    );
    if (!duration) throw new Error(`Missing English narration length for ${content.contentId}.`);
    const draft = await buildDraft({
      packDir,
      outputDir,
      content,
      parent,
      narrationLengthMinutes: duration.estimatedMinutes,
      configuration,
      priorClusterDiagramTopologies: clusterDiagramTopologies.get(parentId) ?? [],
    });
    drafts.push(draft);
    clusterDiagramTopologies.set(parentId, [
      ...(clusterDiagramTopologies.get(parentId) ?? []),
      ...draft.diagrams.map((diagram) => diagram.type),
    ]);
  }
  const plans = finalizePlans(attachReuse(drafts));
  const failed = plans.filter((plan) => plan.validation.status === "fail");
  if (failed.length > 0) {
    throw new Error(
      `Positioning visual-plan validation failed closed: ${failed
        .map((plan) => `${plan.contentId}[${plan.validation.failures.join(",")}]`)
        .join("; ")}`,
    );
  }
  const aggregate = aggregateMetrics(plans);
  const aggregateBlockers = [
    ...(aggregate.openingDiversity.status === "fail"
      ? aggregate.openingDiversity.failures
      : []),
    ...(aggregate.crossEpisodeVisualSimilarity.blockerCount > 0
      ? [`long-form-similarity-blockers:${aggregate.crossEpisodeVisualSimilarity.blockerCount}`]
      : []),
    ...(aggregate.diagramDiversity.semanticJustificationFailures.length > 0
      ? [
          `diagram-semantic-justification-failures:${aggregate.diagramDiversity.semanticJustificationFailures.length}`,
        ]
      : []),
    ...(aggregate.localizationOverlayFit.afterRiskCount > 0
      ? [`localized-overlay-fit-risks:${aggregate.localizationOverlayFit.afterRiskCount}`]
      : []),
  ];
  if (aggregateBlockers.length > 0) {
    throw new Error(`Positioning aggregate validation failed closed: ${aggregateBlockers.join(",")}`);
  }
  await Promise.all(
    plans.map((plan) =>
      writeJson(
        path.join(outputDir, "plans", `${plan.contentId.toLowerCase()}.visual-plan.json`),
        plan,
      ),
    ),
  );
  const comparison = {
    schemaVersion: "veronicabenini-positioning-visual-comparison.v2",
    methodology:
      "V1 baseline was measured from the reviewed 24-plan fixture using normalized viewer-visible grammar fields; V2 uses the same duplicate/similarity feature families plus explicit event and reuse contracts.",
    before: LEGACY_BASELINE,
    after: aggregate,
    improvements: {
      visualGrammarDiversity: LEGACY_BASELINE.visualGrammarDuplicateRate - aggregate.visualGrammarDuplicateRate,
      environmentDiversity: LEGACY_BASELINE.environmentDuplicateRate - aggregate.environmentDuplicateRate,
      compositionDiversity: LEGACY_BASELINE.compositionDuplicateRate - aggregate.compositionDuplicateRate,
      diagramTopologyDiversity: LEGACY_BASELINE.diagramTopologyDuplicateRate - aggregate.diagramTopologyDuplicateRate,
      consecutiveSceneSimilarity: LEGACY_BASELINE.consecutiveSceneSimilarity - aggregate.consecutiveSceneSimilarity,
      shortsHookProgression:
        aggregate.shortsHookProgressionPassRate - LEGACY_BASELINE.shortsHookProgressionPassRate,
      visualEventCadence:
        LEGACY_BASELINE.meanSecondsPerVisualEvent - aggregate.meanSecondsPerVisualEvent,
      crossContentReuseOpportunities:
        aggregate.reusableAssetOpportunities - LEGACY_BASELINE.reusableAssetOpportunities,
      hookExactDuplicateRate:
        LEGACY_BASELINE.hookExactDuplicateRate - aggregate.openingDiversity.exactDuplicateRate,
      maxHookSignatureFrequency:
        LEGACY_BASELINE.maxHookSignatureFrequency -
        aggregate.openingDiversity.maxExactSignatureFrequency,
      localizedTitleOverlayRiskCount:
        LEGACY_BASELINE.localizedTitleOverlayRiskCount -
        aggregate.localizationOverlayFit.afterRiskCount,
    },
  };
  const comparisonPath = path.join(outputDir, "before-after-aggregate-metrics.json");
  await writeJson(comparisonPath, comparison);
  const reviewBase = {
    schemaVersion: POSITIONING_REVIEW_VERSION,
    seriesId: manifest.seriesId,
    plannerVersion: POSITIONING_PLANNER_VERSION,
    contentIds: plans.map((plan) => plan.contentId),
    plans: plans.map(reviewSummary),
    aggregateSeriesMetrics: aggregate,
    beforeAfterComparisonPath: "before-after-aggregate-metrics.json",
    cacheSemantics: {
      semanticPlanExcludes: ["localized-titles", "translations", "image-provider", "ffmpeg-version"],
      canonicalImageIncludes: ["semantic-plan", "image-provider-model", "prompt-contract"],
      titleQaIncludes: ["localized-titles", "title-qa-version"],
      renderEventsInclude: ["semantic-plan", "timing", "ffmpeg-renderer-version"],
    },
    validation: {
      status: "pass" as const,
      planCount: plans.length,
      longPlans: plans.filter((plan) => plan.format === "long").length,
      shortPlans: plans.filter((plan) => plan.format === "short").length,
      highBlockingFindings: aggregateBlockers.length,
      reviewWarnings: aggregate.crossEpisodeVisualSimilarity.warningCount,
      textInGeneratedImage: false,
      paidGenerationPerformed: false,
    },
    totals: {
      canonicalAssets: plans.reduce((sum, plan) => sum + plan.assets.length, 0),
      visualEvents: plans.reduce((sum, plan) => sum + plan.visualEvents.length, 0),
      diagrams: plans.reduce((sum, plan) => sum + plan.diagrams.length, 0),
      reusableAssetOpportunities: aggregate.reusableAssetOpportunities,
    },
  };
  const reviewPackHash = stableHash(reviewBase);
  const generatedAtMs = Date.now();
  const reviewFileName = `bulk-visual-review-${generatedAtMs}.json`;
  const reviewPackPath = path.join(outputDir, reviewFileName);
  const latestReviewPackPath = path.join(outputDir, "bulk-visual-review.json");
  const reviewEnvelope = { ...reviewBase, reviewPackHash, generatedAtMs };
  await Promise.all([
    writeJson(reviewPackPath, reviewEnvelope),
    writeJson(latestReviewPackPath, reviewEnvelope),
  ]);
  await fs.writeFile(
    path.join(outputDir, "VALIDATION.md"),
    [
      "# Veronica positioning visual-plan V2 validation",
      "",
      "All 6 long-form and 18 supporting Short plans passed typed topology, viewer-visible diversity, continuity, hook progression, locale-safe image, safe-region, deterministic hash, reuse-eligibility, and event-cadence gates.",
      "",
      "Generated imagery remains text-free and canonical; localized overlays and title transcreation QA are separate artifacts. No image, TTS, render, music/SFX, or publishing provider was called.",
      "",
    ].join("\n"),
    "utf8",
  );
  return {
    outputDir,
    reviewPackPath,
    latestReviewPackPath,
    comparisonPath,
    generatedAtMs,
    contentIds: plans.map((plan) => plan.contentId),
    longPlanCount: reviewBase.validation.longPlans,
    shortPlanCount: reviewBase.validation.shortPlans,
    canonicalAssetCount: reviewBase.totals.canonicalAssets,
    visualEventCount: reviewBase.totals.visualEvents,
    diagramCount: reviewBase.totals.diagrams,
    reusableAssetOpportunityCount: aggregate.reusableAssetOpportunities,
    reviewPackHash,
  };
}
