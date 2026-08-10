import fs from "node:fs/promises";
import path from "node:path";
import { z } from "zod";
import { fileExists, hashText, writeJsonAtomic } from "./index.js";

export const SEMANTIC_IMAGE_PROMPT_SCHEMA_VERSION = 1 as const;
export const SEMANTIC_IMAGE_PROMPT_CORE_VERSION =
  "semantic-image-prompt-core.v1" as const;
export const SEMANTIC_IMAGE_PROMPT_MAX_ASSETS_PER_REQUEST = 40 as const;
export const SEMANTIC_IMAGE_PROMPT_NORMAL_MIN_WORDS = 250 as const;
export const SEMANTIC_IMAGE_PROMPT_NORMAL_MAX_WORDS = 350 as const;
export const SEMANTIC_IMAGE_PROMPT_ABSOLUTE_MAX_WORDS = 450 as const;

export const semanticImagePromptGenreSchema = z.enum([
  "veronicaBenini",
  "history",
]);

export const semanticNarrativePurposeSchema = z.enum([
  "hook",
  "problem",
  "proof",
  "comparison",
  "explanation",
  "method",
  "transition",
  "payoff",
  "event",
  "location",
  "movement",
  "evidence",
  "other",
]);

export const semanticVisualRelationshipSchema = z.enum([
  "decision",
  "comparison",
  "hidden-vs-visible",
  "cause-effect",
  "before-after",
  "progression",
  "selection",
  "transformation",
  "network",
  "evidence",
  "event",
  "movement",
  "spatial",
  "other",
]);

const historyPeriodSchema = z.strictObject({
  startYear: z.number().int().optional(),
  endYear: z.number().int().optional(),
  displayEra: z.string().min(1).optional(),
});

const historyGeographySchema = z.strictObject({
  placeIds: z.array(z.string().min(1)),
  canonicalPlaceNames: z.array(z.string().min(1)),
});

const historyEntitiesSchema = z.strictObject({
  entityIds: z.array(z.string().min(1)),
  approvedDisplayNames: z.array(z.string().min(1)),
});

export const historyAssetSemanticContextV1Schema = z.strictObject({
  period: historyPeriodSchema.optional(),
  geography: historyGeographySchema.optional(),
  entities: historyEntitiesSchema.optional(),
  historicalFigures: z
    .array(
      z.strictObject({
        entityId: z.string().min(1),
        canonicalName: z.string().min(1),
        referenceEligible: z.boolean(),
        referenceAssetId: z.string().min(1).optional(),
      }),
    )
    .optional(),
  materialCulture: z
    .strictObject({
      approvedDetails: z.array(z.string().min(1)),
      prohibitedAnachronisms: z.array(z.string().min(1)),
    })
    .optional(),
  evidence: z
    .strictObject({
      evidenceIds: z.array(z.string().min(1)),
      confidenceMode: z.string().min(1).optional(),
    })
    .optional(),
  assetMode: z.enum([
    "reenactment",
    "map",
    "diagram",
    "object",
    "document",
    "environment",
  ]),
  approvedMapStateIds: z.array(z.string().min(1)).optional(),
  approvedDiagramStateIds: z.array(z.string().min(1)).optional(),
});

export const semanticAssetBriefV1Schema = z.strictObject({
  assetId: z.string().min(1),
  beatId: z.string().min(1),
  narrativePurpose: semanticNarrativePurposeSchema,
  spokenMeaning: z.string().min(1),
  viewerTakeaway: z.string().min(1),
  instantRead: z.string().min(1),
  visualRelationship: semanticVisualRelationshipSchema,
  mustShow: z.array(z.string().min(1)).min(1),
  mustNotShow: z.array(z.string().min(1)),
  subjectRoles: z.array(z.string().min(1)).min(1),
  environmentIntent: z.string().min(1),
  actionIntent: z.string().min(1),
  objectIntent: z.array(z.string().min(1)),
  conceptualComposition: z.string().min(1),
  relevanceAnchors: z.array(z.string().min(1)).min(1),
  genericDriftRisks: z.array(z.string().min(1)),
  generationBasePrompt: z.string().min(1),
  historyContext: historyAssetSemanticContextV1Schema.optional(),
});

const veronicaSemanticContextV1Schema = z.strictObject({
  genre: z.literal("veronicaBenini"),
  visualDirectionVersion: z.string().min(1),
  antiDriftRules: z.array(z.string().min(1)).min(1),
});

const historySemanticContextV1Schema = z.strictObject({
  genre: z.literal("history"),
  visualDirectionVersion: z.string().min(1),
  sourceAuthorityMode: z.string().min(1),
  trustSnapshotHash: z.string().min(1),
  antiDriftRules: z.array(z.string().min(1)).min(1),
});

export const semanticImagePromptBriefV1Schema = z.strictObject({
  schemaVersion: z.literal(SEMANTIC_IMAGE_PROMPT_SCHEMA_VERSION),
  genre: semanticImagePromptGenreSchema,
  contentId: z.string().min(1),
  sourceSemanticHash: z.string().regex(/^[a-f0-9]{64}$/u),
  visualPlanHash: z.string().regex(/^[a-f0-9]{64}$/u),
  contentThesis: z.string().min(1),
  viewerPromise: z.string().min(1),
  visualDirection: z.strictObject({
    coreStoryLogic: z.string().min(1),
    emotionalArc: z.string().min(1),
    realismLevel: z.string().min(1),
    overallVisualLanguage: z.array(z.string().min(1)).min(1),
    forbiddenDrift: z.array(z.string().min(1)).min(1),
  }),
  assets: z.array(semanticAssetBriefV1Schema).min(1),
  genreContext: z.discriminatedUnion("genre", [
    veronicaSemanticContextV1Schema,
    historySemanticContextV1Schema,
  ]),
});

export type SemanticImagePromptGenre = z.infer<
  typeof semanticImagePromptGenreSchema
>;
export interface SemanticImagePromptCapability {
  readonly enabled: boolean;
  readonly provider: "openai";
  readonly cache: true;
  readonly failClosed: true;
  readonly adapter: SemanticImagePromptGenre;
}
export type SemanticAssetBriefV1 = z.infer<typeof semanticAssetBriefV1Schema>;
export type SemanticImagePromptBriefV1 = z.infer<
  typeof semanticImagePromptBriefV1Schema
>;
export type HistoryAssetSemanticContextV1 = z.infer<
  typeof historyAssetSemanticContextV1Schema
>;

export type SemanticImagePromptFindingCode =
  | "SEMANTIC_IMAGE_BRIEF_MISSING"
  | "SEMANTIC_IMAGE_BRIEF_SCHEMA_INVALID"
  | "SEMANTIC_IMAGE_BRIEF_ASSET_MISMATCH"
  | "SEMANTIC_IMAGE_BRIEF_TEXT_IN_IMAGE"
  | "SEMANTIC_IMAGE_BRIEF_GENERIC_DRIFT"
  | "SEMANTIC_IMAGE_BRIEF_MISSING_ACTION"
  | "SEMANTIC_IMAGE_BRIEF_SOURCE_MISMATCH"
  | "SEMANTIC_IMAGE_BRIEF_PROVIDER_ERROR";

export interface SemanticImagePromptFinding {
  readonly code: string;
  readonly severity: "warning" | "blocking";
  readonly assetId?: string;
  readonly message: string;
}

export class SemanticImagePromptError extends Error {
  constructor(
    readonly code: SemanticImagePromptFindingCode | string,
    message: string,
    readonly findings: readonly SemanticImagePromptFinding[] = [],
    options?: ErrorOptions,
  ) {
    super(message, options);
    this.name = "SemanticImagePromptError";
  }
}

export interface SemanticImagePromptAssetInput {
  readonly assetId: string;
  readonly beatId: string;
  readonly narrationBeat: string;
  readonly currentPrompt: string;
  readonly approved: {
    readonly narrativePurpose: string;
    readonly subject: string;
    readonly action: string;
    readonly environment: string;
    readonly composition: string;
    readonly camera: string;
    readonly lighting: string;
    readonly props: readonly string[];
    readonly motionOpportunities: readonly string[];
    readonly negativeConstraints: readonly string[];
  };
  readonly historyContext?: HistoryAssetSemanticContextV1;
}

export interface SemanticImagePromptPlanInput {
  readonly genre: SemanticImagePromptGenre;
  readonly contentId: string;
  readonly title: string;
  readonly canonicalNarration: string;
  readonly format: string;
  readonly aspectRatio: string;
  readonly sourceSemanticHash: string;
  readonly visualPlanHash: string;
  readonly genreAdapterVersion: string;
  readonly genreVisualDirectionVersion: string;
  readonly genreContext: SemanticImagePromptBriefV1["genreContext"];
  readonly antiDriftRules: readonly string[];
  readonly assets: readonly SemanticImagePromptAssetInput[];
  readonly contextHashes?: Readonly<Record<string, string>>;
}

export const semanticImagePromptCacheArtifactSchema = z.strictObject({
  schemaVersion: z.literal(SEMANTIC_IMAGE_PROMPT_SCHEMA_VERSION),
  cacheStatus: z.enum(["miss", "refresh"]),
  cacheKey: z.string().regex(/^[a-f0-9]{64}$/u),
  sourceSemanticHash: z.string().regex(/^[a-f0-9]{64}$/u),
  visualPlanHash: z.string().regex(/^[a-f0-9]{64}$/u),
  plannerPromptVersion: z.string().min(1),
  plannerModel: z.string().min(1),
  plannerModelConfigHash: z.string().regex(/^[a-f0-9]{64}$/u),
  genreAdapterVersion: z.string().min(1),
  genreVisualDirectionVersion: z.string().min(1),
  createdAt: z.string().min(1),
  briefHash: z.string().regex(/^[a-f0-9]{64}$/u),
  brief: semanticImagePromptBriefV1Schema,
});

export type SemanticImagePromptCacheArtifact = z.infer<
  typeof semanticImagePromptCacheArtifactSchema
>;

export interface SemanticImagePromptOpenAiClient {
  readonly responses: {
    create(
      request: {
        readonly model: string;
        readonly input: ReadonlyArray<{
          readonly role: "system" | "user";
          readonly content: ReadonlyArray<{
            readonly type: "input_text";
            readonly text: string;
          }>;
        }>;
        readonly text: { readonly format: unknown };
        readonly max_output_tokens: number;
      },
      options?: { readonly signal?: AbortSignal },
    ): Promise<{
      readonly id: string;
      readonly output_text?: string;
      readonly output?: readonly unknown[];
      readonly status?: string;
      readonly incomplete_details?: { readonly reason?: string } | null;
    }>;
  };
}

const genericAestheticPattern =
  /\b(?:cinematic|premium|luxury|editorial|moody|stylish|thoughtful|dramatic)\b/iu;
const narrativeRelationshipPattern =
  /\b(?:choos|select|compar|evidence|proof|signal|hidden|visible|recogn|cause|effect|before|after|transform|progress|decision|event|movement|location|supply|policy|relationship)/iu;
const readableTextRequestPattern =
  /\b(?:show|include|display|render|write|feature|with)\b[^.]{0,48}\b(?:readable|legible|written)\b[^.]{0,24}\b(?:text|words|copy|label|logo|ui)/iu;

function stable(value: unknown): string {
  if (value === null || typeof value === "string" || typeof value === "boolean") {
    return JSON.stringify(value);
  }
  if (typeof value === "number") return JSON.stringify(Number.isFinite(value) ? value : null);
  if (Array.isArray(value)) return `[${value.map(stable).join(",")}]`;
  if (typeof value === "object") {
    return `{${Object.entries(value)
      .filter(([, item]) => item !== undefined)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, item]) => `${JSON.stringify(key)}:${stable(item)}`)
      .join(",")}}`;
  }
  throw new Error("Unsupported semantic image-prompt cache value.");
}

export function semanticImagePromptHash(value: unknown): string {
  return hashText(stable(value));
}

function asksForReadableImageText(value: string): boolean {
  return value
    .split(/[.;\n]/u)
    .some(
      (clause) =>
        readableTextRequestPattern.test(clause) &&
        !/\b(?:no|not|without|avoid|exclude|forbid)\b/iu.test(clause),
    );
}

export function validateSemanticImagePromptBrief(input: {
  readonly brief: SemanticImagePromptBriefV1;
  readonly plan: SemanticImagePromptPlanInput;
}): readonly SemanticImagePromptFinding[] {
  const findings: SemanticImagePromptFinding[] = [];
  if (
    input.brief.genre !== input.plan.genre ||
    input.brief.genreContext.genre !== input.plan.genre ||
    input.brief.contentId !== input.plan.contentId ||
    input.brief.sourceSemanticHash !== input.plan.sourceSemanticHash ||
    input.brief.visualPlanHash !== input.plan.visualPlanHash
  ) {
    findings.push({
      code: "SEMANTIC_IMAGE_BRIEF_SOURCE_MISMATCH",
      severity: "blocking",
      message: "Semantic brief genre/content/source/visual identity does not match canonical input.",
    });
  }
  const expected = new Map(input.plan.assets.map((asset) => [asset.assetId, asset.beatId]));
  const counts = new Map<string, number>();
  for (const asset of input.brief.assets) {
    counts.set(asset.assetId, (counts.get(asset.assetId) ?? 0) + 1);
    if (expected.get(asset.assetId) !== asset.beatId) {
      findings.push({
        code: "SEMANTIC_IMAGE_BRIEF_ASSET_MISMATCH",
        severity: "blocking",
        assetId: asset.assetId,
        message: `Asset ${asset.assetId} is unknown or has incorrect beat linkage.`,
      });
    }
    const semanticText = [
      asset.spokenMeaning,
      asset.viewerTakeaway,
      asset.instantRead,
      asset.environmentIntent,
      asset.actionIntent,
      asset.conceptualComposition,
      asset.generationBasePrompt,
      ...asset.mustShow,
      ...asset.objectIntent,
      ...asset.relevanceAnchors,
    ].join(" ");
    if (asksForReadableImageText(semanticText)) {
      findings.push({
        code: "SEMANTIC_IMAGE_BRIEF_TEXT_IN_IMAGE",
        severity: "blocking",
        assetId: asset.assetId,
        message: `Asset ${asset.assetId} asks for readable generated text.`,
      });
    }
    if (!asset.actionIntent.trim()) {
      findings.push({
        code: "SEMANTIC_IMAGE_BRIEF_MISSING_ACTION",
        severity: "blocking",
        assetId: asset.assetId,
        message: `Asset ${asset.assetId} has no visible action intent.`,
      });
    }
    if (
      genericAestheticPattern.test(asset.generationBasePrompt) &&
      !narrativeRelationshipPattern.test(semanticText)
    ) {
      findings.push({
        code: "SEMANTIC_IMAGE_BRIEF_GENERIC_DRIFT",
        severity: "blocking",
        assetId: asset.assetId,
        message: `Asset ${asset.assetId} uses aesthetics without a beat-specific visual relationship.`,
      });
    }
  }
  for (const [assetId] of expected) {
    if (counts.get(assetId) !== 1) {
      findings.push({
        code: "SEMANTIC_IMAGE_BRIEF_ASSET_MISMATCH",
        severity: "blocking",
        assetId,
        message: `Expected asset ${assetId} exactly once; received ${counts.get(assetId) ?? 0}.`,
      });
    }
  }
  for (const assetId of counts.keys()) {
    if (!expected.has(assetId)) {
      findings.push({
        code: "SEMANTIC_IMAGE_BRIEF_ASSET_MISMATCH",
        severity: "blocking",
        assetId,
        message: `Semantic brief contains unknown asset ${assetId}.`,
      });
    }
  }
  return findings;
}

export function assembleSemanticImagePrompt(input: {
  readonly semantic: SemanticAssetBriefV1;
  readonly approved: SemanticImagePromptAssetInput["approved"];
  readonly aspectRatio: string;
  readonly genreStyle: string;
  readonly genreConstraints: readonly string[];
  readonly factualContext?: readonly string[];
  readonly projectionMode?: "legacy" | "semantic-priority";
  /** Optional genre-specific canonicalized constraints for semantic-priority projection. */
  readonly projectedNegativeConstraints?: readonly string[];
  /** Optional genre-specific text-free policy rendered as the sole suffix rule. */
  readonly textFreeConstraint?: string;
  /** Optional tighter normal projection ceiling; the absolute provider guard remains unchanged. */
  readonly normalMaximumWords?: number;
}): string {
  if (input.projectionMode === "semantic-priority") {
    return assembleSemanticPriorityImagePrompt(input);
  }
  const limitWords = (value: string, maximum: number): string => {
    const words = value.trim().split(/\s+/u);
    return words.length > maximum ? `${words.slice(0, maximum).join(" ")}…` : value.trim();
  };
  const list = (values: readonly string[], items = values.length, words = 18): string =>
    values.length > 0 ? values.slice(0, items).map((value) => limitWords(value, words)).join("; ") : "none";
  const constraints = [
    ...input.semantic.mustNotShow,
    ...input.semantic.genericDriftRisks,
    ...input.approved.negativeConstraints,
    ...input.genreConstraints,
  ];
  const factualContext = [...(input.factualContext ?? [])].sort((left, right) => {
    const priority = (value: string): number =>
      /renderer remains authoritative|preserve state ids/iu.test(value) ? 0 : 1;
    return priority(left) - priority(right);
  });
  return [
    `TEXT-FREE CANONICAL IMAGE — ${input.aspectRatio}.`,
    `Purpose: ${input.semantic.narrativePurpose}; takeaway: ${limitWords(input.semantic.viewerTakeaway, 20)}.`,
    `Scene: ${limitWords(input.semantic.generationBasePrompt, 48)}.`,
    `Must show: ${list(input.semantic.mustShow, 2, 18)}. Action: ${limitWords(input.semantic.actionIntent, 26)}.`,
    `Subject: ${limitWords(input.approved.subject, 20)} (${list(input.semantic.subjectRoles, 2, 8)}).`,
    `Setting: ${limitWords(input.approved.environment, 18)}. Props: ${list(input.approved.props, 4, 8)}.`,
    `Composition: ${limitWords(input.approved.composition, 22)}. Camera: ${limitWords(input.approved.camera, 12)}. Lighting: ${limitWords(input.approved.lighting, 12)}.`,
    `Motion: ${list(input.approved.motionOpportunities, 3, 4)}. Relationship: ${input.semantic.visualRelationship}.`,
    `Anchors: ${list(input.semantic.relevanceAnchors, 2, 14)}.`,
    ...factualContext.slice(0, 2).map((value) => `Factual context: ${limitWords(value, 16)}.`),
    `Style: ${limitWords(input.genreStyle, 14)}.`,
    `Avoid: ${list(constraints, 5, 12)}.`,
    "No captions, subtitles, labels, letters, numbers, logos, watermarks, fake UI copy, or readable generated text.",
  ].join(" ");
}

interface SemanticPromptSection {
  readonly label: string;
  readonly units: string[];
  readonly minimumUnits: number;
  readonly optional?: boolean;
}

function countPromptWords(value: string): number {
  const trimmed = value.trim();
  return trimmed.length === 0 ? 0 : trimmed.split(/\s+/u).length;
}

function normalizePromptUnit(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();
}

function structuralPromptUnits(value: string): readonly string[] {
  return value
    .trim()
    .split(/(?<=[.!?])\s+|\s*[;\n]+\s*/u)
    .map((unit) => unit.trim().replace(/[.,;:]+$/u, ""))
    .filter((unit) => unit.length > 0);
}

function selectStructuralPromptUnits(input: {
  readonly values: readonly string[];
  readonly maximumUnits: number;
  readonly maximumWordsPerUnit: number;
  readonly maximumUnitsPerValue?: number;
  readonly seen?: Set<string>;
}): string[] {
  const selected: string[] = [];
  for (const value of input.values) {
    let selectedForValue = 0;
    for (const unit of structuralPromptUnits(value)) {
      if (selected.length >= input.maximumUnits) return selected;
      if (selectedForValue >= (input.maximumUnitsPerValue ?? 1)) break;
      const wordCount = countPromptWords(unit);
      if (wordCount > input.maximumWordsPerUnit) {
        throw new SemanticImagePromptError(
          "SEMANTIC_IMAGE_PROMPT_PROJECTION_OVERFLOW",
          `A semantic prompt clause has ${wordCount} words; split it structurally before provider projection.`,
        );
      }
      const normalized = normalizePromptUnit(unit);
      if (!normalized || input.seen?.has(normalized)) continue;
      selected.push(unit);
      input.seen?.add(normalized);
      selectedForValue += 1;
    }
  }
  return selected;
}

function renderSemanticPromptSections(
  prefix: string,
  sections: readonly SemanticPromptSection[],
  suffix: string,
): string {
  return [
    prefix,
    ...sections
      .filter((section) => section.units.length > 0)
      .map((section) => `${section.label}: ${section.units.join("; ")}.`),
    suffix,
  ].join(" ");
}

function assembleSemanticPriorityImagePrompt(input: {
  readonly semantic: SemanticAssetBriefV1;
  readonly approved: SemanticImagePromptAssetInput["approved"];
  readonly aspectRatio: string;
  readonly genreStyle: string;
  readonly genreConstraints: readonly string[];
  readonly factualContext?: readonly string[];
  readonly projectedNegativeConstraints?: readonly string[];
  readonly textFreeConstraint?: string;
  readonly normalMaximumWords?: number;
}): string {
  const seen = new Set<string>();
  const select = (
    values: readonly string[],
    maximumUnits: number,
    maximumWordsPerUnit: number,
    deduplicate = true,
    maximumUnitsPerValue = 1,
  ): string[] => {
    const units = selectStructuralPromptUnits({
      values,
      maximumUnits,
      maximumWordsPerUnit,
      maximumUnitsPerValue,
      ...(deduplicate ? { seen } : {}),
    });
    if (!deduplicate) {
      for (const unit of units) seen.add(normalizePromptUnit(unit));
    }
    return units;
  };
  const constraints = input.projectedNegativeConstraints ?? [
    ...input.semantic.mustNotShow,
    ...input.semantic.genericDriftRisks,
    ...input.approved.negativeConstraints,
    ...input.genreConstraints,
  ];
  const sections: SemanticPromptSection[] = [
    {
      label: "Spoken meaning",
      units: select([input.semantic.spokenMeaning], 2, 45, false, 2),
      minimumUnits: 1,
    },
    {
      label: "Viewer takeaway",
      units: select([input.semantic.viewerTakeaway], 2, 40, false, 2),
      minimumUnits: 1,
    },
    {
      label: "Must show",
      units: select(input.semantic.mustShow, 4, 35, false),
      minimumUnits: Math.min(input.semantic.mustShow.length, 4),
    },
    {
      label: "Visible action",
      units: select([input.semantic.actionIntent], 2, 45, false, 2),
      minimumUnits: 1,
    },
    {
      label: "Primary scene",
      units: select([input.semantic.generationBasePrompt], 2, 55, true, 2),
      minimumUnits: 0,
      optional: true,
    },
    {
      label: "Environment",
      units: select([input.approved.environment], 2, 45, false, 2),
      minimumUnits: 1,
    },
    {
      label: "Essential subjects",
      units: select([input.approved.subject], 3, 40, false, 3),
      minimumUnits: 1,
    },
    {
      label: "Objects and evidence",
      units: select(input.approved.props, 5, 25, false),
      minimumUnits: Math.min(input.approved.props.length, 3),
    },
    {
      label: "Composition",
      units: select([input.approved.composition], 3, 45, false, 3),
      minimumUnits: 1,
    },
    {
      label: "Camera and lens",
      units: select([input.approved.camera], 3, 30, false, 3),
      minimumUnits: 1,
    },
    {
      label: "Lighting",
      units: select([input.approved.lighting], 2, 25, false, 2),
      minimumUnits: 1,
    },
    {
      label: "Genre and factual constraints",
      units: select(
        [input.genreStyle, ...(input.factualContext ?? [])],
        4,
        40,
        false,
      ),
      minimumUnits: 1,
    },
    {
      label: "Immediate-read staging",
      units: [
        "Use concrete human behavior and visible cause-and-effect so the core contrast is understood in under one second on a phone screen",
        "Keep the frame plausible, specific, and visually coherent rather than relying on decorative metaphor or unexplained symbolism",
      ],
      minimumUnits: 0,
      optional: true,
    },
    {
      label: "Relationship and continuity",
      units: select(
        [
          input.semantic.visualRelationship,
          ...input.approved.motionOpportunities,
        ],
        4,
        20,
      ),
      minimumUnits: 0,
      optional: true,
    },
    {
      label: "Negative constraints",
      units: select(constraints, 8, 35),
      minimumUnits: Math.min(constraints.length, 3),
    },
  ];
  const prefix = `TEXT-FREE CANONICAL IMAGE — native ${input.aspectRatio} composition.`;
  const suffix =
    input.textFreeConstraint ??
    "No captions, subtitles, labels, letters, numbers, logos, watermarks, fake UI copy, or readable generated text.";
  let prompt = renderSemanticPromptSections(prefix, sections, suffix);

  const normalMaximumWords = input.normalMaximumWords ?? SEMANTIC_IMAGE_PROMPT_NORMAL_MAX_WORDS;
  for (let index = sections.length - 1; countPromptWords(prompt) > normalMaximumWords && index >= 0; index -= 1) {
    const section = sections[index]!;
    while (section.units.length > section.minimumUnits) {
      section.units.pop();
      prompt = renderSemanticPromptSections(prefix, sections, suffix);
      if (countPromptWords(prompt) <= normalMaximumWords) break;
    }
  }
  if (countPromptWords(prompt) > SEMANTIC_IMAGE_PROMPT_ABSOLUTE_MAX_WORDS) {
    throw new SemanticImagePromptError(
      "SEMANTIC_IMAGE_PROMPT_PROJECTION_OVERFLOW",
      `Structurally compacted semantic image prompt exceeds ${SEMANTIC_IMAGE_PROMPT_ABSOLUTE_MAX_WORDS} words.`,
    );
  }
  return prompt;
}

export function buildSemanticImagePromptCacheKey(input: {
  readonly plan: SemanticImagePromptPlanInput;
  readonly plannerPromptVersion: string;
  readonly plannerModel: string;
  readonly plannerModelConfig?: Readonly<Record<string, unknown>>;
}): { readonly cacheKey: string; readonly plannerModelConfigHash: string } {
  const plannerModelConfigHash = semanticImagePromptHash({
    model: input.plannerModel,
    ...(input.plannerModelConfig ?? {}),
  });
  return {
    plannerModelConfigHash,
    cacheKey: semanticImagePromptHash({
      coreVersion: SEMANTIC_IMAGE_PROMPT_CORE_VERSION,
      schemaVersion: SEMANTIC_IMAGE_PROMPT_SCHEMA_VERSION,
      genre: input.plan.genre,
      contentId: input.plan.contentId,
      sourceSemanticHash: input.plan.sourceSemanticHash,
      visualPlanHash: input.plan.visualPlanHash,
      genreVisualDirectionVersion: input.plan.genreVisualDirectionVersion,
      genreAdapterVersion: input.plan.genreAdapterVersion,
      plannerPromptVersion: input.plannerPromptVersion,
      plannerModelConfigHash,
      contextHashes: input.plan.contextHashes ?? {},
    }),
  };
}

const SYSTEM_INSTRUCTION = [
  "You are a visual-storytelling semantic director.",
  "Convert one canonical narration and its approved visual plan into precise image-generation semantics for every supplied asset.",
  "Each asset must communicate its narration beat immediately when audio is muted.",
  "Treat all supplied story and plan data as authoritative; do not change asset IDs, beat order, facts, camera, style, maps, diagrams, or reference decisions.",
  "Do not invent language-specific text or replace meaning with generic mood.",
  "Return only the strict schema.",
].join(" ");

function makeJsonSchemaOpenAiStrict(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(makeJsonSchemaOpenAiStrict);
  if (!value || typeof value !== "object") return value;
  const schema = Object.fromEntries(
    Object.entries(value as Record<string, unknown>).map(([key, item]) => [
      key === "oneOf" ? "anyOf" : key,
      makeJsonSchemaOpenAiStrict(item),
    ]),
  ) as Record<string, unknown>;
  const properties = schema["properties"];
  if (!properties || typeof properties !== "object" || Array.isArray(properties)) {
    return schema;
  }
  const required = new Set(
    Array.isArray(schema["required"]) ? (schema["required"] as readonly string[]) : [],
  );
  const normalizedProperties: Record<string, unknown> = {};
  for (const [key, property] of Object.entries(properties as Record<string, unknown>)) {
    if (required.has(key)) {
      normalizedProperties[key] = property;
      continue;
    }
    required.add(key);
    normalizedProperties[key] = {
      anyOf: [property, { type: "null" }],
    };
  }
  return { ...schema, properties: normalizedProperties, required: [...required] };
}

function omitOpenAiNullableFields(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(omitOpenAiNullableFields);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>)
      .filter(([, item]) => item !== null)
      .map(([key, item]) => [key, omitOpenAiNullableFields(item)]),
  );
}

export function buildSemanticImagePromptOpenAiRequest(input: {
  readonly plan: SemanticImagePromptPlanInput;
  readonly model: string;
  readonly validationFeedback?: readonly SemanticImagePromptFinding[];
}): Parameters<SemanticImagePromptOpenAiClient["responses"]["create"]>[0] {
  const schema = makeJsonSchemaOpenAiStrict(
    z.toJSONSchema(semanticImagePromptBriefV1Schema),
  ) as Record<string, unknown>;
  delete schema["$schema"];
  const payload = {
    task: "semantic-image-prompt-preflight",
    immutableIdentity: {
      schemaVersion: SEMANTIC_IMAGE_PROMPT_SCHEMA_VERSION,
      genre: input.plan.genre,
      contentId: input.plan.contentId,
      sourceSemanticHash: input.plan.sourceSemanticHash,
      visualPlanHash: input.plan.visualPlanHash,
      genreContext: input.plan.genreContext,
    },
    title: input.plan.title,
    format: input.plan.format,
    aspectRatio: input.plan.aspectRatio,
    canonicalNarration: input.plan.canonicalNarration,
    antiDriftRules: input.plan.antiDriftRules,
    assets: input.plan.assets,
    ...(input.validationFeedback && input.validationFeedback.length > 0
      ? {
          repairInstruction: "Correct every listed validation finding without changing immutable IDs or approved facts.",
          validationFeedback: input.validationFeedback,
        }
      : {}),
  };
  return {
    model: input.model,
    max_output_tokens: 16_000,
    input: [
      {
        role: "system",
        content: [{ type: "input_text", text: SYSTEM_INSTRUCTION }],
      },
      {
        role: "user",
        content: [{ type: "input_text", text: JSON.stringify(payload) }],
      },
    ],
    text: {
      format: {
        type: "json_schema",
        name: "semantic_image_prompt_brief_v1",
        strict: true,
        schema,
      },
    },
  };
}

function containsRefusal(value: unknown): boolean {
  if (Array.isArray(value)) return value.some(containsRefusal);
  if (!value || typeof value !== "object") return false;
  const record = value as Record<string, unknown>;
  return record["type"] === "refusal" || Object.values(record).some(containsRefusal);
}

async function readCachedArtifact(
  cachePath: string,
): Promise<SemanticImagePromptCacheArtifact | null> {
  if (!(await fileExists(cachePath))) return null;
  try {
    return semanticImagePromptCacheArtifactSchema.parse(
      JSON.parse(await fs.readFile(cachePath, "utf8")) as unknown,
    );
  } catch {
    return null;
  }
}

export async function deriveSemanticImagePromptBrief(input: {
  readonly plan: SemanticImagePromptPlanInput;
  readonly cachePath: string;
  readonly client: SemanticImagePromptOpenAiClient;
  readonly model: string;
  readonly plannerPromptVersion: string;
  readonly plannerModelConfig?: Readonly<Record<string, unknown>>;
  readonly refresh?: boolean;
  readonly timeoutMs?: number;
  readonly now?: () => string;
  readonly validateGenre?: (input: {
    readonly brief: SemanticImagePromptBriefV1;
    readonly plan: SemanticImagePromptPlanInput;
  }) => readonly SemanticImagePromptFinding[];
}): Promise<{
  readonly cacheStatus: "hit" | "miss" | "refresh";
  readonly artifact: SemanticImagePromptCacheArtifact;
  readonly previousArtifact: SemanticImagePromptCacheArtifact | null;
  readonly findings: readonly SemanticImagePromptFinding[];
}> {
  if (!input.model.trim()) {
    throw new SemanticImagePromptError(
      "SEMANTIC_IMAGE_BRIEF_PROVIDER_ERROR",
      "Semantic image-prompt preflight requires a configured planning model.",
    );
  }
  const identity = buildSemanticImagePromptCacheKey({
    plan: input.plan,
    plannerPromptVersion: input.plannerPromptVersion,
    plannerModel: input.model,
    ...(input.plannerModelConfig
      ? { plannerModelConfig: input.plannerModelConfig }
      : {}),
  });
  const previousArtifact = await readCachedArtifact(input.cachePath);
  if (!input.refresh && previousArtifact?.cacheKey === identity.cacheKey) {
    return {
      cacheStatus: "hit",
      artifact: previousArtifact,
      previousArtifact,
      findings: [],
    };
  }
  if (input.plan.assets.length > SEMANTIC_IMAGE_PROMPT_MAX_ASSETS_PER_REQUEST) {
    const chunks = Array.from(
      {
        length: Math.ceil(
          input.plan.assets.length / SEMANTIC_IMAGE_PROMPT_MAX_ASSETS_PER_REQUEST,
        ),
      },
      (_, index) =>
        input.plan.assets.slice(
          index * SEMANTIC_IMAGE_PROMPT_MAX_ASSETS_PER_REQUEST,
          (index + 1) * SEMANTIC_IMAGE_PROMPT_MAX_ASSETS_PER_REQUEST,
        ),
    );
    const chunkResults = [];
    for (let index = 0; index < chunks.length; index += 1) {
      const assets = chunks[index]!;
      chunkResults.push(
        await deriveSemanticImagePromptBrief({
          ...input,
          plan: { ...input.plan, assets },
          cachePath: `${input.cachePath}.chunk-${String(index + 1).padStart(3, "0")}`,
        }),
      );
    }
    const first = chunkResults[0]?.artifact.brief;
    if (!first) {
      throw new SemanticImagePromptError(
        "SEMANTIC_IMAGE_BRIEF_PROVIDER_ERROR",
        "Semantic image-prompt chunk planning produced no result.",
      );
    }
    const byAsset = new Map(
      chunkResults.flatMap((result) => result.artifact.brief.assets).map((asset) => [
        asset.assetId,
        asset,
      ] as const),
    );
    const brief = semanticImagePromptBriefV1Schema.parse({
      ...first,
      assets: input.plan.assets.map((asset) => {
        const semantic = byAsset.get(asset.assetId);
        if (!semantic) {
          throw new SemanticImagePromptError(
            "SEMANTIC_IMAGE_BRIEF_ASSET_MISMATCH",
            `Semantic image-prompt chunks omitted ${asset.assetId}.`,
          );
        }
        return semantic;
      }),
    });
    const findings = [
      ...validateSemanticImagePromptBrief({ brief, plan: input.plan }),
      ...(input.validateGenre?.({ brief, plan: input.plan }) ?? []),
    ];
    if (findings.some((finding) => finding.severity === "blocking")) {
      throw new SemanticImagePromptError(
        findings[0]?.code ?? "SEMANTIC_IMAGE_BRIEF_SCHEMA_INVALID",
        "Merged semantic image-prompt chunks failed validation.",
        findings,
      );
    }
    const cacheStatus = input.refresh ? "refresh" : "miss";
    const artifact = semanticImagePromptCacheArtifactSchema.parse({
      schemaVersion: SEMANTIC_IMAGE_PROMPT_SCHEMA_VERSION,
      cacheStatus,
      cacheKey: identity.cacheKey,
      sourceSemanticHash: input.plan.sourceSemanticHash,
      visualPlanHash: input.plan.visualPlanHash,
      plannerPromptVersion: input.plannerPromptVersion,
      plannerModel: input.model,
      plannerModelConfigHash: identity.plannerModelConfigHash,
      genreAdapterVersion: input.plan.genreAdapterVersion,
      genreVisualDirectionVersion: input.plan.genreVisualDirectionVersion,
      createdAt: (input.now ?? (() => new Date().toISOString()))(),
      briefHash: semanticImagePromptHash(brief),
      brief,
    });
    await writeJsonAtomic(input.cachePath, artifact);
    return { cacheStatus, artifact, previousArtifact, findings };
  }

  let feedback: readonly SemanticImagePromptFinding[] = [];
  let lastError: unknown;
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), input.timeoutMs ?? 120_000);
    try {
      const response = await input.client.responses.create(
        buildSemanticImagePromptOpenAiRequest({
          plan: input.plan,
          model: input.model,
          ...(feedback.length > 0 ? { validationFeedback: feedback } : {}),
        }),
        { signal: controller.signal },
      );
      if (response.status === "incomplete" || response.incomplete_details) {
        throw new SemanticImagePromptError(
          "SEMANTIC_IMAGE_BRIEF_PROVIDER_ERROR",
          `Semantic image-prompt response was incomplete: ${response.incomplete_details?.reason ?? "unknown reason"}.`,
        );
      }
      if (containsRefusal(response.output)) {
        throw new SemanticImagePromptError(
          "SEMANTIC_IMAGE_BRIEF_PROVIDER_ERROR",
          "Semantic image-prompt provider refused the request.",
        );
      }
      let brief: SemanticImagePromptBriefV1;
      try {
        brief = semanticImagePromptBriefV1Schema.parse(
          omitOpenAiNullableFields(JSON.parse(response.output_text ?? "null")) as unknown,
        );
      } catch (error) {
        throw new SemanticImagePromptError(
          "SEMANTIC_IMAGE_BRIEF_SCHEMA_INVALID",
          "Semantic image-prompt provider returned malformed structured output.",
          [],
          { cause: error },
        );
      }
      feedback = [
        ...validateSemanticImagePromptBrief({ brief, plan: input.plan }),
        ...(input.validateGenre?.({ brief, plan: input.plan }) ?? []),
      ];
      if (feedback.some((finding) => finding.severity === "blocking")) {
        throw new SemanticImagePromptError(
          feedback[0]?.code ?? "SEMANTIC_IMAGE_BRIEF_SCHEMA_INVALID",
          "Semantic image-prompt brief failed validation.",
          feedback,
        );
      }
      const cacheStatus = input.refresh ? "refresh" : "miss";
      const artifact = semanticImagePromptCacheArtifactSchema.parse({
        schemaVersion: SEMANTIC_IMAGE_PROMPT_SCHEMA_VERSION,
        cacheStatus,
        cacheKey: identity.cacheKey,
        sourceSemanticHash: input.plan.sourceSemanticHash,
        visualPlanHash: input.plan.visualPlanHash,
        plannerPromptVersion: input.plannerPromptVersion,
        plannerModel: input.model,
        plannerModelConfigHash: identity.plannerModelConfigHash,
        genreAdapterVersion: input.plan.genreAdapterVersion,
        genreVisualDirectionVersion: input.plan.genreVisualDirectionVersion,
        createdAt: (input.now ?? (() => new Date().toISOString()))(),
        briefHash: semanticImagePromptHash(brief),
        brief,
      });
      await fs.mkdir(path.dirname(input.cachePath), { recursive: true });
      await writeJsonAtomic(input.cachePath, artifact);
      return { cacheStatus, artifact, previousArtifact, findings: feedback };
    } catch (error) {
      lastError = error;
      if (
        error instanceof SemanticImagePromptError &&
        error.message.includes("refused")
      ) {
        break;
      }
      if (error instanceof SemanticImagePromptError && error.findings.length > 0) {
        feedback = error.findings;
      }
    } finally {
      clearTimeout(timer);
    }
  }
  if (lastError instanceof SemanticImagePromptError) throw lastError;
  throw new SemanticImagePromptError(
    "SEMANTIC_IMAGE_BRIEF_PROVIDER_ERROR",
    "Semantic image-prompt provider failed after bounded retries.",
    feedback,
    { cause: lastError },
  );
}

export async function inspectSemanticImagePromptCache(
  cachePath: string,
): Promise<SemanticImagePromptCacheArtifact> {
  const artifact = await readCachedArtifact(cachePath);
  if (!artifact) {
    throw new SemanticImagePromptError(
      "SEMANTIC_IMAGE_BRIEF_MISSING",
      `No valid semantic image-prompt brief exists at ${cachePath}.`,
    );
  }
  return artifact;
}
