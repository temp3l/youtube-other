import fs from "node:fs/promises";
import path from "node:path";
import { episodeManifestSchema, scenePlanSchema, type ScenePlan } from "@mediaforge/domain";
import {
  assembleSemanticImagePrompt,
  deriveSemanticImagePromptBrief,
  semanticImagePromptBriefV1Schema,
  semanticImagePromptHash,
  writeJsonAtomic,
  type SemanticAssetBriefV1,
  type SemanticImagePromptBriefV1,
  type SemanticImagePromptCacheArtifact,
  type SemanticImagePromptFinding,
  type SemanticImagePromptOpenAiClient,
  type SemanticImagePromptPlanInput,
  type SemanticImagePromptCapability,
} from "@mediaforge/shared";
import type { PositioningVisualPlanV2 } from "./positioning-visual-contracts.js";
import { stableHash } from "./positioning-visual-semantics.js";
import { VERONICA_VISUAL_LANGUAGE_VERSION } from "./veronica-visual-language.js";

export const VERONICA_SEMANTIC_IMAGE_PROMPT_ADAPTER_VERSION =
  "veronica-semantic-image-prompt-adapter.v6" as const;
export const VERONICA_SEMANTIC_IMAGE_PROMPT_PLANNER_VERSION =
  "veronica-semantic-image-prompt-v1" as const;
export const VERONICA_VISUAL_DIRECTION_VERSION =
  "veronica-positioning-semantic-direction-v1" as const;
export const VERONICA_SEMANTIC_IMAGE_PROMPT_CAPABILITY = {
  enabled: true,
  provider: "openai",
  cache: true,
  failClosed: true,
  adapter: "veronicaBenini",
} as const satisfies SemanticImagePromptCapability;

export const VERONICA_SEMANTIC_ANTI_DRIFT_RULES = [
  "Avoid generic luxury or editorial imagery that does not explain the narration.",
  "Avoid unexplained decorative display props, prestige settings, symbolic installations, or contemplative portraits unless the beat specifically requires them.",
  "Do not use a professional looking thoughtful as a substitute for a business concept.",
  "Prefer visible decisions, comparisons, evidence, recognition, misrecognition, customer choice, communication signals, transformation, and cause-and-effect relationships.",
  "For generic positioning lessons, keep the setting occupation-neutral; use the buyer's observable decision before an abstract prop or occupation proxy.",
  "Reject generic business stock unless the concrete interaction makes the visible thesis understandable without narration.",
] as const;

export const VERONICA_TEXT_FREE_CONSTRAINT =
  "No readable text of any kind: no captions, subtitles, labels, letters, numbers, logos, watermarks, or fake UI copy.";

const VERONICA_CANONICAL_NEGATIVE_CONSTRAINTS = {
  GENERIC_EDITORIAL_DRIFT:
    "Avoid generic editorial/luxury mood, prestige settings, decorative display props, symbolic installations, and contemplative portraits unless directly required by the narration beat.",
  SYNTHETIC_LIKENESS:
    "Do not depict, imitate, or create a synthetic likeness of Veronica Benini.",
  OCCUPATION_PROXY_DRIFT:
    "Avoid occupation-specific or image-led proxy evidence, specialized artifacts, and profession-bound or review-display staging unless directly required by the narration beat.",
  CREATIVE_PORTFOLIO_PROXY_DRIFT:
    "Avoid image-led proxy evidence and review-display staging unless directly required by the narration beat.",
} as const;

type VeronicaNegativeConstraintCategory =
  | "READABLE_TEXT"
  | "GENERIC_EDITORIAL_DRIFT"
  | "LUXURY_PRESTIGE_DRIFT"
  | "DECORATIVE_SYMBOLISM"
  | "THOUGHTFUL_PORTRAIT_DRIFT"
  | "SYNTHETIC_LIKENESS"
  | "OCCUPATION_PROXY_DRIFT"
  | "CREATIVE_PORTFOLIO_PROXY_DRIFT";

const occupationProxyDrift =
  /\b(?:architect(?:ure|ural)?|interior design(?:er)?|construction(?: consultant| plan)?|craft(?:sperson| workshop| bench)?|product design(?:er)?|photographer|fashion consultant|hospitality design(?:er)?|gallery curator|artisan|studio-maker|design studio|material (?:samples?|swatches?|boards?)|sample books?|building (?:plans?|renderings?)|site plans?|architectural portfolio|field-work setting|service counter)\b/iu;
const genericPositioningMeaning =
  /\b(?:expertise|competence|positioning|buyer|client|customer|proof|evidence|visible|recogniz|choose|selection|offer|reputation)\b/iu;
const creativePortfolioProxyDrift =
  /\b(?:contact sheets?|photo(?:graphy)? grids?|moodboards?|lookbooks?|image[- ]presentation walls?|creative sample imagery|photographer|art[- ]director|creative (?:studio|portfolio|review)|studio critique|design presentation boards?)\b/iu;

function normalizeConstraint(value: string): string {
  return value.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").trim();
}

function veronicaNegativeConstraintCategory(
  value: string,
): VeronicaNegativeConstraintCategory | undefined {
  const normalized = normalizeConstraint(value);
  if (/\b(?:readable|generated) text\b|\b(?:captions?|subtitles?|labels?|letters?|numbers?|logos?|watermarks?|fake ui|\bui)\b/iu.test(normalized)) {
    return "READABLE_TEXT";
  }
  if (/synthetic likeness|likeness of veronica|imitate.*veronica|depict.*veronica/iu.test(normalized)) {
    return "SYNTHETIC_LIKENESS";
  }
  if (/generic.*(?:editorial|luxury)|generic thoughtful|editorial mood|thoughtful professional/iu.test(normalized)) {
    return "GENERIC_EDITORIAL_DRIFT";
  }
  if (/luxury|prestige|decorative display props?/iu.test(normalized)) {
    return "LUXURY_PRESTIGE_DRIFT";
  }
  if (/decorative|symbolic installations?|symbolism|unexplained symbolism/iu.test(normalized)) {
    return "DECORATIVE_SYMBOLISM";
  }
  if (/contemplative portraits?|thoughtful.*substitute|professional looking thoughtful/iu.test(normalized)) {
    return "THOUGHTFUL_PORTRAIT_DRIFT";
  }
  if (creativePortfolioProxyDrift.test(normalized)) {
    return "CREATIVE_PORTFOLIO_PROXY_DRIFT";
  }
  if (occupationProxyDrift.test(normalized)) {
    return "OCCUPATION_PROXY_DRIFT";
  }
  return undefined;
}

/**
 * Deterministically collapses Veronica's overlapping anti-drift and text-free
 * constraints before the bounded provider-prompt projection.
 */
export function assembleVeronicaNegativeConstraints(input: {
  readonly semanticBrief: readonly string[];
  readonly genreAdapter: readonly string[];
  readonly visualTreatment: readonly string[];
  readonly textFreePolicy?: readonly string[];
  readonly genericPositioningBeat?: boolean;
}): { readonly constraints: readonly string[]; readonly textFreeConstraint: string } {
  const categories = new Set<VeronicaNegativeConstraintCategory>();
  const remaining: string[] = [];
  const seen = new Set<string>();
  for (const value of [
    ...input.semanticBrief,
    ...input.genreAdapter,
    ...input.visualTreatment,
    ...(input.textFreePolicy ?? []),
  ]) {
    const normalized = normalizeConstraint(value);
    if (!normalized) continue;
    if (/^prefer\b/iu.test(normalized)) continue;
    const category = veronicaNegativeConstraintCategory(value);
    if (category) {
      categories.add(category);
      continue;
    }
    if (!seen.has(normalized)) {
      seen.add(normalized);
      remaining.push(value.trim());
    }
  }
  const constraints: string[] = [];
  if (
    categories.has("GENERIC_EDITORIAL_DRIFT") ||
    categories.has("LUXURY_PRESTIGE_DRIFT") ||
    categories.has("DECORATIVE_SYMBOLISM") ||
    categories.has("THOUGHTFUL_PORTRAIT_DRIFT")
  ) {
    constraints.push(VERONICA_CANONICAL_NEGATIVE_CONSTRAINTS.GENERIC_EDITORIAL_DRIFT);
  }
  if (categories.has("SYNTHETIC_LIKENESS")) {
    constraints.push(VERONICA_CANONICAL_NEGATIVE_CONSTRAINTS.SYNTHETIC_LIKENESS);
  }
  if (categories.has("OCCUPATION_PROXY_DRIFT") || input.genericPositioningBeat) {
    constraints.push(VERONICA_CANONICAL_NEGATIVE_CONSTRAINTS.OCCUPATION_PROXY_DRIFT);
  }
  return {
    constraints: [...constraints, ...remaining],
    textFreeConstraint: VERONICA_TEXT_FREE_CONSTRAINT,
  };
}

export const canonicalImagePromptBriefV1Schema =
  semanticImagePromptBriefV1Schema;
export type CanonicalImagePromptBriefV1 = SemanticImagePromptBriefV1;
export type CanonicalAssetSemanticBriefV1 = SemanticAssetBriefV1;

export function buildVeronicaSemanticSourceHash(input: {
  readonly canonicalNarration: string;
  readonly plan: PositioningVisualPlanV2;
}): string {
  return stableHash({
    canonicalNarration: input.canonicalNarration
      .toLowerCase()
      .replace(/[^\p{L}\p{N}]+/gu, " ")
      .trim(),
    semanticBeats: input.plan.scenes.map((scene) => ({
      sceneId: scene.sceneId,
      narrationAnchor: scene.narrationAnchor,
      narrativeBeat: scene.treatment.narrativeBeat,
      communicationIntent: scene.treatment.communicationIntent,
      visibleThesis: scene.visibleThesis ?? scene.treatment.narrativeBeat,
      newInformation: scene.newInformation ?? scene.treatment.communicationIntent,
      visualFamily: scene.visualFamily ?? scene.treatment.strategy,
    })),
  });
}

export function buildVeronicaSemanticVisualPlanHash(
  plan: PositioningVisualPlanV2,
): string {
  return stableHash({
    contentId: plan.contentId,
    format: plan.format,
    aspectRatio: plan.aspectRatio,
    continuity: plan.continuity,
    visualLanguageVersion: VERONICA_VISUAL_LANGUAGE_VERSION,
    visualStoryBibleFingerprint: plan.visualStoryBible?.fingerprint ?? "legacy-v2-no-story-bible",
    chapters: plan.chapters ?? [],
    scenes: plan.scenes.map((scene) => ({
      sceneId: scene.sceneId,
      visibleThesis: scene.visibleThesis ?? scene.treatment.narrativeBeat,
      newInformation: scene.newInformation ?? scene.treatment.communicationIntent,
      narrativeFunction: scene.narrativeFunction ?? purposeForStage(scene.progressionStage),
      visualFamily: scene.visualFamily ?? scene.treatment.strategy,
      progressionStage: scene.progressionStage,
      treatment: {
        narrativeBeat: scene.treatment.narrativeBeat,
        communicationIntent: scene.treatment.communicationIntent,
        strategy: scene.treatment.strategy,
        subjectRequirement: scene.treatment.subjectRequirement,
        environment: scene.treatment.environment,
        composition: scene.treatment.composition,
        camera: scene.treatment.camera,
        lighting: scene.treatment.lighting,
        action: scene.treatment.action,
        props: scene.treatment.props,
        motionOpportunities: scene.treatment.motionOpportunities,
        diagram: scene.treatment.diagram,
        viewerVisibleFingerprint: scene.treatment.viewerVisibleFingerprint,
      },
    })),
    assets: plan.assets.map((asset) => ({
      assetId: asset.assetId,
      sceneId: asset.sceneId,
      nativeAspectRatio: asset.nativeAspectRatio,
      subjectIdentityId: asset.subjectIdentityId,
      referenceAssetId: asset.referenceAssetId,
    })),
  });
}

function purposeForStage(
  stage: PositioningVisualPlanV2["scenes"][number]["progressionStage"],
): SemanticAssetBriefV1["narrativePurpose"] {
  if (stage === "HOOK" || stage === "COLD_OPEN") return "hook";
  if (stage === "PROOF") return "proof";
  if (stage === "REVERSAL") return "comparison";
  if (stage === "METHOD") return "method";
  if (stage === "PAYOFF") return "payoff";
  if (stage === "EXPLANATION") return "explanation";
  return "other";
}

export function buildVeronicaSemanticImagePromptPlanInput(input: {
  readonly plan: PositioningVisualPlanV2;
  readonly canonicalNarration: string;
}): SemanticImagePromptPlanInput {
  const scenes = new Map(input.plan.scenes.map((scene) => [scene.sceneId, scene]));
  return {
    genre: "veronicaBenini",
    contentId: input.plan.contentId,
    title: input.plan.localizedTitleArtifact.locales.en.metadataTitle,
    canonicalNarration: input.canonicalNarration,
    format: input.plan.format,
    aspectRatio: input.plan.aspectRatio,
    sourceSemanticHash: buildVeronicaSemanticSourceHash(input),
    visualPlanHash: buildVeronicaSemanticVisualPlanHash(input.plan),
    genreAdapterVersion: VERONICA_SEMANTIC_IMAGE_PROMPT_ADAPTER_VERSION,
    genreVisualDirectionVersion: VERONICA_VISUAL_DIRECTION_VERSION,
    genreContext: {
      genre: "veronicaBenini",
      visualDirectionVersion: VERONICA_VISUAL_DIRECTION_VERSION,
      antiDriftRules: [...VERONICA_SEMANTIC_ANTI_DRIFT_RULES],
    },
    antiDriftRules: VERONICA_SEMANTIC_ANTI_DRIFT_RULES,
    assets: input.plan.assets.map((asset) => {
      const scene = scenes.get(asset.sceneId);
      if (!scene) throw new Error(`Approved Veronica plan is missing ${asset.sceneId}.`);
      return {
        assetId: asset.assetId,
        beatId: scene.sceneId,
        narrationBeat: scene.narrationAnchor,
        currentPrompt: asset.prompt,
        approved: {
          narrativePurpose: purposeForStage(scene.progressionStage),
          subject: scene.treatment.subjectRequirement,
          action: scene.treatment.action,
          environment: scene.treatment.environment,
          composition: scene.treatment.composition,
          camera: scene.treatment.camera,
          lighting: scene.treatment.lighting,
          props: scene.treatment.props,
          motionOpportunities: scene.treatment.motionOpportunities,
          negativeConstraints: [
            "no readable text, letters, numbers, logos, UI, or watermarks",
            "no synthetic likeness of Veronica Benini",
          ],
        },
      };
    }),
  };
}

const veronicaGenericDrift =
  /\b(?:luxury office|thoughtful consultant|material samples?|sample books?|restaurant|boutique|gallery|fashion editorial|premium office)\b/iu;
const veronicaMeaning =
  /\b(?:client|buyer|choice|choose|select|expertise|competence|visible|hidden|evidence|proof|signal|position|recogn)/iu;
const veronicaAbstractTreatment =
  /\b(?:reflection installation|mirror installation|artifact archive(?: zone)?|mirror plane|silhouette cards?|memory tokens?|symbolic galler(?:y|ies)|material boards?|luxury object displays?)\b/iu;
const veronicaLegacyConflict =
  /\b(?:reflection installation|artifact archive(?: zone)?|mirror plane|silhouette cards?|memory tokens?|audience-held impression|separate layers|hospitality (?:space|owner)|restaurant|boutique|gallery|generic workshop|generic shop floor)\b/iu;
const veronicaAbstractProps =
  /\b(?:stones?|marbles?|chess pieces?|puzzle pieces?|boxes?|doors?|masks?|strings?|floating objects?|colored cards?|labyrinths?|tokens?|geometric objects?)\b/iu;
const veronicaGenericStock =
  /\b(?:people around (?:a )?laptop|staring at (?:a )?screen|looking through (?:a )?window|pointing at (?:a )?tablet|generic boardroom|handshake|presenting slides)\b/iu;

export function validateVeronicaSemanticImagePromptBrief(input: {
  readonly brief: SemanticImagePromptBriefV1;
  readonly plan: SemanticImagePromptPlanInput;
}): readonly SemanticImagePromptFinding[] {
  const findings: SemanticImagePromptFinding[] = [];
  const planByAsset = new Map(input.plan.assets.map((asset) => [asset.assetId, asset] as const));
  for (const asset of input.brief.assets) {
    const semantic = [
      asset.spokenMeaning,
      asset.viewerTakeaway,
      asset.actionIntent,
      asset.generationBasePrompt,
      ...asset.mustShow,
      ...asset.relevanceAnchors,
    ].join(" ");
    if (asset.historyContext) {
      findings.push({
        code: "SEMANTIC_IMAGE_BRIEF_SOURCE_MISMATCH",
        severity: "blocking",
        assetId: asset.assetId,
        message: "Veronica semantic output must not contain History context.",
      });
    }
    if (veronicaGenericDrift.test(semantic) && !veronicaMeaning.test(semantic)) {
      findings.push({
        code: "SEMANTIC_IMAGE_BRIEF_GENERIC_DRIFT",
        severity: "blocking",
        assetId: asset.assetId,
        message: `Asset ${asset.assetId} is generic positioning/editorial imagery without business meaning.`,
      });
    }
    const treatmentSemantics = [
      asset.environmentIntent,
      asset.conceptualComposition,
      asset.generationBasePrompt,
      ...asset.objectIntent,
    ].join(" ");
    const narrationSemantics = [
      planByAsset.get(asset.assetId)?.narrationBeat ?? "",
      asset.spokenMeaning,
      asset.viewerTakeaway,
      asset.actionIntent,
      ...asset.mustShow,
    ].join(" ");
    if (
      veronicaAbstractTreatment.test(treatmentSemantics) &&
      !veronicaAbstractTreatment.test(narrationSemantics)
    ) {
      findings.push({
        code: "VERONICA_SEMANTIC_PROMPT_ABSTRACT_TREATMENT",
        severity: "blocking",
        assetId: asset.assetId,
        message: `Asset ${asset.assetId} depends on an abstract treatment that its narration does not require.`,
      });
    }
    if (genericPositioningMeaning.test(semantic) && occupationProxyDrift.test(semantic)) {
      findings.push({
        code: "OCCUPATION_PROXY_DRIFT",
        severity: "warning",
        assetId: asset.assetId,
        message: `Asset ${asset.assetId} uses occupation-specific artifacts for a generic positioning beat; final projection will use occupation-neutral business evidence.`,
      });
    }
    if (genericPositioningMeaning.test(semantic) && creativePortfolioProxyDrift.test(semantic)) {
      findings.push({
        code: "CREATIVE_PORTFOLIO_PROXY_DRIFT",
        severity: "warning",
        assetId: asset.assetId,
        message: `Asset ${asset.assetId} uses image-led creative evidence for a generic positioning beat; final projection will use neutral proof signals.`,
      });
    }
    if (veronicaAbstractProps.test(treatmentSemantics) && !veronicaAbstractProps.test(narrationSemantics)) {
      findings.push({ code: "ABSTRACT_PROP_DRIFT", severity: "warning", assetId: asset.assetId, message: `Asset ${asset.assetId} asks the viewer to decode an abstract prop instead of an observable buyer event; generic positioning projection will prefer the buyer/evidence relationship.` });
    }
    if (veronicaGenericStock.test(treatmentSemantics) && !/buyer|client|compare|select|evidence|proof|recommend/iu.test(narrationSemantics)) {
      findings.push({ code: "GENERIC_BUSINESS_STOCK_DRIFT", severity: "warning", assetId: asset.assetId, message: `Asset ${asset.assetId} is generic business stock without a visible buyer decision or evidence relationship; review before a new provider call.` });
    }
  }
  return findings;
}

function mergeSemanticFirst(
  semanticValues: readonly string[],
  legacyValues: readonly string[],
  allowLegacy: boolean,
): string[] {
  const merged: string[] = [];
  const seen = new Set<string>();
  for (const value of [...semanticValues, ...(allowLegacy ? legacyValues : [])]) {
    const normalized = value.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").trim();
    if (!normalized || seen.has(normalized)) continue;
    seen.add(normalized);
    merged.push(value);
  }
  return merged;
}

const unsupportedSubjectSpecificity =
  /\b(?:young|older|elderly|middle-aged|italian|french|german|portuguese|spanish|american|british|female|male|woman|man|nonbinary|non-binary|cisgender|transgender)\b/giu;

function projectUnsupportedSubjectSpecificity(input: {
  readonly role: string;
  readonly narrationBeat: string;
  readonly approvedSubject: string;
  readonly continuityRequired: boolean;
  readonly allowApprovedTreatment: boolean;
}): string {
  const roleNormalized = normalizeConstraint(input.role);
  const approvedNormalized = normalizeConstraint(input.approvedSubject);
  const narrationNormalized = normalizeConstraint(input.narrationBeat);
  const isRequiredByNarration =
    roleNormalized.length > 0 && narrationNormalized.includes(roleNormalized);
  const isRequiredByApprovedTreatment =
    input.allowApprovedTreatment &&
    roleNormalized.length > 0 &&
    approvedNormalized.includes(roleNormalized);
  if (isRequiredByNarration || isRequiredByApprovedTreatment || input.continuityRequired) {
    return input.role;
  }

  const withoutUnsupportedAppendage = input.role
    .replace(/\s+(?:including|such as)\s+(?:an?\s+)?(?:young\s+|older\s+|elderly\s+|middle-aged\s+|italian\s+|french\s+|german\s+|portuguese\s+|spanish\s+|american\s+|british\s+|female\s+|male\s+|nonbinary\s+|non-binary\s+|cisgender\s+|transgender\s+)*(?:creative director|marketing consultant|startup founder|fashion entrepreneur)\b/giu, "")
    .replace(unsupportedSubjectSpecificity, "")
    .replace(/\b([\p{L}-]+)\s+consultant\b/giu, "$1 professional")
    .replace(/\s{2,}/gu, " ")
    .replace(/\s+([,.;:])/gu, "$1")
    .trim();
  if (!withoutUnsupportedAppendage || withoutUnsupportedAppendage === input.role.trim()) {
    return input.role;
  }
  if (/\b(?:buyer|client|customer)\b/iu.test(withoutUnsupportedAppendage)) {
    return withoutUnsupportedAppendage;
  }
  if (/\b(?:credible|prospective)\b/iu.test(withoutUnsupportedAppendage)) {
    return withoutUnsupportedAppendage;
  }
  return `credible ${withoutUnsupportedAppendage}`;
}

function isGenericPositioningBeat(semantic: SemanticAssetBriefV1): boolean {
  return genericPositioningMeaning.test(
    [
      semantic.spokenMeaning,
      semantic.viewerTakeaway,
      semantic.actionIntent,
      semantic.generationBasePrompt,
      ...semantic.mustShow,
    ].join(" "),
  );
}

function isInvisibleExpertiseBeat(semantic: SemanticAssetBriefV1): boolean {
  return /cannot directly|hidden competence|skill itself is hidden|invisible expertise|inaccessible/iu.test(
    [
      semantic.spokenMeaning,
      semantic.viewerTakeaway,
      semantic.actionIntent,
      semantic.generationBasePrompt,
    ].join(" "),
  );
}

function occupationNeutralEvidenceFor(semantic: SemanticAssetBriefV1): readonly string[] {
  const meaning = [
    semantic.spokenMeaning,
    semantic.viewerTakeaway,
    semantic.actionIntent,
    semantic.generationBasePrompt,
  ].join(" ");
  if (/positioning|clear reason to choose|confidently selects|legible/iu.test(meaning)) {
    return [
      "coherent specialization evidence and proof cluster",
      "text-free proposal and presentation materials",
      "confident buyer selection gesture",
    ];
  }
  if (/compar|difficult-to-read|recognizable competence|perceived as an expert/iu.test(meaning)) {
    return [
      "fragmented proof cards and scattered evidence on one side",
      "coherent proof cluster and structured comparison sheets on the other",
      "buyer comparison gesture toward the clearer option",
    ];
  }
  if (/cannot directly|hidden|invisible|inaccessible/iu.test(meaning)) {
    return [
      "limited visible evidence summaries and simplified text-free external proof summaries",
      "small neutral evaluation blocks without image-led evidence",
      "buyer attention restricted to the limited visible signals",
    ];
  }
  return [
    "structured proposal materials",
    "text-free proof cards and recommendation cues",
    "clear buyer evaluation gesture",
  ];
}

function occupationNeutralEnvironment(): string {
  return "occupation-neutral professional consultation setting for buyer evaluation, comparison, and visible business evidence";
}

function projectOccupationNeutralText(value: string): string {
  return value
    .replace(
      new RegExp(occupationProxyDrift.source, "giu"),
      "occupation-neutral professional business evidence",
    )
    .replace(
      new RegExp(creativePortfolioProxyDrift.source, "giu"),
      "simple text-free proof signals",
    )
    .replace(/\s{2,}/gu, " ")
    .trim();
}

function projectVeronicaSemanticForFinalPrompt(
  semantic: SemanticAssetBriefV1,
): SemanticAssetBriefV1 {
  if (!isGenericPositioningBeat(semantic)) return semantic;
  const invisibleExpertiseBeat = isInvisibleExpertiseBeat(semantic);
  return {
    ...semantic,
    mustShow: semantic.mustShow.map(projectOccupationNeutralText),
    actionIntent: projectOccupationNeutralText(semantic.actionIntent),
    environmentIntent: occupationNeutralEnvironment(),
    objectIntent: [...occupationNeutralEvidenceFor(semantic)],
    conceptualComposition: projectOccupationNeutralText(semantic.conceptualComposition),
    generationBasePrompt: invisibleExpertiseBeat
      ? "In an occupation-neutral professional evaluation, the viewer sees an expert engaged in substantive analysis behind a clear process barrier while the buyer in the foreground can access only two simplified, text-free external proof summaries. Make it unmistakable that the buyer cannot directly inspect the skill and has a restricted line of sight."
      : `${projectOccupationNeutralText(semantic.generationBasePrompt)} Explain the beat through human action and the relationship between visible evidence and hidden competence, not specialized professional objects.`,
  };
}

function resolveVeronicaPromptTreatment(
  semantic: SemanticAssetBriefV1,
  approved: SemanticImagePromptPlanInput["assets"][number]["approved"],
  context: {
    readonly narrationBeat: string;
    readonly continuityRequired: boolean;
  },
): SemanticImagePromptPlanInput["assets"][number]["approved"] {
  const legacyTreatment = [
    approved.subject,
    approved.environment,
    approved.composition,
    ...approved.props,
  ].join(" ");
  const genericPositioningBeat = isGenericPositioningBeat(semantic);
  const allowLegacy =
    !genericPositioningBeat && !veronicaLegacyConflict.test(legacyTreatment);
  const abstractLegacy = veronicaAbstractTreatment.test(legacyTreatment);
  const projectedSubjectRoles = semantic.subjectRoles.map((role) =>
    projectUnsupportedSubjectSpecificity({
      role,
      narrationBeat: context.narrationBeat,
      approvedSubject: approved.subject,
      continuityRequired: context.continuityRequired,
      allowApprovedTreatment: allowLegacy,
    }),
  );
  const projectedObjectIntent = semantic.objectIntent.map((value) =>
    value
      .replace(/\s+without\s+readable\s+text\b/giu, "")
      .replace(/\s{2,}/gu, " ")
      .trim(),
  );
  const primaryScene = projectOccupationNeutralText(semantic.generationBasePrompt);
  return {
    ...approved,
    subject: mergeSemanticFirst(
      [projectedSubjectRoles.join("; ")],
      [approved.subject],
      allowLegacy,
    ).join("; "),
    environment: mergeSemanticFirst(
      [
        genericPositioningBeat
          ? occupationNeutralEnvironment()
          : projectOccupationNeutralText(semantic.environmentIntent),
      ],
      [approved.environment],
      allowLegacy,
    ).join("; "),
    props: genericPositioningBeat
      ? [...occupationNeutralEvidenceFor(semantic)]
      : mergeSemanticFirst(projectedObjectIntent, approved.props, allowLegacy),
    composition: mergeSemanticFirst(
      [projectOccupationNeutralText(semantic.conceptualComposition)],
      [approved.composition],
      allowLegacy,
    ).join("; "),
    camera: abstractLegacy
      ? approved.camera.replace(/through-glass layered focus/iu, "medium-wide comparison frame")
      : approved.camera,
    action: primaryScene,
  };
}

export function assembleVeronicaSemanticImagePrompts(input: {
  readonly plan: PositioningVisualPlanV2;
  readonly brief: SemanticImagePromptBriefV1;
}): readonly {
  readonly assetId: string;
  readonly beatId: string;
  readonly prompt: string;
  readonly promptHash: string;
}[] {
  const normalized = buildVeronicaSemanticImagePromptPlanInput({
    plan: input.plan,
    canonicalNarration: input.plan.sourceNarrationSemanticHash,
  });
  const approvedByAsset = new Map(
    normalized.assets.map((asset) => [asset.assetId, asset] as const),
  );
  const semanticByAsset = new Map(
    input.brief.assets.map((asset) => [asset.assetId, asset] as const),
  );
  return input.plan.assets.map((asset) => {
    const approved = approvedByAsset.get(asset.assetId);
    const semantic = semanticByAsset.get(asset.assetId);
    if (!approved || !semantic) throw new Error(`Missing semantic input for ${asset.assetId}.`);
    const projectedSemantic = projectVeronicaSemanticForFinalPrompt(semantic);
    const genericPositioningBeat = isGenericPositioningBeat(projectedSemantic);
    const invisibleExpertiseBeat = isInvisibleExpertiseBeat(projectedSemantic);
    const negativeConstraints = assembleVeronicaNegativeConstraints({
      semanticBrief: [...projectedSemantic.mustNotShow, ...projectedSemantic.genericDriftRisks],
      genreAdapter: VERONICA_SEMANTIC_ANTI_DRIFT_RULES,
      visualTreatment: approved.approved.negativeConstraints,
      textFreePolicy: ["no readable text, letters, numbers, logos, UI, or watermarks"],
      genericPositioningBeat,
    });
    const continuityRequired =
      input.plan.continuity.mode === "persistent-protagonist" &&
      asset.subjectIdentityId === input.plan.continuity.identityId;
    const scene = input.plan.scenes.find((candidate) => candidate.sceneId === asset.sceneId);
    const prompt = assembleSemanticImagePrompt({
      semantic: projectedSemantic,
      approved: resolveVeronicaPromptTreatment(projectedSemantic, approved.approved, {
        narrationBeat: approved.narrationBeat,
        continuityRequired,
      }),
      aspectRatio: input.plan.aspectRatio,
      genreStyle:
        "contemporary European editorial-documentary realism; believable business behavior; immediate mobile readability",
      genreConstraints: [],
      factualContext: genericPositioningBeat
        ? [
            "Information relationship priority: explain the beat through human action and visible business-evidence relationships, not specialized professional artifacts",
            ...(scene ? [`Visible thesis: ${scene.visibleThesis ?? scene.treatment.narrativeBeat}`, `New information: ${scene.newInformation ?? scene.treatment.communicationIntent}`, `Visual family: ${scene.visualFamily ?? scene.treatment.strategy}`] : []),
          ]
        : scene ? [`Visible thesis: ${scene.visibleThesis ?? scene.treatment.narrativeBeat}`, `Narrative function: ${scene.narrativeFunction ?? purposeForStage(scene.progressionStage)}`] : [],
      projectedNegativeConstraints: negativeConstraints.constraints,
      textFreeConstraint: negativeConstraints.textFreeConstraint,
      ...(invisibleExpertiseBeat
        ? { normalMaximumWords: 280 }
        : genericPositioningBeat
          ? { normalMaximumWords: 300 }
          : {}),
      projectionMode: "semantic-priority",
    });
    return {
      assetId: asset.assetId,
      beatId: asset.sceneId,
      prompt,
      promptHash: semanticImagePromptHash(prompt),
    };
  });
}

export function resolveVeronicaSemanticImagePromptPaths(
  episodeDir: string,
): { readonly cachePath: string; readonly reviewPath: string } {
  return {
    cachePath: path.join(episodeDir, "shared", "semantic-image-prompt-brief.v1.json"),
    reviewPath: path.join(episodeDir, "shared", "semantic-image-prompt-review.v1.json"),
  };
}

export async function deriveVeronicaSemanticImagePromptBrief(input: {
  readonly episodeDir: string;
  readonly plan: PositioningVisualPlanV2;
  readonly canonicalNarration: string;
  readonly client: SemanticImagePromptOpenAiClient;
  readonly model: string;
  readonly refresh?: boolean;
  readonly now?: () => string;
}) {
  const normalized = buildVeronicaSemanticImagePromptPlanInput(input);
  return deriveSemanticImagePromptBrief({
    plan: normalized,
    cachePath: resolveVeronicaSemanticImagePromptPaths(input.episodeDir).cachePath,
    client: input.client,
    model: input.model,
    plannerPromptVersion: VERONICA_SEMANTIC_IMAGE_PROMPT_PLANNER_VERSION,
    ...(input.refresh ? { refresh: true } : {}),
    ...(input.now ? { now: input.now } : {}),
    validateGenre: validateVeronicaSemanticImagePromptBrief,
  });
}

export async function persistVeronicaSemanticImagePromptReview(input: {
  readonly episodeDir: string;
  readonly plan: PositioningVisualPlanV2;
  readonly artifact: SemanticImagePromptCacheArtifact;
  readonly cacheStatus: "hit" | "miss" | "refresh";
  readonly previousArtifact?: SemanticImagePromptCacheArtifact | null;
  readonly findings?: readonly SemanticImagePromptFinding[];
}): Promise<{
  readonly scenePlan: ScenePlan;
  readonly reviewPath: string;
  readonly finalPromptSetHash: string;
  readonly staleAssetIds: readonly string[];
}> {
  const prompts = assembleVeronicaSemanticImagePrompts({
    plan: input.plan,
    brief: input.artifact.brief,
  });
  const promptByAsset = new Map(prompts.map((prompt) => [prompt.assetId, prompt] as const));
  const previousPrompts = input.previousArtifact
    ? new Map(
        assembleVeronicaSemanticImagePrompts({
          plan: input.plan,
          brief: input.previousArtifact.brief,
        }).map((prompt) => [prompt.assetId, prompt.promptHash] as const),
      )
    : new Map<string, string>();
  const staleAssetIds = prompts
    .filter(
      (prompt) =>
        previousPrompts.has(prompt.assetId) &&
        previousPrompts.get(prompt.assetId) !== prompt.promptHash,
    )
    .map((prompt) => prompt.assetId);
  const scenePlanPath = path.join(input.episodeDir, "shared", "scenes.json");
  const existingScenePlan = scenePlanSchema.parse(
    JSON.parse(await fs.readFile(scenePlanPath, "utf8")) as unknown,
  );
  if (existingScenePlan.scenes.length !== input.plan.assets.length) {
    throw new Error("Veronica semantic prompts do not match the canonical scene-plan count.");
  }
  const scenePlan = scenePlanSchema.parse({
    ...existingScenePlan,
    scenes: existingScenePlan.scenes.map((scene, index) => {
      const asset = input.plan.assets[index];
      const prompt = asset ? promptByAsset.get(asset.assetId) : undefined;
      if (!asset || !prompt) throw new Error(`Missing Veronica prompt for scene ${scene.id}.`);
      return { ...scene, imagePrompt: prompt.prompt, qualityStatus: "semantic-review-required" };
    }),
  });
  const paths = resolveVeronicaSemanticImagePromptPaths(input.episodeDir);
  const finalPromptSetHash = semanticImagePromptHash(
    prompts.map((prompt) => ({ assetId: prompt.assetId, promptHash: prompt.promptHash })),
  );
  const semanticByAsset = new Map(
    input.artifact.brief.assets.map((asset) => [asset.assetId, asset] as const),
  );
  const review = {
    schemaVersion: "veronica-semantic-image-prompt-review.v1",
    contentId: input.plan.contentId,
    cacheStatus: input.cacheStatus,
    cacheKey: input.artifact.cacheKey,
    semanticBriefHash: input.artifact.briefHash,
    plannerPromptVersion: input.artifact.plannerPromptVersion,
    plannerModel: input.artifact.plannerModel,
    contentThesis: input.artifact.brief.contentThesis,
    viewerPromise: input.artifact.brief.viewerPromise,
    assetCount: prompts.length,
    finalPromptSetHash,
    staleAssetIds,
    findings: input.findings ?? [],
    metrics: {
      contentIdsWithSemanticBrief: 1,
      semanticBriefCacheHitRate: input.cacheStatus === "hit" ? 1 : 0,
      assetsWithViewerTakeaway: input.artifact.brief.assets.filter(
        (asset) => asset.viewerTakeaway.length > 0,
      ).length,
      assetsWithMustShow: input.artifact.brief.assets.filter(
        (asset) => asset.mustShow.length > 0,
      ).length,
      assetsWithActionWhereRequired: input.artifact.brief.assets.filter(
        (asset) => asset.actionIntent.length > 0,
      ).length,
      genericVisualDriftFindings: (input.findings ?? []).filter(
        (finding) => finding.code === "SEMANTIC_IMAGE_BRIEF_GENERIC_DRIFT",
      ).length,
      textInImageViolations: (input.findings ?? []).filter(
        (finding) => finding.code === "SEMANTIC_IMAGE_BRIEF_TEXT_IN_IMAGE",
      ).length,
      missingBeatAnchors: 0,
      promptAssemblyFailures: 0,
    },
    assets: prompts.map((prompt) => {
      const semantic = semanticByAsset.get(prompt.assetId)!;
      return {
        assetId: prompt.assetId,
        beatId: prompt.beatId,
        viewerTakeaway: semantic.viewerTakeaway,
        mustShow: semantic.mustShow,
        actionIntent: semantic.actionIntent,
        relevanceAnchors: semantic.relevanceAnchors,
        genericDriftRisks: semantic.genericDriftRisks,
        generationBasePrompt: semantic.generationBasePrompt,
        finalPromptPreview: prompt.prompt,
        finalPromptHash: prompt.promptHash,
        staleStatus: staleAssetIds.includes(prompt.assetId)
          ? "STALE_BY_SEMANTIC_PROMPT"
          : "CURRENT",
      };
    }),
  };
  const manifestPath = path.join(input.episodeDir, "manifest.json");
  const manifest = episodeManifestSchema.parse(
    JSON.parse(await fs.readFile(manifestPath, "utf8")) as unknown,
  );
  const sourceMetadata =
    manifest.sourceMetadata && typeof manifest.sourceMetadata === "object"
      ? manifest.sourceMetadata
      : {};
  await Promise.all([
    writeJsonAtomic(scenePlanPath, scenePlan),
    writeJsonAtomic(paths.reviewPath, review),
    writeJsonAtomic(manifestPath, {
      ...manifest,
      scenePlan,
      sourceMetadata: {
        ...sourceMetadata,
        semanticImagePromptBriefHash: input.artifact.briefHash,
        semanticImagePromptCacheKey: input.artifact.cacheKey,
        semanticImagePromptFinalPromptSetHash: finalPromptSetHash,
        semanticImagePromptPlannerVersion: input.artifact.plannerPromptVersion,
        semanticImagePromptStatus: "ready",
      },
      updatedAt: new Date().toISOString(),
    }),
  ]);
  return { scenePlan, reviewPath: paths.reviewPath, finalPromptSetHash, staleAssetIds };
}
