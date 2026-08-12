import fs from "node:fs/promises";
import path from "node:path";
import { z } from "zod";
import type {
  GeneratedVisualAsset,
  PlannedScene,
  PositioningVisualPlanV2,
  VeronicaActionOwnerRole,
  VeronicaProviderPromptSemanticBlocker,
  VeronicaProviderPromptSemanticQa,
  VeronicaSemanticPolarity,
  VeronicaSemanticStateRelation,
} from "./positioning-visual-contracts.js";
import { finalizeSemanticPlanHash, stableHash } from "./positioning-visual-semantics.js";
import {
  validateVeronicaProviderReadiness,
  VERONICA_STATE_AWARE_PROVIDER_PROJECTION_VERSION,
} from "./veronica-pre-image-semantic-gate.js";
import type { VeronicaVisualBibleV1 } from "./veronica-visual-artifacts.js";

export const VERONICA_IMAGE_PROMPT_COMPILER_VERSION =
  "veronica-deterministic-image-prompt-compiler.v5" as const;
export const VERONICA_IMAGE_PROMPT_COMPILER_INSTRUCTION_VERSION =
  "veronica-deterministic-image-prompt-template.v5" as const;
export const VERONICA_IMAGE_PROMPT_COMPILATION_SCHEMA_VERSION =
  "veronica-image-prompt-compilation.v1" as const;

const polaritySchema = z.enum([
  "POSITIVE_STATE",
  "NEGATIVE_STATE",
  "CONTRAST",
  "TRANSITION_NEGATIVE_TO_POSITIVE",
  "TRANSITION_POSITIVE_TO_NEGATIVE",
  "NEUTRAL",
]);
const stateRelationSchema = z.enum([
  "STABLE",
  "CAUSAL_BEFORE_AFTER",
  "CONTRAST",
  "CONDITIONAL_ALTERNATIVES",
  "SEQUENTIAL_PROGRESSION",
]);
const actorRoleSchema = z.enum(["expert", "buyer", "business-operator", "shared", "none"]);
const narrativeActorRoleSchema = z.enum(["expert", "business-operator", "observer", "existing-follower", "prospective-buyer"]);

export const veronicaReferenceAssetDescriptorSchema = z.strictObject({
  assetId: z.string().min(1),
  kind: z.enum(["character-reference", "continuity-reference", "style-reference"]),
  identityId: z.string().min(1).nullable(),
  fingerprint: z.string().min(1),
  required: z.boolean(),
});

const visualBeatCompilationSchema = z.strictObject({
    beatId: z.string().min(1),
    role: z.enum(["establish", "primary", "progression", "contrast", "reaction", "payoff", "cutaway"]),
    beatHash: z.string().regex(/^[a-f0-9]{64}$/u),
    coreMeaning: z.string().min(1),
    newInformation: z.string().min(1),
    viewerShouldUnderstand: z.string().min(1),
    visualThesis: z.string().min(1),
    subject: z.string().min(1),
    action: z.string().min(1),
    state: z.string().min(1),
    environment: z.string().min(1),
    assetDecision: z.enum(["new-image", "reuse-with-motion", "reuse-with-crop", "reuse-existing-asset"]),
    composition: z.strictObject({
      description: z.string().min(1),
      camera: z.string().min(1),
      lighting: z.string().min(1),
      subtitleSafeAreaRequired: z.literal(true),
    }),
  });

export const veronicaImagePromptCompilationInputSchema = z.strictObject({
  sceneId: z.string().min(1),
  assetId: z.string().min(1),
  visualBeat: visualBeatCompilationSchema.nullable(),
  narrationBeat: z.string().min(1),
  proposition: z.strictObject({
    actorRole: actorRoleSchema,
    actionOwnerRole: actorRoleSchema,
    action: z.string().min(1),
    cause: z.string().min(1),
    consequence: z.string().min(1),
    polarity: polaritySchema,
    stateRelation: stateRelationSchema,
    initialState: z.string().min(1).nullable(),
    failureState: z.string().min(1).nullable(),
    desiredState: z.string().min(1).nullable(),
  }),
  treatment: z.strictObject({
    visibleThesis: z.string().min(1),
    visualPurpose: z.string().min(1),
    subject: z.string().min(1),
    environment: z.string().min(1),
    camera: z.string().min(1),
    lighting: z.string().min(1),
    emotionalState: z.string().min(1),
    visualMechanism: z.string().min(1),
    stateComplexity: z.enum([
      "SINGLE_STATE",
      "DECISIVE_TRANSITION_MOMENT",
      "MULTI_STATE_REQUIRED",
    ]),
    requiredEvidence: z.array(z.string().min(1)),
    forbiddenEvidence: z.array(z.string().min(1)),
    composition: z.string().min(1),
    compositionHierarchy: z.strictObject({
      primary: z.array(z.string().min(1)),
      secondary: z.array(z.string().min(1)),
      peripheral: z.array(z.string().min(1)),
    }),
    essentialRelationships: z.array(z.string().min(1)),
    negativeConstraints: z.array(z.string().min(1)),
    actors: z.array(z.strictObject({
      actorId: z.string().min(1),
      role: narrativeActorRoleSchema,
      actionOwnership: z.enum(["primary", "supporting", "context"]),
      identityAuthority: z.enum(["canonical-protagonist", "distinct-scene-actor"]),
      visibleAction: z.string().min(1),
    })).min(1),
    actionOwnerActorId: z.string().min(1),
  }),
  format: z.strictObject({
    aspectRatio: z.enum(["9:16", "16:9"]),
    contentType: z.enum(["short", "long-form"]),
    subtitleSafeArea: z.strictObject({
      x: z.number().min(0).max(1),
      y: z.number().min(0).max(1),
      width: z.number().positive().max(1),
      height: z.number().positive().max(1),
    }),
  }),
  continuity: z.strictObject({
    recurringCharacters: z.array(z.string().min(1)),
    allowedMotifs: z.array(z.string().min(1)),
    forbiddenMotifs: z.array(z.string().min(1)),
    previousSceneSummary: z.string().min(1).nullable(),
  }),
  visualBible: z.strictObject({
    artifactHash: z.string().regex(/^[a-f0-9]{64}$/u),
    editorialStyle: z.string().min(1), palette: z.array(z.string().min(1)).min(1),
    lighting: z.string().min(1), wardrobe: z.string().min(1), recurringMotifs: z.array(z.string().min(1)),
    aspectRatio: z.enum(["9:16", "16:9"]),
    subtitleSafeArea: z.strictObject({ x: z.number(), y: z.number(), width: z.number(), height: z.number() }),
    noReadableText: z.boolean(), noLogos: z.boolean(), noWatermarks: z.boolean(), continuityPolicy: z.string().min(1),
  }),
  constraints: z.strictObject({
    noReadableText: z.boolean(),
    noLogos: z.boolean(),
    noReadableUi: z.boolean(),
    noInternalLabels: z.boolean(),
    providerSpecificConstraints: z.array(z.string().min(1)),
  }),
  referenceAssets: z.array(veronicaReferenceAssetDescriptorSchema),
  provenance: z.strictObject({
    propositionHash: z.string().regex(/^[a-f0-9]{64}$/u),
    treatmentHash: z.string().regex(/^[a-f0-9]{64}$/u),
    materializationRevisionId: z.string().regex(/^[a-f0-9]{64}$/u),
    visualBeatId: z.string().min(1).nullable(),
    visualBeatHash: z.string().regex(/^[a-f0-9]{64}$/u).nullable(),
    visualBeatNewInformationHash: z.string().regex(/^[a-f0-9]{64}$/u).nullable(),
    visualBeatAssetDecision: z.enum(["new-image", "reuse-with-motion", "reuse-with-crop", "reuse-existing-asset"]).nullable(),
    timingProvenanceHash: z.string().regex(/^[a-f0-9]{64}$/u).nullable(),
  }),
});
export type VeronicaImagePromptCompilationInput = z.infer<
  typeof veronicaImagePromptCompilationInputSchema
>;

export const veronicaImagePromptCompilationResultSchema = z.strictObject({
  schemaVersion: z.literal(VERONICA_IMAGE_PROMPT_COMPILATION_SCHEMA_VERSION),
  sceneId: z.string().min(1),
  assetId: z.string().min(1),
  compilationInputHash: z.string().regex(/^[a-f0-9]{64}$/u),
  imagePrompt: z.string().min(80).max(4_000),
  depictedState: z.strictObject({
    actorRole: actorRoleSchema,
    actionOwnerRole: actorRoleSchema,
    action: z.string().min(1),
    consequence: z.string().min(1),
    polarity: polaritySchema,
    stateRelation: stateRelationSchema,
  }),
  evidenceIncluded: z.array(z.string().min(1)),
  evidenceIntentionallyOmitted: z.array(z.string().min(1)),
  compositionSummary: z.string().min(1).max(600),
});
export type VeronicaImagePromptCompilationResult = z.infer<
  typeof veronicaImagePromptCompilationResultSchema
>;

export const veronicaImagePromptCompilationBatchSchema = z.strictObject({
  results: z.array(veronicaImagePromptCompilationResultSchema).min(1),
});
export const veronicaImagePromptCompilationBatchJsonSchema = z.toJSONSchema(
  veronicaImagePromptCompilationBatchSchema,
);

export const VERONICA_IMAGE_PROMPT_COMPILER_INSTRUCTIONS = `Compile each complete provider-facing image prompt atomically from its canonical structured scene input. The canonical meaning is authoritative; never redefine, improve, reverse, or repair it.
Preserve causal meaning, the typed actor cast and actionOwnerActorId, polarity, state relation, required contrast, required visible evidence, composition hierarchy, essential relationships, forbidden evidence, and reference-character requirements. A canonical-protagonist actor is always the expert; observers, existing followers, and prospective buyers are distinct people and must never inherit that reference. Never substitute an occupation proxy, stale semantic domain, generic business scene, implementation terminology, validator/remediation terminology, or semantic labels.
Produce one visually renderable scene with coherent physical staging, environment, spatial relationships, compatible props, subject placement, camera, framing, hierarchy, lighting, and composition. Use a concrete narration-native metaphor only when it is stronger and does not change meaning. Avoid readable text, logos, readable UI, internal labels, impossible compositions, and mutually incompatible simultaneous states.
For 9:16 Shorts use one dominant visual idea, vertical mobile-readable hierarchy, and low simultaneous-state complexity. For 16:9 long-form, richer development is allowed only when canonically justified. Respect continuity without copying adjacent staging.
imagePrompt is the complete natural-language provider instruction. Do not return prompt fragments and do not expect downstream prose to be appended. depictedState and evidence arrays must truthfully describe that exact imagePrompt. Copy every requiredEvidence string verbatim into evidenceIncluded; never place required evidence in evidenceIntentionallyOmitted. Echo sceneId, assetId, and compilationInputHash exactly. Do not reveal chain of thought.`;

export interface VeronicaImagePromptCompilerModel {
  readonly model: string;
  readonly reasoningEffort: "none" | "minimal" | "low" | "medium" | "high" | "xhigh";
  readonly maxOutputTokens?: number;
}

export interface VeronicaImagePromptCompilerUsage {
  readonly inputTokens: number;
  readonly outputTokens: number;
  readonly cachedInputTokens: number;
}

export interface VeronicaImagePromptCompilerPort {
  compileBatch(input: {
    readonly episodeId: string;
    readonly items: readonly VeronicaImagePromptCompilationInput[];
    readonly inputHashes: readonly string[];
    readonly model: VeronicaImagePromptCompilerModel;
    readonly instructions: string;
    readonly instructionVersion: string;
    readonly jsonSchema: unknown;
  }): Promise<{
    readonly output: unknown;
    readonly requestId?: string;
    readonly usage?: VeronicaImagePromptCompilerUsage;
    readonly latencyMs?: number;
    readonly estimatedCostUsd?: number;
  }>;
}

export interface VeronicaImagePromptCompilationCacheRecord {
  readonly inputHash: string;
  readonly compilerVersion: string;
  readonly model: VeronicaImagePromptCompilerModel;
  readonly result: VeronicaImagePromptCompilationResult;
  readonly resultHash: string;
  readonly createdAt: string;
}

export interface VeronicaImagePromptCompilationCachePort {
  get(inputHash: string): Promise<VeronicaImagePromptCompilationCacheRecord | null>;
  set(record: VeronicaImagePromptCompilationCacheRecord): Promise<void>;
}

export class InMemoryVeronicaImagePromptCompilationCache
  implements VeronicaImagePromptCompilationCachePort
{
  readonly #records = new Map<string, VeronicaImagePromptCompilationCacheRecord>();
  async get(inputHash: string) { return this.#records.get(inputHash) ?? null; }
  async set(record: VeronicaImagePromptCompilationCacheRecord) { this.#records.set(record.inputHash, record); }
}

function emotionalState(polarity: VeronicaSemanticPolarity): string {
  switch (polarity) {
    case "NEGATIVE_STATE": return "controlled uncertainty without anger, hostility, or rejection";
    case "POSITIVE_STATE": return "clarity, confidence, and forward movement";
    case "CONTRAST": return "a legible contrast between uncertainty and clarity";
    case "TRANSITION_NEGATIVE_TO_POSITIVE": return "a credible movement from uncertainty toward clarity";
    case "TRANSITION_POSITIVE_TO_NEGATIVE": return "a visible loss of clarity or confidence";
    case "NEUTRAL": return "restrained editorial realism";
  }
}

/** Pure final-prompt materialization. Semantic invention belongs upstream. */
export function compileDeterministicVeronicaImagePrompt(
  item: VeronicaImagePromptCompilationInput,
  inputHash: string,
): VeronicaImagePromptCompilationResult {
  const sentence = (value: string) => value.trim().replace(/[.!?]+$/u, "");
  const actionOwner = item.treatment.actors.find((actor) => actor.actorId === item.treatment.actionOwnerActorId);
  const visual = item.visualBeat;
  const references = item.referenceAssets.length > 0
    ? `Use resolved references in this priority order: ${item.referenceAssets.map((reference) => `${reference.kind} ${reference.assetId}`).join(", ")}. Canonical identity controls facial identity only; scene direction controls wardrobe, pose, background, light, and framing.`
    : "No character identity reference is required for this scene.";
  const evidence = item.treatment.requiredEvidence.join("; ");
  const providerSafeConstraint = (value: string) => value
    .replace(/state relation/giu, "causal structure")
    .replace(/semantic opposite/giu, "opposite meaning")
    .replace(/semantic proposition/giu, "scene meaning")
    .replace(/visible thesis/giu, "main visual idea")
    .replace(/polarity label/giu, "emotional direction");
  const negative = [
    ...item.treatment.negativeConstraints.map((value) =>
      value.includes("canonical protagonist")
        ? "keep observers, followers, customers, and buyers visually distinct from every recurring identity"
        : providerSafeConstraint(value),
    ),
    ...item.treatment.forbiddenEvidence.map((value) => `avoid ${providerSafeConstraint(value)}`),
    ...item.constraints.providerSpecificConstraints.map(providerSafeConstraint),
  ].join("; ");
  const prompt = [
    `Create one ${item.format.aspectRatio} ${item.format.contentType} editorial still with one immediately legible visual idea.`,
    `Visual thesis: ${sentence(visual?.visualThesis ?? item.treatment.visibleThesis)}. New visual information: ${sentence(visual?.newInformation ?? item.proposition.consequence)}. Core meaning: ${sentence(visual?.coreMeaning ?? item.proposition.cause)}. Viewer takeaway: ${sentence(visual?.viewerShouldUnderstand ?? item.proposition.consequence)}.`,
    `Show ${sentence(visual?.subject ?? item.treatment.subject)} in ${sentence(visual?.environment ?? item.treatment.environment)}. Visible action: ${sentence(visual?.action ?? actionOwner?.visibleAction ?? item.treatment.actors.map((actor) => actor.visibleAction).join("; "))}. Required state: ${sentence(visual?.state ?? item.proposition.initialState ?? item.treatment.emotionalState)}.`,
    `Strategy: ${visual?.role ?? item.treatment.visualMechanism}. Stage the scene as follows: ${sentence(visual?.composition.description ?? item.treatment.composition)}. Camera: ${sentence(visual?.composition.camera ?? item.treatment.camera)}. Lighting: ${sentence(visual?.composition.lighting ?? item.treatment.lighting)}.`,
    `Editorial direction: ${sentence(item.visualBible.editorialStyle)}. Palette: ${item.visualBible.palette.join(", ")}. Bible lighting policy: ${sentence(item.visualBible.lighting)}.${actionOwner?.identityAuthority === "canonical-protagonist" ? ` Wardrobe: ${sentence(item.visualBible.wardrobe)}.` : ""}`,
    `Emotional direction: ${sentence(item.treatment.emotionalState)}. Physical evidence: ${evidence}.`,
    references,
    `Keep important faces, actions, and evidence outside the subtitle region x=${item.visualBible.subtitleSafeArea.x}, y=${item.visualBible.subtitleSafeArea.y}, width=${item.visualBible.subtitleSafeArea.width}, height=${item.visualBible.subtitleSafeArea.height}.`,
    `No readable text, letters, numbers, logos, interface copy, internal labels, watermark, storyboard, or panel grid. ${negative}. Continuity policy: ${sentence(item.visualBible.continuityPolicy)}.`,
  ].join(" ").replace(/\.{2,}/gu, ".").replace(/\s+/gu, " ").trim();
  return veronicaImagePromptCompilationResultSchema.parse({
    schemaVersion: VERONICA_IMAGE_PROMPT_COMPILATION_SCHEMA_VERSION,
    sceneId: item.sceneId,
    assetId: item.assetId,
    compilationInputHash: inputHash,
    imagePrompt: prompt,
    depictedState: {
      actorRole: item.proposition.actorRole,
      actionOwnerRole: item.proposition.actionOwnerRole,
      action: visual?.action ?? item.proposition.action,
      consequence: item.proposition.consequence,
      polarity: item.proposition.polarity,
      stateRelation: item.proposition.stateRelation,
    },
    evidenceIncluded: [...item.treatment.requiredEvidence],
    evidenceIntentionallyOmitted: [...item.treatment.forbiddenEvidence],
    compositionSummary: `${visual?.composition.description ?? item.treatment.composition}; ${visual?.composition.camera ?? item.treatment.camera}; protected subtitle safe area.`,
  });
}

export class DeterministicVeronicaImagePromptCompiler
  implements VeronicaImagePromptCompilerPort
{
  async compileBatch(input: Parameters<VeronicaImagePromptCompilerPort["compileBatch"]>[0]) {
    return {
      output: {
        results: input.items.map((item, index) =>
          compileDeterministicVeronicaImagePrompt(item, input.inputHashes[index]!),
        ),
      },
      usage: { inputTokens: 0, outputTokens: 0, cachedInputTokens: 0 },
      latencyMs: 0,
      estimatedCostUsd: 0,
    };
  }
}

export class FileVeronicaImagePromptCompilationCache
  implements VeronicaImagePromptCompilationCachePort
{
  constructor(private readonly root: string) {}
  private file(inputHash: string) { return path.join(this.root, `${inputHash}.json`); }
  async get(inputHash: string): Promise<VeronicaImagePromptCompilationCacheRecord | null> {
    try {
      const value = JSON.parse(await fs.readFile(this.file(inputHash), "utf8")) as VeronicaImagePromptCompilationCacheRecord;
      if (value.inputHash !== inputHash || value.resultHash !== stableHash(value.result)) return null;
      veronicaImagePromptCompilationResultSchema.parse(value.result);
      return value;
    } catch { return null; }
  }
  async set(record: VeronicaImagePromptCompilationCacheRecord): Promise<void> {
    await fs.mkdir(this.root, { recursive: true });
    const target = this.file(record.inputHash);
    const temporary = `${target}.${process.pid}.tmp`;
    await fs.writeFile(temporary, `${JSON.stringify(record, null, 2)}\n`, "utf8");
    await fs.rename(temporary, target);
  }
}

function previousSceneSummary(scene: PlannedScene | undefined): string | null {
  if (!scene?.semanticProposition) return null;
  return `${scene.semanticProposition.actorRole} performs ${scene.semanticProposition.actorAction}; ${scene.semanticProposition.consequence}; ${scene.semanticProposition.polarity}.`;
}

function referenceAssets(plan: PositioningVisualPlanV2, asset: GeneratedVisualAsset) {
  if (!asset.subjectIdentityId) return [];
  const identityFingerprint = plan.continuity.mode === "persistent-protagonist"
    ? plan.continuity.identityFingerprint
    : stableHash(asset.subjectIdentityId);
  const canonical = {
    assetId: asset.canonicalReferenceAssetId ?? asset.referenceAssetId ?? `${asset.subjectIdentityId}-approved-reference`,
    kind: "character-reference" as const,
    identityId: asset.subjectIdentityId,
    fingerprint: identityFingerprint,
    required: true,
  };
  return [canonical, ...(asset.continuityReferenceAssetIds ?? []).map((assetId) => ({
    assetId,
    kind: "continuity-reference" as const,
    identityId: asset.subjectIdentityId,
    fingerprint: stableHash({ assetId, identityFingerprint }),
    required: false,
  }))];
}

function compositionHierarchy(composition: string, requiredEvidence: readonly string[]) {
  const clauses = composition.split(/\s*;\s*|\.(?:\s+|$)/u).map((value) => value.trim()).filter(Boolean);
  const peripheral = clauses.filter((value) => /\b(?:peripheral|secondary|background|edge|minor|subordinate)\b/iu.test(value));
  const primary = clauses.filter((value) => /\b(?:lead|dominant|primary|central|center|foreground|focus|hierarchy)\b/iu.test(value) && !peripheral.includes(value));
  const secondary = clauses.filter((value) => !primary.includes(value) && !peripheral.includes(value));
  return {
    primary: primary.length > 0 ? primary : [clauses[0] ?? requiredEvidence[0] ?? composition],
    secondary,
    peripheral,
  };
}

export function buildVeronicaImagePromptCompilationInput(input: {
  readonly plan: PositioningVisualPlanV2;
  readonly visualBible: VeronicaVisualBibleV1;
  readonly scene: PlannedScene;
  readonly asset: GeneratedVisualAsset;
  readonly previousScene?: PlannedScene;
}): VeronicaImagePromptCompilationInput {
  const proposition = input.scene.semanticProposition;
  const revision = input.scene.materializationRevision;
  if (!proposition || !revision) {
    throw new Error(`IMAGE_PROMPT_COMPILATION_INPUT_INCOMPLETE:${input.scene.sceneId}`);
  }
  const treatment = input.scene.treatment;
  const actors = treatment.actors ?? [];
  const actionOwnerActorId = treatment.actionOwnerActorId ?? actors.find((actor) => actor.actionOwnership === "primary")?.actorId;
  if (actors.length === 0 || !actionOwnerActorId) throw new Error(`IMAGE_PROMPT_ACTOR_CONTRACT_INCOMPLETE:${input.scene.sceneId}`);
  const allowedMotifs = input.plan.selectedRecurringMotif?.sceneIds.includes(input.scene.sceneId)
    ? [input.plan.selectedRecurringMotif.concept]
    : [];
  const beat = input.asset.visualBeatId
    ? input.plan.visualBeatPlan?.beats.find((candidate) => candidate.beatId === input.asset.visualBeatId)
    : undefined;
  const timingProvenanceHash = beat
    ? input.plan.visualEvents.find((event) => event.visualBeatId === beat.beatId)?.timingProvenanceHash ?? null
    : null;
  const value = veronicaImagePromptCompilationInputSchema.parse({
    sceneId: input.scene.sceneId,
    assetId: input.asset.assetId,
    visualBeat: beat
      ? {
          beatId: beat.beatId,
          role: beat.role,
          beatHash: beat.beatHash,
          coreMeaning: beat.coreMeaning,
          newInformation: beat.newInformation,
          viewerShouldUnderstand: beat.viewerShouldUnderstand,
          visualThesis: beat.visualThesis,
          subject: beat.subject,
          action: beat.action,
          state: beat.state,
          environment: beat.environment,
          assetDecision: beat.assetDecision,
          composition: beat.composition,
        }
      : null,
    narrationBeat: input.scene.narrationAnchor,
    proposition: {
      actorRole: proposition.actorRole,
      actionOwnerRole: treatment.actionOwnerRole ?? proposition.actorRole,
      action: proposition.actorAction,
      cause: proposition.cause ?? proposition.narrationClaim,
      consequence: proposition.consequence,
      polarity: proposition.polarity,
      stateRelation: proposition.stateRelation,
      initialState: proposition.contrast?.initialState ?? null,
      failureState: proposition.contrast?.failureState ?? null,
      desiredState: proposition.contrast?.desiredState ?? null,
    },
    treatment: {
      visibleThesis: beat?.visualThesis ?? input.scene.visibleThesis,
      visualPurpose: `${input.scene.progressionStage}: ${treatment.communicationIntent}`,
      subject: beat?.subject ?? treatment.subjectRequirement,
      environment: beat?.environment ?? treatment.environment,
      camera: beat?.composition.camera ?? treatment.camera,
      lighting: beat?.composition.lighting ?? treatment.lighting,
      emotionalState: emotionalState(proposition.polarity),
      visualMechanism: proposition.visualMechanism,
      stateComplexity: input.scene.stateComplexity ?? "SINGLE_STATE",
      requiredEvidence: [...new Set([
        ...proposition.evidenceAnchors,
        ...treatment.props,
        ...(input.asset.semanticPurpose !== input.scene.visibleThesis ? [input.asset.semanticPurpose] : []),
      ])],
      forbiddenEvidence: [
        "occupation-specific proxy evidence unless explicitly required by narration",
        "the semantic opposite of the canonical polarity or state relation",
        "unrelated generic business imagery",
        ...(input.plan.selectedRecurringMotif && allowedMotifs.length === 0
          ? [input.plan.selectedRecurringMotif.concept]
          : []),
      ],
      composition: beat?.composition.description ?? treatment.composition,
      compositionHierarchy: compositionHierarchy(beat?.composition.description ?? treatment.composition, [...proposition.evidenceAnchors, ...treatment.props]),
      essentialRelationships: [...new Set([
        `${proposition.cause ?? proposition.narrationClaim} -> ${proposition.consequence}`,
        beat?.action ?? treatment.action,
        ...(proposition.contrast?.initialState && proposition.contrast.desiredState ? [`${proposition.contrast.initialState} contrasts with ${proposition.contrast.desiredState}`] : []),
      ])],
      negativeConstraints: [
        "no readable text, logos, readable UI, or internal labels",
        "do not assign the canonical protagonist identity to an observer, follower, or customer",
        ...(input.plan.selectedRecurringMotif && allowedMotifs.length === 0 ? [`do not introduce ${input.plan.selectedRecurringMotif.concept}`] : []),
      ],
      actors,
      actionOwnerActorId,
    },
    format: {
      aspectRatio: input.plan.aspectRatio,
      contentType: input.plan.format === "short" ? "short" : "long-form",
      subtitleSafeArea: (() => {
        const region = input.asset.ratioAdaptations
          .find((adaptation) => adaptation.aspectRatio === input.plan.aspectRatio)
          ?.safeRegions.find((candidate) => candidate.id === "subtitle");
        return region
          ? { x: region.x, y: region.y, width: region.width, height: region.height }
          : { x: 0.12, y: 0.72, width: 0.76, height: 0.16 };
      })(),
    },
    continuity: {
      recurringCharacters: input.plan.continuity.mode === "persistent-protagonist" && input.asset.subjectIdentityId === input.plan.continuity.identityId
        ? [input.plan.continuity.identityId]
        : [],
      allowedMotifs,
      forbiddenMotifs: input.plan.selectedRecurringMotif && allowedMotifs.length === 0
        ? [input.plan.selectedRecurringMotif.concept]
        : [],
      previousSceneSummary: previousSceneSummary(input.previousScene),
    },
    visualBible: {
      artifactHash: input.visualBible.artifactHash, editorialStyle: input.visualBible.editorialStyle,
      palette: [...input.visualBible.palette], lighting: input.visualBible.lighting, wardrobe: input.visualBible.wardrobe,
      recurringMotifs: [...input.visualBible.recurringMotifs], aspectRatio: input.visualBible.output.aspectRatio,
      subtitleSafeArea: input.visualBible.output.subtitleSafeArea,
      noReadableText: !input.visualBible.output.readableGeneratedTextAllowed,
      noLogos: !input.visualBible.output.logosAllowed, noWatermarks: !input.visualBible.output.watermarksAllowed,
      continuityPolicy: actors.some((actor) => actor.identityAuthority === "canonical-protagonist")
        ? "the resolved identity reference controls the expert only; audience actors remain distinct"
        : "keep all scene actors visually distinct; no recurring identity is requested",
    },
    constraints: {
      noReadableText: true,
      noLogos: true,
      noReadableUi: true,
      noInternalLabels: true,
      providerSpecificConstraints: [
        `native ${input.plan.aspectRatio} composition`,
        "no depiction or synthetic likeness of Veronica Benini",
        "single still image, not a storyboard or panel grid",
      ],
    },
    referenceAssets: referenceAssets(input.plan, input.asset),
    provenance: {
      propositionHash: proposition.propositionHash,
      treatmentHash: treatment.treatmentHash,
      materializationRevisionId: revision.revisionId,
      visualBeatId: beat?.beatId ?? null,
      visualBeatHash: beat?.beatHash ?? null,
      visualBeatNewInformationHash: beat ? stableHash(beat.newInformation) : null,
      visualBeatAssetDecision: beat?.assetDecision ?? null,
      timingProvenanceHash,
    },
  });
  return Object.freeze(value);
}

export function veronicaImagePromptCompilationInputHash(input: {
  readonly compilationInput: VeronicaImagePromptCompilationInput;
  readonly model: VeronicaImagePromptCompilerModel;
}): string {
  const { timingProvenanceHash: _timingOnly, ...semanticProvenance } =
    input.compilationInput.provenance;
  return stableHash({
    compilerVersion: VERONICA_IMAGE_PROMPT_COMPILER_VERSION,
    instructionVersion: VERONICA_IMAGE_PROMPT_COMPILER_INSTRUCTION_VERSION,
    model: input.model,
    input: { ...input.compilationInput, provenance: semanticProvenance },
  });
}

const internalJargon = /\b(?:validator|validation finding|remediation|repair boundary|semantic proposition|visible thesis|state relation|polarity label|compiler input|prompt hash|treatment hash)\b/iu;
const placeholder = /(?:\{\{[^}]+\}\}|\$\{[^}]+\}|\[(?:insert|todo|placeholder)[^\]]*\]|<[^>]*(?:insert|todo|placeholder)[^>]*>)/iu;
const readableTextInstruction = /\b(?:include|show|display|render|write|add)\s+(?:clear\s+|legible\s+|readable\s+)?(?:text|words?|labels?|logo|ui)\b/giu;

function hasPositiveReadableTextInstruction(value: string): boolean {
  for (const match of value.matchAll(readableTextInstruction)) {
    const prefix = value.slice(Math.max(0, (match.index ?? 0) - 24), match.index).toLowerCase();
    if (!/(?:\bno\b|\bnot\b|\bnever\b|\bavoid\b|\bwithout\b|do not)\s*$/u.test(prefix)) return true;
  }
  return false;
}

function semanticTokensForComparison(value: string): readonly string[] {
  const stop = new Set(["the", "a", "an", "and", "or", "of", "to", "in", "at", "is", "are", "remains", "remain", "one", "frame", "visual", "visible"]);
  return value.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").trim().split(/\s+/u).filter((token) => token.length > 2 && !stop.has(token));
}

function clausesContainingConcept(prompt: string, concept: string): readonly string[] {
  const conceptTokens = semanticTokensForComparison(concept);
  return prompt.split(/[.;]\s*/u).filter((clause) => {
    const clauseTokens = new Set(semanticTokensForComparison(clause));
    const overlap = conceptTokens.filter((token) => clauseTokens.has(token)).length;
    return overlap >= Math.min(3, conceptTokens.length);
  });
}

function blocker(input: Omit<VeronicaProviderPromptSemanticBlocker, "message"> & { readonly message?: string }): VeronicaProviderPromptSemanticBlocker {
  return { ...input, message: input.message ?? `${input.canonicalField} expected ${input.expected}; provider prompt materialized ${input.actual}.` };
}

/** Adjudicates the exact materialized provider prompt, not hashes or model self-report. */
export function adjudicateVeronicaImagePromptCompilation(input: {
  readonly compilationInput: VeronicaImagePromptCompilationInput;
  readonly result: VeronicaImagePromptCompilationResult;
}): VeronicaProviderPromptSemanticQa {
  const canonical = input.compilationInput;
  const actual = input.result;
  const prompt = actual.imagePrompt;
  const blockers: VeronicaProviderPromptSemanticBlocker[] = [];
  const add = (value: VeronicaProviderPromptSemanticBlocker) => {
    if (!blockers.some((entry) => entry.code === value.code && entry.canonicalField === value.canonicalField && entry.actual === value.actual)) blockers.push(value);
  };
  const distinctAudienceActors = canonical.treatment.actors.filter((actor) => actor.identityAuthority === "distinct-scene-actor");
  const hasExpert = canonical.treatment.actors.some((actor) => actor.role === "expert" && actor.identityAuthority === "canonical-protagonist");
  if ((!hasExpert && /\b(?:canonical|reference)\s+(?:protagonist|professional)|\bprotagonist\b/iu.test(prompt))
    || /\b(?:protagonist|same professional|canonical professional)\b[^.]{0,80}\b(?:as|is|becomes?)\s+(?:an?\s+)?(?:observer|loyal follower|existing follower|customer|prospective buyer|buyer)\b/iu.test(prompt)) {
    add(blocker({ code: "ACTOR_OWNERSHIP_INVERSION", canonicalField: "treatment.actors", expected: distinctAudienceActors.map((actor) => `${actor.role}:${actor.actorId}`).join(", ") || "canonical expert role", actual: "provider prompt assigns protagonist identity to an audience role" }));
  }
  for (const peripheral of canonical.treatment.compositionHierarchy.peripheral) {
    for (const clause of clausesContainingConcept(prompt, peripheral)) {
      if (/\b(?:central|center|centred|centered|dominant|primary|main|focal|leads? the frame|hero)\b/iu.test(clause)) {
        add(blocker({ code: "COMPOSITION_HIERARCHY_INVERSION", canonicalField: "treatment.compositionHierarchy.peripheral", expected: peripheral, actual: clause }));
      }
    }
  }
  for (const primary of canonical.treatment.compositionHierarchy.primary) {
    for (const clause of clausesContainingConcept(prompt, primary)) {
      if (/\b(?:peripheral|secondary|background|edge|minor|subordinate)\b/iu.test(clause)) {
        add(blocker({ code: "COMPOSITION_HIERARCHY_INVERSION", canonicalField: "treatment.compositionHierarchy.primary", expected: primary, actual: clause }));
      }
    }
  }
  const expectedState = `${canonical.visualBeat?.action ?? canonical.proposition.action} ${canonical.visualBeat?.coreMeaning ?? canonical.proposition.cause} ${canonical.visualBeat?.viewerShouldUnderstand ?? canonical.proposition.consequence} ${canonical.proposition.failureState ?? ""} ${canonical.treatment.essentialRelationships.join(" ")}`.toLowerCase();
  const expectsMissingBridge = /\b(?:without|missing|absent|not yet|gap)\b[^.]{0,80}\bbridge\b|\bbridge\b[^.]{0,80}\b(?:without|missing|absent|not yet|gap)\b/iu.test(expectedState);
  if (expectsMissingBridge && /\b(?:completed?|finished|successfully established|fully formed|intact)\s+(?:identity\s+)?bridge\b|\bbridge\b[^.]{0,50}\b(?:completed?|finished|successfully established|fully formed|intact)\b/iu.test(prompt)) {
    add(blocker({ code: "ESSENTIAL_RELATIONSHIP_INVERSION", canonicalField: "treatment.essentialRelationships", expected: "bridge remains absent/incomplete", actual: "provider prompt depicts a completed bridge" }));
  }
  const expectsConfusion = /\b(?:confus|puzzl|cannot connect|disconnected|hesitat|does not understand)\w*/iu.test(expectedState);
  if (expectsConfusion && /\b(?:clear recognition|recognizes?|understands?|confident|resolved understanding|successful connection)\b/iu.test(prompt) && !/\b(?:confus|puzzl|hesitat|cannot|does not|unresolved)\w*/iu.test(prompt)) {
    add(blocker({ code: "REQUIRED_STATE_INVERSION", canonicalField: "proposition.requiredState", expected: "confusion/unresolved recognition", actual: "recognition/resolution" }));
  }
  const expectsUnresolvedOldState = /\b(?:old|prior|former|existing)\b[^.]{0,100}\b(?:signal|association|state|work)\b/iu.test(expectedState) && /\b(?:lag|still|random|without|confus|gap|not caught up)\b/iu.test(expectedState);
  if (expectsUnresolvedOldState && /\b(?:fully resolved|successful transition|complete alignment|new association is established)\b/iu.test(prompt)) {
    add(blocker({ code: "REQUIRED_STATE_INVERSION", canonicalField: "proposition.requiredState", expected: "old/unresolved state remains materially visible", actual: "resolved state replaces the old state" }));
  }
  if (canonical.constraints.noReadableText && hasPositiveReadableTextInstruction(prompt)) {
    add(blocker({ code: "NEGATIVE_CONSTRAINT_VIOLATION", canonicalField: "constraints.noReadableText", expected: "no readable text", actual: "positive readable-text instruction" }));
  }
  const requiredCanonicalReference = canonical.referenceAssets.find((reference) => reference.kind === "character-reference" && reference.required);
  if (hasExpert && !requiredCanonicalReference) {
    add(blocker({ code: "CONTINUITY_REFERENCE_VIOLATION", canonicalField: "referenceAssets", expected: "required canonical protagonist reference", actual: "missing canonical reference descriptor" }));
  }
  const canonicalContractHash = stableHash({ proposition: canonical.proposition, treatment: canonical.treatment, constraints: canonical.constraints, referenceAssets: canonical.referenceAssets });
  return {
    schemaVersion: "veronica-provider-prompt-semantic-qa.v1",
    status: blockers.length === 0 ? "PASS" : "BLOCKED",
    sceneId: canonical.sceneId,
    assetId: canonical.assetId,
    canonicalContractHash,
    providerPromptHash: stableHash(prompt),
    blockers,
  };
}

export class VeronicaProviderPromptSemanticBlockerError extends Error {
  readonly blockers: readonly VeronicaProviderPromptSemanticBlocker[];
  readonly sceneId: string;
  readonly assetId: string;
  constructor(qa: VeronicaProviderPromptSemanticQa) {
    super(`IMAGE_PROMPT_COMPILATION_BLOCKED:${qa.sceneId}:${qa.blockers.map((entry) => `${entry.code}:${entry.canonicalField}`).join(",")}`);
    this.name = "VeronicaProviderPromptSemanticBlockerError";
    this.blockers = qa.blockers;
    this.sceneId = qa.sceneId;
    this.assetId = qa.assetId;
  }
}

export function validateVeronicaImagePromptCompilation(input: {
  readonly compilationInput: VeronicaImagePromptCompilationInput;
  readonly inputHash: string;
  readonly result: VeronicaImagePromptCompilationResult;
}): readonly string[] {
  const expected = input.compilationInput;
  const actual = input.result;
  const included = new Set(actual.evidenceIncluded.map((value) => value.toLowerCase().trim()));
  const omitted = new Set(actual.evidenceIntentionallyOmitted.map((value) => value.toLowerCase().trim()));
  const forbidden = new Set(expected.treatment.forbiddenEvidence.map((value) => value.toLowerCase().trim()));
  const semanticQa = adjudicateVeronicaImagePromptCompilation({ compilationInput: expected, result: actual });
  return [
    ...(actual.sceneId !== expected.sceneId ? ["scene-identity-mismatch"] : []),
    ...(actual.assetId !== expected.assetId ? ["asset-identity-mismatch"] : []),
    ...(actual.compilationInputHash !== input.inputHash ? ["compiler-input-hash-mismatch"] : []),
    ...(actual.imagePrompt.trim().length < 80 ? ["empty-or-truncated-provider-prompt"] : []),
    ...(internalJargon.test(actual.imagePrompt) ? ["internal-compiler-or-validator-language"] : []),
    ...(placeholder.test(actual.imagePrompt) ? ["unresolved-provider-prompt-placeholder"] : []),
    ...(hasPositiveReadableTextInstruction(actual.imagePrompt) ? ["forbidden-readable-text-or-logo-instruction"] : []),
    ...(actual.depictedState.actorRole !== expected.proposition.actorRole ? ["depicted-actor-contradicts-canonical-actor"] : []),
    ...(actual.depictedState.actionOwnerRole !== expected.proposition.actionOwnerRole ? ["depicted-action-owner-contradicts-canonical-owner"] : []),
    ...(actual.depictedState.polarity !== expected.proposition.polarity ? ["depicted-polarity-contradicts-canonical-polarity"] : []),
    ...(actual.depictedState.stateRelation !== expected.proposition.stateRelation ? ["depicted-state-relation-contradicts-canonical-state"] : []),
    ...expected.treatment.requiredEvidence.flatMap((value) => {
      const key = value.toLowerCase().trim();
      return !included.has(key) || omitted.has(key) ? [`required-evidence-not-confirmed:${value}`] : [];
    }),
    ...actual.evidenceIncluded.flatMap((value) => forbidden.has(value.toLowerCase().trim()) ? [`forbidden-evidence-included:${value}`] : []),
    ...semanticQa.blockers.map((entry) => `semantic-blocker:${entry.code}:${entry.canonicalField}`),
  ];
}

function applyCompilationResults(input: {
  readonly plan: PositioningVisualPlanV2;
  readonly visualBible: VeronicaVisualBibleV1;
  readonly records: readonly VeronicaImagePromptCompilationCacheRecord[];
  readonly model: VeronicaImagePromptCompilerModel;
  readonly telemetry: PositioningVisualPlanV2["imagePromptCompilation"];
}): PositioningVisualPlanV2 {
  const records = new Map(input.records.map((record) => [record.result.assetId, record] as const));
  const assets = input.plan.assets.map((asset) => {
    const record = records.get(asset.assetId);
    if (!record) throw new Error(`IMAGE_PROMPT_COMPILATION_RESULT_MISSING:${asset.assetId}`);
    const scene = input.plan.scenes.find((candidate) => candidate.sceneId === asset.sceneId)!;
    const prior = asset.projectionProvenance;
    const compilationInput = buildVeronicaImagePromptCompilationInput({
      plan: input.plan,
      visualBible: input.visualBible,
      scene,
      asset,
      ...(input.plan.scenes[input.plan.scenes.indexOf(scene) - 1]
        ? { previousScene: input.plan.scenes[input.plan.scenes.indexOf(scene) - 1]! }
        : {}),
    });
    const semanticQa = adjudicateVeronicaImagePromptCompilation({ compilationInput, result: record.result });
    const providerPromptHash = stableHash(record.result.imagePrompt);
    const projectionRevision = {
      sourceTreatmentHash: scene.treatment.treatmentHash,
      sourcePropositionHash: scene.semanticProposition?.propositionHash ?? null,
      materializationRevisionId: scene.materializationRevision!.revisionId,
      stateProjectionPolicyVersion: VERONICA_STATE_AWARE_PROVIDER_PROJECTION_VERSION,
      motifId: prior?.motifId ?? null,
      projectionStrategy: prior?.projectionStrategy ?? "SINGLE_STATE" as const,
      providerPromptHash,
      projectedPolarity: record.result.depictedState.polarity,
      projectedStateRelation: record.result.depictedState.stateRelation,
      projectedActorRole: record.result.depictedState.actionOwnerRole,
      projectedConsequencePolarity: record.result.depictedState.polarity,
      promptCompilerVersion: VERONICA_IMAGE_PROMPT_COMPILER_VERSION,
      promptCompilationInputHash: record.inputHash,
      promptCompilationResultHash: record.resultHash,
      promptCompilerModel: input.model.model,
      promptCompilerReasoningEffort: input.model.reasoningEffort,
      ...(asset.visualBeatId ? { visualBeatId: asset.visualBeatId } : {}),
      ...(asset.visualBeatHash ? { visualBeatHash: asset.visualBeatHash } : {}),
      ...(compilationInput.provenance.visualBeatNewInformationHash
        ? { visualBeatNewInformationHash: compilationInput.provenance.visualBeatNewInformationHash }
        : {}),
      ...(compilationInput.provenance.visualBeatAssetDecision
        ? { visualBeatAssetDecision: compilationInput.provenance.visualBeatAssetDecision }
        : {}),
      ...(compilationInput.provenance.timingProvenanceHash
        ? { timingProvenanceHash: compilationInput.provenance.timingProvenanceHash }
        : {}),
    };
    return {
      ...asset,
      prompt: record.result.imagePrompt,
      semanticFingerprint: stableHash({
        sceneId: scene.sceneId,
        visualBeatHash: asset.visualBeatHash ?? null,
        materializationRevisionId: scene.materializationRevision!.revisionId,
        promptCompilationInputHash: record.inputHash,
        promptCompilationResultHash: record.resultHash,
      }),
      generatedAssetCacheKey: stableHash({
        visualBeatHash: asset.visualBeatHash ?? null,
        promptCompilationInputHash: record.inputHash,
        promptCompilationResultHash: record.resultHash,
        providerPromptHash,
      }),
      projectionProvenance: {
        ...projectionRevision,
        projectionRevisionId: stableHash(projectionRevision),
      },
      promptCompilation: {
        input: compilationInput,
        result: record.result,
        inputHash: record.inputHash,
        resultHash: record.resultHash,
        semanticQa,
      },
    };
  });
  const base = {
    ...input.plan,
    assets,
    imagePromptGenerationStrategy: "deterministic-v1" as const,
    imagePromptCompilation: input.telemetry,
    canonicalImagePlanHash: stableHash({
      assets: assets.map((asset) => ({
        assetId: asset.assetId,
        promptHash: stableHash(asset.prompt),
        compilationHash: asset.projectionProvenance?.promptCompilationInputHash,
      })),
      compilerVersion: VERONICA_IMAGE_PROMPT_COMPILER_VERSION,
    }),
  };
  const readinessCandidate = { ...base, validation: { status: "pass" as const, failures: [] } } as PositioningVisualPlanV2;
  const providerReadiness = validateVeronicaProviderReadiness(readinessCandidate);
  const validation = {
    status: providerReadiness.status === "PASS" ? "pass" as const : "fail" as const,
    failures: providerReadiness.issues.map((issue) => `${issue.code}:${issue.sceneId}:${issue.reason}`),
  };
  const final = { ...base, providerReadiness, validation };
  return finalizeSemanticPlanHash({ ...final, planHash: input.plan.planHash }) as PositioningVisualPlanV2;
}

export async function compileVeronicaImagePrompts(input: {
  readonly episodeId: string;
  readonly plan: PositioningVisualPlanV2;
  readonly visualBible: VeronicaVisualBibleV1;
  readonly compiler: VeronicaImagePromptCompilerPort;
  readonly cache: VeronicaImagePromptCompilationCachePort;
  readonly model: VeronicaImagePromptCompilerModel;
  readonly reasonForRegeneration: string;
  readonly now?: () => string;
}): Promise<PositioningVisualPlanV2> {
  const startedAt = Date.now();
  const inputs = input.plan.assets.map((asset) => {
    const sceneIndex = input.plan.scenes.findIndex((scene) => scene.sceneId === asset.sceneId);
    const scene = input.plan.scenes[sceneIndex];
    if (!scene) throw new Error(`IMAGE_PROMPT_COMPILATION_SCENE_MISSING:${asset.sceneId}`);
    const compilationInput = buildVeronicaImagePromptCompilationInput({
      plan: input.plan,
      visualBible: input.visualBible,
      scene,
      asset,
      ...(input.plan.scenes[sceneIndex - 1]
        ? { previousScene: input.plan.scenes[sceneIndex - 1]! }
        : {}),
    });
    const inputHash = veronicaImagePromptCompilationInputHash({ compilationInput, model: input.model });
    return { compilationInput, inputHash };
  });
  const cached = await Promise.all(inputs.map(async (entry) => ({ ...entry, record: await input.cache.get(entry.inputHash) })));
  const invalidated = cached.filter((entry) =>
    !entry.record
    || entry.record.compilerVersion !== VERONICA_IMAGE_PROMPT_COMPILER_VERSION
    || stableHash(entry.record.result) !== entry.record.resultHash
    || validateVeronicaImagePromptCompilation({ compilationInput: entry.compilationInput, inputHash: entry.inputHash, result: entry.record.result }).length > 0
  );
  let requestId: string | undefined;
  let usage: VeronicaImagePromptCompilerUsage = { inputTokens: 0, outputTokens: 0, cachedInputTokens: 0 };
  let providerLatencyMs = 0;
  let estimatedCostUsd = 0;
  if (invalidated.length > 0) {
    const response = await input.compiler.compileBatch({
      episodeId: input.episodeId,
      items: invalidated.map((entry) => entry.compilationInput),
      inputHashes: invalidated.map((entry) => entry.inputHash),
      model: input.model,
      instructions: VERONICA_IMAGE_PROMPT_COMPILER_INSTRUCTIONS,
      instructionVersion: VERONICA_IMAGE_PROMPT_COMPILER_INSTRUCTION_VERSION,
      jsonSchema: veronicaImagePromptCompilationBatchJsonSchema,
    });
    const batch = veronicaImagePromptCompilationBatchSchema.parse(response.output);
    if (batch.results.length !== invalidated.length) throw new Error("IMAGE_PROMPT_COMPILER_BATCH_CARDINALITY_MISMATCH");
    const resultByAsset = new Map(batch.results.map((result) => [result.assetId, result] as const));
    const semanticBlockers: VeronicaProviderPromptSemanticQa[] = [];
    for (const entry of invalidated) {
      const result = resultByAsset.get(entry.compilationInput.assetId);
      if (!result) throw new Error(`IMAGE_PROMPT_COMPILER_BATCH_RESULT_MISSING:${entry.compilationInput.assetId}`);
      const reasons = validateVeronicaImagePromptCompilation({
        compilationInput: entry.compilationInput,
        inputHash: entry.inputHash,
        result,
      });
      if (reasons.length > 0) {
        const qa = adjudicateVeronicaImagePromptCompilation({ compilationInput: entry.compilationInput, result });
        if (qa.status === "BLOCKED") {
          semanticBlockers.push(qa);
          continue;
        }
        throw new Error(`IMAGE_PROMPT_COMPILATION_BLOCKED:${entry.compilationInput.sceneId}:${reasons.join(",")}`);
      }
      await input.cache.set({
        inputHash: entry.inputHash,
        compilerVersion: VERONICA_IMAGE_PROMPT_COMPILER_VERSION,
        model: input.model,
        result,
        resultHash: stableHash(result),
        createdAt: (input.now ?? (() => new Date().toISOString()))(),
      });
    }
    if (semanticBlockers.length > 0) throw new VeronicaProviderPromptSemanticBlockerError(semanticBlockers[0]!);
    requestId = response.requestId;
    usage = response.usage ?? usage;
    providerLatencyMs = response.latencyMs ?? 0;
    estimatedCostUsd = response.estimatedCostUsd ?? 0;
  }
  const records = await Promise.all(inputs.map(async (entry) => {
    const record = await input.cache.get(entry.inputHash);
    if (!record) throw new Error(`IMAGE_PROMPT_COMPILATION_CACHE_WRITE_FAILED:${entry.compilationInput.assetId}`);
    return record;
  }));
  const previousTelemetry = input.plan.imagePromptCompilation;
  const telemetry = {
    schemaVersion: "veronica-image-prompt-compilation-telemetry.v1" as const,
    episodeId: input.episodeId,
    sceneCount: input.plan.scenes.length,
    assetCount: input.plan.assets.length,
    invalidatedAssetCount: (previousTelemetry?.invalidatedAssetCount ?? 0) + invalidated.length,
    compilerModel: input.model.model,
    reasoningEffort: input.model.reasoningEffort,
    requestCount: (previousTelemetry?.requestCount ?? 0) + (invalidated.length > 0 ? 1 : 0),
    inputTokens: (previousTelemetry?.inputTokens ?? 0) + usage.inputTokens,
    outputTokens: (previousTelemetry?.outputTokens ?? 0) + usage.outputTokens,
    cachedInputTokens: (previousTelemetry?.cachedInputTokens ?? 0) + usage.cachedInputTokens,
    latencyMs: (previousTelemetry?.latencyMs ?? 0) + (providerLatencyMs || Date.now() - startedAt),
    compilerVersion: VERONICA_IMAGE_PROMPT_COMPILER_VERSION,
    compilationHashes: records.map((record) => record.inputHash),
    cacheHits: (previousTelemetry?.cacheHits ?? 0) + inputs.length - invalidated.length,
    cacheMisses: (previousTelemetry?.cacheMisses ?? 0) + invalidated.length,
    reasonForRegeneration: previousTelemetry
      ? `${previousTelemetry.reasonForRegeneration};${input.reasonForRegeneration}`
      : input.reasonForRegeneration,
    estimatedCostUsd: (previousTelemetry?.estimatedCostUsd ?? 0) + estimatedCostUsd,
    ...(requestId ? { requestId } : {}),
  };
  return applyCompilationResults({ plan: input.plan, visualBible: input.visualBible, records, model: input.model, telemetry });
}
