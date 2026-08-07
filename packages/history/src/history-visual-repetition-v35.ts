import { createHash } from "node:crypto";
import type { HistoryShotV34 } from "./history-v34-contracts.js";
import type {
  HistoryBeatV35,
  HistoryVisualConceptV35,
  HistoryVisualModalityV35,
  HistoryVisualPurposeV35,
} from "./history-v35-contracts.js";
import { lookupCanonicalEntitySeedV34 } from "./history-claims-v34.js";
import {
  classifyCompositionFamilyV35,
  classifyMotionFamilyV35,
  classifyTransitionFamilyV35,
} from "./history-effective-change-v35.js";
import { LONG_STATIC_SOFT_WARNING_MS } from "./history-visual-semantics-v34.js";
import {
  isCinematicCameraMovementV35,
  portraitAdaptationNotesV35,
  resolveReconstructionPolicyV35,
} from "./history-visual-semantics-v35.js";

export const MAX_STATIC_SHOT_MS_V35 = LONG_STATIC_SOFT_WARNING_MS;
export const MIN_SEMANTIC_NOVELTY_SCORE_V35 = 2;
export const SEGMENT_DIVERSITY_WINDOW_V35 = 4;

export type VisualTemplateFamily =
  | "archival-still-focus"
  | "portrait-hold"
  | "document-hold"
  | "environment-establish"
  | "map-orientation"
  | "map-progression"
  | "diagram-explanation"
  | "artifact-detail"
  | "timeline-progression"
  | "reconstruction-scene"
  | "comparison-board"
  | "text-emphasis"
  | "atmospheric-hold";

export type VisualNoveltyContribution =
  | "new-subject"
  | "new-evidence"
  | "new-geography"
  | "new-time-state"
  | "new-scale"
  | "new-diagram-layer"
  | "new-causal-step"
  | "continuity-required";

export type NarrationVisualFunction =
  | "causal"
  | "geographic"
  | "human-experience"
  | "political-institutional"
  | "quantitative"
  | "temporal"
  | "general";

export type EditorialProgressionRole =
  | "establish"
  | "develop"
  | "explain"
  | "contrast"
  | "resolve";

export interface VisualSemanticSignature {
  readonly medium: HistoryVisualModalityV35;
  readonly primarySubjectKey: string;
  readonly claimIds: readonly string[];
  readonly templateFamily: VisualTemplateFamily;
  readonly informationLayer: string;
  readonly evidenceAssetId: string | null;
  readonly progressionRole: EditorialProgressionRole;
  readonly compositionPattern: string;
}

const MICRO_MOTION_PATTERN =
  /^(?:static locked hold|slow push-in on evidence|gentle lateral drift|hold then micro-pan|measured pull-back reveal)$/iu;

const MEANINGFUL_ACTION_PATTERN =
  /\b(?:annotation|layer transition|diagram progression|route progression|evidence transition|label reveal|state change|temporal marker|comparison reveal)\b/iu;

export function isMicroMotionCameraV35(cameraMovement: string): boolean {
  return MICRO_MOTION_PATTERN.test(cameraMovement.trim());
}

export function isMeaningfulInternalMotionV35(input: {
  readonly cameraMovement: string;
  readonly action: string;
  readonly hasAssetChange: boolean;
}): boolean {
  if (input.hasAssetChange) return true;
  if (MEANINGFUL_ACTION_PATTERN.test(input.action)) return true;
  return (
    isCinematicCameraMovementV35(input.cameraMovement) &&
    !isMicroMotionCameraV35(input.cameraMovement)
  );
}

export function inferNarrationVisualFunctionV35(text: string): NarrationVisualFunction {
  if (/\b(?:because|led to|resulted|compounded|mechanism|therefore)\b/iu.test(text))
    return "causal";
  if (
    /\b(?:route|crossed|march|sailed|island|bay|passage|territory|province|empire|region)\b/iu.test(
      text
    )
  )
    return "geographic";
  if (/\b(?:graves?|remains|equipment|survivors?|families|soldiers|people|population)\b/iu.test(text))
    return "human-experience";
  if (/\b(?:emperor|government|law|tax|administration|institution|decree|senate)\b/iu.test(text))
    return "political-institutional";
  if (/\b(?:\d{2,}|percent|million|thousand|size|estimate|compare|more than|less than)\b/iu.test(text))
    return "quantitative";
  if (/\b(?:year|century|month|april|june|between \d|timeline|chronolog)\b/iu.test(text))
    return "temporal";
  return "general";
}

export function classifyTemplateFamilyV35(input: {
  readonly modality: HistoryVisualModalityV35;
  readonly composition: string;
  readonly progressionRole: EditorialProgressionRole;
  readonly action?: string;
}): VisualTemplateFamily {
  const composition = input.composition.toLocaleLowerCase();
  const action = input.action?.toLocaleLowerCase() ?? "";
  if (input.modality === "map")
    return input.progressionRole === "establish" ? "map-orientation" : "map-progression";
  if (input.modality === "diagram") {
    if (input.progressionRole === "contrast") return "comparison-board";
    if (input.progressionRole === "develop") return "artifact-detail";
    if (input.progressionRole === "resolve") return "timeline-progression";
    return "diagram-explanation";
  }
  if (input.modality === "timeline") return "timeline-progression";
  if (input.modality === "document" || input.modality === "quotation") return "document-hold";
  if (input.modality === "archival image" || input.modality === "historical artwork") {
    if (input.progressionRole === "contrast") return "comparison-board";
    if (input.progressionRole === "develop") return "artifact-detail";
    if (input.progressionRole === "explain") return "diagram-explanation";
    if (input.progressionRole === "resolve") return "reconstruction-scene";
    if (input.progressionRole === "establish") return "environment-establish";
  }
  if (input.modality === "narration-emphasis" || input.modality === "text-only transition")
    return "text-emphasis";
  if (input.modality === "comparison card") return "comparison-board";
  if (input.modality === "restrained atmospheric reconstruction") return "reconstruction-scene";
  if (/\bportrait\b/iu.test(composition) || /\bportrait\b/iu.test(action)) return "portrait-hold";
  if (/\bartifact|document|manuscript|note\b/iu.test(composition + action))
    return "artifact-detail";
  if (/\bestablish|vista|environment|context\b/iu.test(composition + action))
    return "environment-establish";
  return "archival-still-focus";
}

export function buildProgressionCompositionV35(input: {
  readonly narrationFunction: NarrationVisualFunction;
  readonly modality: HistoryVisualModalityV35;
  readonly progressionRole: EditorialProgressionRole;
  readonly subject: string;
  readonly place: string | null;
  readonly claimId: string | null;
}): string {
  const subject = input.subject.trim() || "narrated subject";
  const placeSuffix = input.place ? ` in ${input.place}` : "";
  const claimSuffix = input.claimId ? ` (${input.claimId})` : "";
  if (input.modality === "map") {
    if (input.progressionRole === "establish")
      return `Geographic orientation centered on ${input.place ?? subject}`;
    return `Route or territorial consequence across ${input.place ?? subject}`;
  }
  if (input.modality === "diagram") {
    if (input.narrationFunction === "causal")
      return `Causal mechanism diagram for ${subject}${claimSuffix}`;
    if (input.narrationFunction === "quantitative")
      return `Quantitative comparison layer for ${subject}${claimSuffix}`;
    return `Explanatory diagram layer for ${subject}${claimSuffix}`;
  }
  if (input.modality === "timeline")
    return `Chronological progression marker for ${subject}${claimSuffix}`;
  if (input.modality === "document" || input.modality === "quotation")
    return `Primary-source document focus on ${subject}${claimSuffix}`;
  switch (input.progressionRole) {
    case "establish":
      return input.narrationFunction === "human-experience"
        ? `Environmental context for ${subject}${placeSuffix}`
        : `Establishing context for ${subject}${placeSuffix}`;
    case "develop":
      return input.narrationFunction === "material-evidence"
        ? `Material evidence detail of ${subject}${placeSuffix}`
        : `Developing evidence on ${subject}${claimSuffix}`;
    case "explain":
      return input.narrationFunction === "causal"
        ? `Causal explanation of ${subject}${claimSuffix}`
        : `Explanatory treatment of ${subject}${claimSuffix}`;
    case "contrast":
      return input.narrationFunction === "comparative"
        ? `Comparative framing of ${subject}${placeSuffix}`
        : `Contrasting perspectives on ${subject}${placeSuffix}`;
    case "resolve":
      return input.narrationFunction === "consequence"
        ? `Consequential aftermath view of ${subject}${placeSuffix}`
        : `Resolution state for ${subject}${placeSuffix}`;
    default:
      return `Editorial hold on ${subject}${placeSuffix}`;
  }
}

export function buildVisualSemanticSignatureV35(input: {
  readonly modality: HistoryVisualModalityV35;
  readonly subject: string;
  readonly claimIds: readonly string[];
  readonly composition: string;
  readonly progressionRole: EditorialProgressionRole;
  readonly action: string;
  readonly modalityStateReference: string | null;
  readonly informationLayer?: string;
}): VisualSemanticSignature {
  const primarySubjectKey = input.subject
    .replace(/\s+/gu, " ")
    .trim()
    .toLocaleLowerCase()
    .slice(0, 80);
  const informationLayer =
    input.informationLayer ??
    `${input.progressionRole}:${input.claimIds[0] ?? "none"}:${input.action.slice(0, 48)}`;
  return {
    medium: input.modality,
    primarySubjectKey,
    claimIds: [...input.claimIds],
    templateFamily: classifyTemplateFamilyV35({
      modality: input.modality,
      composition: input.composition,
      progressionRole: input.progressionRole,
      action: input.action,
    }),
    informationLayer,
    evidenceAssetId: input.modalityStateReference,
    progressionRole: input.progressionRole,
    compositionPattern: input.composition.toLocaleLowerCase().replace(/\s+/gu, " ").trim(),
  };
}

export function scoreSemanticNoveltyV35(
  prior: VisualSemanticSignature | null,
  next: VisualSemanticSignature
): { readonly score: number; readonly contributions: readonly VisualNoveltyContribution[] } {
  if (!prior) return { score: 10, contributions: ["continuity-required"] };
  const contributions: VisualNoveltyContribution[] = [];
  let score = 0;
  if (prior.medium !== next.medium) {
    score += 3;
    contributions.push("new-evidence");
  }
  if (prior.primarySubjectKey !== next.primarySubjectKey) {
    score += 2;
    contributions.push("new-subject");
  }
  if (prior.templateFamily !== next.templateFamily) {
    score += 2;
  }
  if (prior.informationLayer !== next.informationLayer) {
    score += 2;
    if (next.templateFamily === "diagram-explanation") contributions.push("new-diagram-layer");
    else if (next.templateFamily.startsWith("map-")) contributions.push("new-geography");
    else contributions.push("new-evidence");
  }
  if (prior.evidenceAssetId !== next.evidenceAssetId && next.evidenceAssetId) {
    score += 2;
    contributions.push("new-evidence");
  }
  const priorClaims = new Set(prior.claimIds);
  if (next.claimIds.some((claimId) => !priorClaims.has(claimId))) {
    score += 2;
    contributions.push("new-causal-step");
  }
  if (prior.progressionRole !== next.progressionRole) score += 1;
  if (prior.compositionPattern !== next.compositionPattern) score += 1;
  return { score, contributions };
}

const COMPOSITION_ARCHETYPE_SYNONYMS: ReadonlyArray<readonly [RegExp, string]> = [
  [/\bcomparative framing\b/iu, "comparison-board"],
  [/\bcontrasting perspectives\b/iu, "comparison-board"],
  [/\bside-by-side comparison\b/iu, "comparison-board"],
  [/\bcomparative treatment\b/iu, "comparison-board"],
  [/\bestablishing context\b/iu, "establish-context"],
  [/\benvironmental context\b/iu, "establish-context"],
  [/\bgeographic orientation\b/iu, "map-orientation"],
  [/\broute or territorial consequence\b/iu, "map-progression"],
  [/\bcausal mechanism diagram\b/iu, "causal-diagram"],
  [/\bcausal explanation\b/iu, "causal-explain"],
  [/\bexplanatory diagram layer\b/iu, "diagram-explain"],
  [/\bexplanatory treatment\b/iu, "explain-treatment"],
  [/\bprimary-source document focus\b/iu, "document-focus"],
  [/\bchronological progression marker\b/iu, "timeline-marker"],
  [/\bconsequential aftermath view\b/iu, "aftermath-view"],
  [/\bresolution state\b/iu, "resolution-state"],
  [/\bmaterial evidence detail\b/iu, "artifact-detail"],
  [/\bdeveloping evidence\b/iu, "develop-evidence"],
];

export function normalizeCompositionArchetypeV35(composition: string): string {
  const normalized = composition
    .replace(/\([^)]*\)/gu, "")
    .replace(/\bin\s+[A-Z][\p{L}'-]+(?:\s+[A-Z][\p{L}'-]+){0,3}\b/gu, "in <place>")
    .replace(/\bfor\s+[A-Z][\p{L}'-]+(?:\s+[A-Z][\p{L}'-]+){0,3}\b/gu, "for <subject>")
    .replace(/\bof\s+[A-Z][\p{L}'-]+(?:\s+[A-Z][\p{L}'-]+){0,3}\b/gu, "of <subject>")
    .replace(/\bon\s+[A-Z][\p{L}'-]+(?:\s+[A-Z][\p{L}'-]+){0,3}\b/gu, "on <subject>")
    .replace(/\bclaim-[a-f0-9]+\b/giu, "claim-<id>")
    .replace(/\bbeat[- ]?\d+\b/giu, "beat-<n>")
    .replace(/\s+/gu, " ")
    .trim()
    .toLocaleLowerCase();
  for (const [pattern, archetype] of COMPOSITION_ARCHETYPE_SYNONYMS) {
    if (pattern.test(normalized)) return archetype;
  }
  return normalized.slice(0, 64);
}

export function normalizePrimarySubjectKeyV35(input: {
  readonly subject: string;
  readonly modality?: HistoryVisualModalityV35;
}): { readonly key: string; readonly class: string } {
  const trimmed = input.subject.replace(/\s+/gu, " ").trim();
  const seed = lookupCanonicalEntitySeedV34(trimmed);
  if (seed) {
    const slug = seed.label
      .toLocaleLowerCase()
      .replace(/[^a-z0-9]+/gu, "-")
      .replace(/^-+|-+$/gu, "");
    return { key: `${seed.entityType}:${slug}`, class: seed.entityType };
  }
  const lower = trimmed.toLocaleLowerCase();
  if (/\b(?:soldiers?|army|troops|survivors?|refugees?)\b/iu.test(lower))
    return { key: "group:soldiers", class: "group" };
  if (/\bretreat(?:ing|ed)?\b/iu.test(lower))
    return { key: "state:retreat", class: "state" };
  if (/\b(?:villages?|settlements?).*(?:burn|destroy)/iu.test(lower))
    return { key: "event:settlement-destruction", class: "event" };
  if (/\bwinter\b/iu.test(lower) && /\b(?:landscape|scene|conditions?)\b/iu.test(lower))
    return { key: "environment:winter", class: "environment" };
  if (/\b(?:trade network|bronze production|palace administration|tax revenue)\b/iu.test(lower))
    return {
      key: `process:${lower.replace(/[^a-z0-9]+/gu, "-").slice(0, 48)}`,
      class: "process",
    };
  if (input.modality === "map")
    return { key: `geography:${lower.slice(0, 48)}`, class: "geography" };
  return {
    key: `subject:${lower.slice(0, 64)}`,
    class: "subject",
  };
}

export function normalizeSettingKeyV35(
  setting: string | null | undefined
): { readonly key: string; readonly class: string } {
  if (!setting?.trim()) return { key: "setting:none", class: "none" };
  const seed = lookupCanonicalEntitySeedV34(setting);
  if (seed && ["place", "region", "water-body", "state", "island"].includes(seed.entityType)) {
    const slug = seed.label
      .toLocaleLowerCase()
      .replace(/[^a-z0-9]+/gu, "-")
      .replace(/^-+|-+$/gu, "");
    return { key: `place:${slug}`, class: seed.entityType };
  }
  const lower = setting.trim().toLocaleLowerCase();
  if (/\bbattlefield\b/iu.test(lower)) return { key: "environment:battlefield", class: "environment" };
  if (/\b(?:court|palace)\b/iu.test(lower))
    return { key: "environment:imperial-court", class: "environment" };
  if (/\bwinter\b/iu.test(lower)) return { key: "environment:winter", class: "environment" };
  if (/\btrade network\b/iu.test(lower))
    return { key: "environment:trade-network", class: "environment" };
  return { key: `setting:${lower.slice(0, 48)}`, class: "setting" };
}

export interface ViewerConceptSignatureInput {
  readonly signature: VisualSemanticSignature;
  readonly subject?: string;
  readonly setting?: string | null;
  readonly modality?: HistoryVisualModalityV35;
}

export function canonicalTemplateRepetitionSignatureKeyV35(
  signature: VisualSemanticSignature
): string {
  return [
    signature.medium,
    signature.templateFamily,
    signature.progressionRole,
    normalizeCompositionArchetypeV35(signature.compositionPattern),
    normalizeTreatmentActionFamilyV35(signature.informationLayer.split(":").pop() ?? ""),
  ].join("|");
}

export function canonicalViewerConceptSignatureKeyV35(
  input: ViewerConceptSignatureInput
): string {
  const subject = normalizePrimarySubjectKeyV35({
    subject: input.subject ?? input.signature.primarySubjectKey,
    modality: input.modality ?? input.signature.medium,
  });
  const setting = normalizeSettingKeyV35(input.setting);
  return [
    input.signature.medium,
    input.signature.templateFamily,
    input.signature.progressionRole,
    normalizeCompositionArchetypeV35(input.signature.compositionPattern),
    normalizeTreatmentActionFamilyV35(input.signature.informationLayer.split(":").pop() ?? ""),
    subject.key,
    subject.class,
    setting.key,
    setting.class,
  ].join("|");
}

export function canonicalVisualRepetitionSignatureKeyV35(signature: VisualSemanticSignature): string {
  return canonicalViewerConceptSignatureKeyV35({ signature });
}

export function semanticSignatureKeyV35(signature: VisualSemanticSignature): string {
  return canonicalVisualRepetitionSignatureKeyV35(signature);
}

export function measureNearbyTemplateFamilyRepetitionV35(
  signatures: readonly VisualSemanticSignature[]
): number {
  if (signatures.length < 2) return 0;
  let repetitivePairs = 0;
  let comparedPairs = 0;
  for (let index = 1; index < signatures.length; index += 1) {
    comparedPairs += 1;
    const prior = signatures[index - 1]!;
    const next = signatures[index]!;
    const novelty = scoreSemanticNoveltyV35(prior, next);
    if (
      prior.templateFamily === next.templateFamily &&
      novelty.score < MIN_SEMANTIC_NOVELTY_SCORE_V35
    )
      repetitivePairs += 1;
  }
  return comparedPairs ? repetitivePairs / comparedPairs : 0;
}

export function measureViewerConceptDuplicationV35(
  signatures: readonly ViewerConceptSignatureInput[]
): number {
  if (!signatures.length) return 0;
  const keys = signatures.map((item) => canonicalViewerConceptSignatureKeyV35(item));
  return (keys.length - new Set(keys).size) / keys.length;
}

export function measureTemplateRepetitionV35(
  signatures: readonly VisualSemanticSignature[]
): number {
  if (!signatures.length) return 0;
  const keys = signatures.map((signature) => canonicalTemplateRepetitionSignatureKeyV35(signature));
  return (keys.length - new Set(keys).size) / keys.length;
}

export function measurePurposeTemplateFamilyDuplicationV35(
  signatures: readonly VisualSemanticSignature[]
): number {
  if (!signatures.length) return 0;
  const keys = signatures.map((signature) => canonicalTemplateRepetitionSignatureKeyV35(signature));
  return (keys.length - new Set(keys).size) / keys.length;
}

export function evaluateSegmentDiversityBudgetV35(
  window: readonly VisualSemanticSignature[]
): boolean {
  if (window.length < 3) return true;
  const families = window.map((signature) => signature.templateFamily);
  const dominant = Math.max(
    ...[...new Set(families)].map(
      (family) => families.filter((item) => item === family).length
    )
  );
  return dominant / window.length < 0.6;
}

function wordSafeSlice(text: string, maxChars: number): string {
  const trimmed = text.replace(/\s+/gu, " ").trim();
  if (trimmed.length <= maxChars) return trimmed;
  const slice = trimmed.slice(0, maxChars);
  const boundary = slice.lastIndexOf(" ");
  return (boundary > 20 ? slice.slice(0, boundary) : slice).trim();
}

function hashPick<T>(seed: string, values: readonly T[]): T {
  let hash = 0;
  for (let index = 0; index < seed.length; index += 1)
    hash = (hash * 31 + seed.charCodeAt(index)) >>> 0;
  return values[hash % values.length]!;
}

const STATIC_MODALITIES = new Set<HistoryVisualModalityV35>([
  "archival image",
  "historical artwork",
  "text-only transition",
  "narration-emphasis",
  "document",
  "quotation",
  "comparison card",
  "restrained atmospheric reconstruction",
]);

const PROGRESSION_ROLES: readonly EditorialProgressionRole[] = [
  "establish",
  "develop",
  "explain",
  "contrast",
  "resolve",
];

export function progressionRoleForBeatIndexV35(
  beatIndex: number,
  claimIds: readonly string[] = []
): EditorialProgressionRole {
  let hash = beatIndex;
  for (const claimId of claimIds)
    for (let index = 0; index < claimId.length; index += 1)
      hash = (hash * 31 + claimId.charCodeAt(index)) >>> 0;
  return PROGRESSION_ROLES[hash % PROGRESSION_ROLES.length] ?? "establish";
}

function roleCycleForFunction(
  narrationFunction: NarrationVisualFunction
): readonly EditorialProgressionRole[] {
  if (narrationFunction === "causal")
    return ["establish", "explain", "contrast", "develop", "resolve"];
  if (narrationFunction === "human-experience")
    return ["establish", "develop", "explain", "resolve", "contrast"];
  return PROGRESSION_ROLES;
}

function resolveProgressionRoleForShot(input: {
  readonly preferredRole: EditorialProgressionRole;
  readonly narrationFunction: NarrationVisualFunction;
  readonly modality: HistoryVisualModalityV35;
  readonly priorSignature: VisualSemanticSignature | null;
  readonly subject: string;
  readonly place: string | null;
  readonly claimId: string | null;
  readonly claimIds: readonly string[];
  readonly modalityStateReference: string | null;
  readonly beatIndex: number;
  readonly shotIndex: number;
}): {
  readonly progressionRole: EditorialProgressionRole;
  readonly composition: string;
  readonly action: string;
  readonly informationLayer: string;
} {
  const cycle = roleCycleForFunction(input.narrationFunction);
  const start = Math.max(0, cycle.indexOf(input.preferredRole));
  for (let offset = 0; offset < cycle.length; offset += 1) {
    const progressionRole = cycle[(start + offset + input.beatIndex + input.shotIndex) % cycle.length]!;
    const composition = buildProgressionCompositionV35({
      narrationFunction: input.narrationFunction,
      modality: input.modality,
      progressionRole,
      subject: input.subject,
      place: input.place,
      claimId: input.claimId,
    });
    const action = meaningfulActionForRole({
      modality: input.modality,
      progressionRole,
      claimId: input.claimId,
    });
    const informationLayer = `${progressionRole}:${input.claimId ?? "none"}:${action}:beat-${input.beatIndex}`;
    const signature = buildVisualSemanticSignatureV35({
      modality: input.modality,
      subject: input.subject,
      claimIds: input.claimId ? [input.claimId] : input.claimIds,
      composition,
      progressionRole,
      action,
      modalityStateReference: input.modalityStateReference,
      informationLayer,
    });
    if (
      !input.priorSignature ||
      scoreSemanticNoveltyV35(input.priorSignature, signature).score >=
        MIN_SEMANTIC_NOVELTY_SCORE_V35 ||
      signature.templateFamily !== input.priorSignature.templateFamily
    )
      return { progressionRole, composition, action, informationLayer };
  }
  const progressionRole = cycle[(input.beatIndex + input.shotIndex) % cycle.length]!;
  const composition = buildProgressionCompositionV35({
    narrationFunction: input.narrationFunction,
    modality: input.modality,
    progressionRole,
    subject: input.subject,
    place: input.place,
    claimId: input.claimId,
  });
  const action = meaningfulActionForRole({
    modality: input.modality,
    progressionRole,
    claimId: input.claimId,
  });
  return {
    progressionRole,
    composition,
    action,
    informationLayer: `${progressionRole}:${input.claimId ?? "none"}:${action}:beat-${input.beatIndex}`,
  };
}

function progressionRolesForBeat(input: {
  readonly modality: HistoryVisualModalityV35;
  readonly narrationFunction: NarrationVisualFunction;
  readonly shotCount: number;
  readonly semanticSegments: number;
  readonly beatIndex: number;
  readonly priorSignature: VisualSemanticSignature | null;
}): readonly EditorialProgressionRole[] {
  const cycle =
    input.narrationFunction === "causal"
      ? (["establish", "explain", "contrast", "develop", "resolve"] as const)
      : input.narrationFunction === "human-experience"
        ? (["establish", "develop", "explain", "resolve", "contrast"] as const)
        : PROGRESSION_ROLES;
  if (input.shotCount <= 1) {
    for (let offset = 0; offset < cycle.length; offset += 1) {
      const role = cycle[(input.beatIndex + offset) % cycle.length]!;
      if (!input.priorSignature) return [role];
      const probe = buildVisualSemanticSignatureV35({
        modality: input.modality,
        subject: "probe",
        claimIds: [],
        composition: buildProgressionCompositionV35({
          narrationFunction: input.narrationFunction,
          modality: input.modality,
          progressionRole: role,
          subject: "probe",
          place: null,
          claimId: null,
        }),
        progressionRole: role,
        action: meaningfulActionForRole({
          modality: input.modality,
          progressionRole: role,
          claimId: null,
        }),
        modalityStateReference: input.priorSignature.evidenceAssetId,
      });
      if (
        scoreSemanticNoveltyV35(input.priorSignature, probe).score >=
          MIN_SEMANTIC_NOVELTY_SCORE_V35 ||
        probe.templateFamily !== input.priorSignature.templateFamily
      )
        return [role];
    }
    return [cycle[input.beatIndex % cycle.length]!];
  }
  if (input.modality === "map") {
    const roles = ["establish", "explain"].slice(0, input.shotCount) as EditorialProgressionRole[];
    return roles.map((_, index) => cycle[(input.beatIndex + index) % cycle.length]!) as EditorialProgressionRole[];
  }
  if (input.modality === "diagram") {
    const roles = (
      input.narrationFunction === "causal"
        ? ["establish", "explain", "contrast"]
        : ["establish", "explain"]
    ).slice(0, input.shotCount) as EditorialProgressionRole[];
    return roles.map((_, index) => cycle[(input.beatIndex + index) % cycle.length]!) as EditorialProgressionRole[];
  }
  if (input.modality === "timeline")
    return ["establish", "resolve"]
      .slice(0, input.shotCount)
      .map((_, index) => cycle[(input.beatIndex + index) % cycle.length]!) as EditorialProgressionRole[];
  return Array.from({ length: input.shotCount }, (_, index) => cycle[(input.beatIndex + index) % cycle.length]!);
}

function meaningfulActionForRole(input: {
  readonly modality: HistoryVisualModalityV35;
  readonly progressionRole: EditorialProgressionRole;
  readonly claimId: string | null;
}): string {
  if (input.modality === "map") {
    return input.progressionRole === "establish"
      ? "map orientation with label reveal"
      : "route progression with annotation appearance";
  }
  if (input.modality === "diagram")
    return input.progressionRole === "establish"
      ? "diagram layer introduction"
      : "diagram progression with causal step highlight";
  if (input.modality === "timeline") return "temporal marker progression";
  if (input.modality === "document" || input.modality === "quotation")
    return "document evidence transition";
  switch (input.progressionRole) {
    case "establish":
      return "environmental establishing transition";
    case "develop":
      return "artifact detail evidence transition";
    case "explain":
      return "explanatory annotation appearance";
    case "contrast":
      return "comparison reveal";
    case "resolve":
      return "consequential aftermath transition";
    default:
      return "editorial subject transition";
  }
}

function cameraForRole(
  progressionRole: EditorialProgressionRole,
  seed: string
): string {
  if (progressionRole === "establish")
    return hashPick(seed, ["measured pull-back reveal", "static locked hold"] as const);
  if (progressionRole === "develop" || progressionRole === "explain")
    return hashPick(seed, ["slow push-in on evidence", "gentle lateral drift"] as const);
  return hashPick(seed, ["hold then micro-pan", "static locked hold"] as const);
}

function computeShotCount(input: {
  readonly durationMs: number;
  readonly modality: HistoryVisualModalityV35;
  readonly semanticSegments: number;
}): number {
  const isStatic = STATIC_MODALITIES.has(input.modality);
  if (input.modality === "map" || input.modality === "diagram" || input.modality === "timeline") {
    if (input.durationMs > MAX_STATIC_SHOT_MS_V35 && input.semanticSegments > 1) return 2;
    return 1;
  }
  if (!isStatic) return 1;
  if (input.durationMs <= MAX_STATIC_SHOT_MS_V35) return 1;
  const pacingSlots = Math.ceil(input.durationMs / MAX_STATIC_SHOT_MS_V35);
  return Math.min(3, Math.max(input.semanticSegments > 1 ? 2 : 1, pacingSlots));
}

export function buildEditorialShotSequenceV35(input: {
  readonly beatId: string;
  readonly beatNumber: string;
  readonly beatIndex: number;
  readonly startMs: number;
  readonly durationMs: number;
  readonly modality: HistoryVisualModalityV35;
  readonly text: string;
  readonly claimIds: readonly string[];
  readonly entityLabels: readonly string[];
  readonly places: readonly string[];
  readonly modalityStateReference: string | null;
  readonly priorSignature: VisualSemanticSignature | null;
  readonly visualSubject?: string;
}): {
  readonly shots: HistoryShotV34[];
  readonly signatures: VisualSemanticSignature[];
} {
  const narrationFunction = inferNarrationVisualFunctionV35(input.text);
  const semanticSegments = Math.max(
    1,
    Math.min(
      3,
      Math.max(
        input.claimIds.length >= 2 ? 2 : 1,
        input.text.split(/[.;!?]+/u).filter((part) => part.trim().length > 8).length >= 2 ? 2 : 1
      )
    )
  );
  const shotCount = computeShotCount({
    durationMs: input.durationMs,
    modality: input.modality,
    semanticSegments,
  });
  const roles = progressionRolesForBeat({
    modality: input.modality,
    narrationFunction,
    shotCount,
    semanticSegments,
    beatIndex: input.beatIndex,
    priorSignature: input.priorSignature,
  });
  const slice = Math.floor(input.durationMs / roles.length);
  const subjectSeed = wordSafeSlice(input.text, 110) || "Trusted narration span";
  const place = input.places[0] ?? null;
  const shots: HistoryShotV34[] = [];
  const signatures: VisualSemanticSignature[] = [];
  let cursor = input.startMs;
  let priorSignature = input.priorSignature;

  for (let index = 0; index < roles.length; index += 1) {
    const preferredRole = roles[index]!;
    const durationMs =
      index === roles.length - 1 ? input.startMs + input.durationMs - cursor : slice;
    const endMs = cursor + durationMs;
    const claimId = input.claimIds[index] ?? input.claimIds[input.claimIds.length - 1] ?? null;
    const entity =
      input.visualSubject ??
      input.entityLabels[index] ??
      input.entityLabels[input.entityLabels.length - 1] ??
      subjectSeed.split(/[,.]/u)[0]?.trim() ??
      "narrated subject";
    const resolved = resolveProgressionRoleForShot({
      preferredRole,
      narrationFunction,
      modality: input.modality,
      priorSignature,
      subject: entity,
      place,
      claimId,
      claimIds: input.claimIds,
      modalityStateReference: input.modalityStateReference,
      beatIndex: input.beatIndex,
      shotIndex: index,
    });
    const { progressionRole, composition, action, informationLayer } = resolved;
    const seed = `${input.beatId}|${input.modality}|${progressionRole}|${index}|${claimId ?? "none"}`;
    const framing =
      progressionRole === "establish"
        ? "wide establishing vista"
        : progressionRole === "develop"
          ? "tight evidentiary inset"
          : progressionRole === "contrast"
            ? "split comparison board"
            : "medium subject hold";
    const cameraMovement = cameraForRole(progressionRole, seed);
    const transition = hashPick(seed + "|transition", [
      "hard narration cut",
      "soft evidence dissolve",
      "opacity crossfade",
      "match-cut on shared subject",
    ] as const);
    const signature = buildVisualSemanticSignatureV35({
      modality: input.modality,
      subject: entity,
      claimIds: claimId ? [claimId] : input.claimIds,
      composition,
      progressionRole,
      action,
      modalityStateReference: input.modalityStateReference,
      informationLayer,
    });
    const novelty = scoreSemanticNoveltyV35(priorSignature, signature);
    if (
      index > 0 &&
      novelty.score < MIN_SEMANTIC_NOVELTY_SCORE_V35 &&
      priorSignature?.evidenceAssetId === signature.evidenceAssetId
    ) {
      const previous = shots[shots.length - 1]!;
      shots[shots.length - 1] = {
        ...previous,
        durationMs: previous.durationMs + durationMs,
        endMs: previous.endMs + durationMs,
      };
      cursor = endMs;
      continue;
    }
    const purpose = `${progressionRole} ${input.modality} on ${wordSafeSlice(entity, 48)}`;
    shots.push({
      id: `shot-${input.beatNumber}-${String(shots.length + 1).padStart(2, "0")}`,
      beatId: input.beatId,
      purpose,
      durationMs,
      startMs: cursor,
      endMs,
      framing,
      cameraMovement,
      subject: entity,
      action: `${action} for ${wordSafeSlice(subjectSeed, 64)}`,
      foreground: `${input.modality}/${progressionRole} foreground: ${wordSafeSlice(entity, 40)}`,
      midground: `${input.modality} midground claim focus ${claimId ?? "none"}`,
      background: `${input.modality} background ${progressionRole} layer for beat ${input.beatNumber}`,
      factualLabels:
        input.modality === "map" || input.modality === "diagram" || input.modality === "timeline"
          ? (claimId ? [claimId] : input.claimIds.slice(0, 2))
          : [],
      permittedMotion: [`${progressionRole}-safe editorial motion`, "narration-synchronous opacity"],
      prohibitedAdditions: [
        "unsupported place labels",
        "invented causal arrows",
        "placeholder coordinates",
      ],
      transition,
      linkedClaimIds: claimId ? [claimId, ...input.claimIds.filter((id) => id !== claimId)] : input.claimIds,
      modalityStateReference: input.modalityStateReference,
      adaptation16x9: `Landscape ${progressionRole} layout for ${input.modality} beat ${input.beatNumber}.`,
      adaptation9x16: portraitAdaptationNotesV35(input.modality),
      reconstructionPolicy: resolveReconstructionPolicyV35(input.modality),
    });
    signatures.push(signature);
    priorSignature = signature;
    cursor = endMs;
  }

  return { shots, signatures };
}

export function refineShotPlanForRepetitionV35(input: {
  readonly shots: readonly HistoryShotV34[];
  readonly beats: readonly HistoryBeatV35[];
  readonly purposes: readonly HistoryVisualPurposeV35[];
  readonly concepts: readonly HistoryVisualConceptV35[];
}): {
  readonly shots: HistoryShotV34[];
  readonly beats: HistoryBeatV35[];
} {
  if (!input.shots.length) return { shots: [...input.shots], beats: [...input.beats] };
  const beatModality = new Map(input.beats.map((beat) => [beat.id, beat.modality] as const));
  const purposeByBeat = new Map(input.purposes.map((purpose) => [purpose.beatId, purpose] as const));
  const conceptByBeat = new Map(
    input.concepts.map((concept) => [concept.beatId, concept] as const)
  );
  const refined: HistoryShotV34[] = [];
  let priorSignature: VisualSemanticSignature | null = null;
  const rollingWindow: VisualSemanticSignature[] = [];

  for (const shot of input.shots) {
    const beat = input.beats.find((item) => item.id === shot.beatId);
    const modality = beatModality.get(shot.beatId) ?? "archival image";
    const purpose = purposeByBeat.get(shot.beatId);
    const concept = conceptByBeat.get(shot.beatId);
    const progressionRole = (shot.purpose.split(/\s+/u)[0] ?? "establish") as EditorialProgressionRole;
    const signature = buildVisualSemanticSignatureV35({
      modality,
      subject: shot.subject,
      claimIds: shot.linkedClaimIds,
      composition: concept?.intendedComposition ?? shot.action,
      progressionRole,
      action: shot.action,
      modalityStateReference: shot.modalityStateReference,
    });
    const novelty = scoreSemanticNoveltyV35(priorSignature, signature);
    const diversityOk = evaluateSegmentDiversityBudgetV35(rollingWindow);
    const mechanicalStageSplit =
      refined.length > 0 &&
      refined[refined.length - 1]!.beatId === shot.beatId &&
      /stage \d+\/\d+/iu.test(refined[refined.length - 1]!.purpose) &&
      /stage \d+\/\d+/iu.test(shot.purpose) &&
      refined[refined.length - 1]!.modalityStateReference === shot.modalityStateReference;
    const lowNoveltyMerge =
      (refined.length > 0 &&
        refined[refined.length - 1]!.beatId === shot.beatId &&
        novelty.score < MIN_SEMANTIC_NOVELTY_SCORE_V35) ||
      mechanicalStageSplit;
    const diversityMerge =
      refined.length > 0 &&
      refined[refined.length - 1]!.beatId === shot.beatId &&
      !diversityOk &&
      priorSignature?.templateFamily === signature.templateFamily &&
      priorSignature.evidenceAssetId === signature.evidenceAssetId;
    const mergedDuration =
      refined.length > 0
        ? refined[refined.length - 1]!.durationMs + shot.durationMs
        : shot.durationMs;
    const staticModality = [
      "archival image",
      "historical artwork",
      "text-only transition",
      "narration-emphasis",
      "document",
      "quotation",
      "comparison card",
      "restrained atmospheric reconstruction",
    ].includes(modality);
    const mergeBlocked =
      diversityMerge && staticModality && mergedDuration > MAX_STATIC_SHOT_MS_V35;
    if ((lowNoveltyMerge || diversityMerge) && !mergeBlocked) {
      const previous = refined[refined.length - 1]!;
      refined[refined.length - 1] = {
        ...previous,
        durationMs: previous.durationMs + shot.durationMs,
        endMs: shot.endMs,
        linkedClaimIds: [...new Set([...previous.linkedClaimIds, ...shot.linkedClaimIds])],
        purpose: previous.purpose.replace(/ stage \d+\/\d+/iu, ""),
      };
      priorSignature = signature;
      continue;
    }
    let nextShot = shot;
    let nextSignature = signature;
    if (
      priorSignature &&
      novelty.score < MIN_SEMANTIC_NOVELTY_SCORE_V35 &&
      priorSignature.templateFamily === signature.templateFamily
    ) {
      const beatIndex = Math.max(0, input.beats.findIndex((item) => item.id === shot.beatId));
      const narrationFunction = inferNarrationVisualFunctionV35(
        purpose?.protectedFactualMeaning ?? shot.subject
      );
      const resolved = resolveProgressionRoleForShot({
        preferredRole: progressionRole,
        narrationFunction,
        modality,
        priorSignature,
        subject: shot.subject,
        place: concept?.settingGeography ?? null,
        claimId: shot.linkedClaimIds[0] ?? null,
        claimIds: shot.linkedClaimIds,
        modalityStateReference: shot.modalityStateReference,
        beatIndex,
        shotIndex: refined.filter((item) => item.beatId === shot.beatId).length,
      });
      nextShot = {
        ...shot,
        purpose: `${resolved.progressionRole} ${modality} on ${wordSafeSlice(shot.subject, 48)}`,
        action: `${resolved.action} for ${wordSafeSlice(shot.subject, 64)}`,
        foreground: `${modality}/${resolved.progressionRole} foreground: ${wordSafeSlice(shot.subject, 40)}`,
        midground: `${modality} midground claim focus ${shot.linkedClaimIds[0] ?? "none"}`,
        background: `${modality} background ${resolved.progressionRole} layer for ${shot.beatId}`,
      };
      nextSignature = buildVisualSemanticSignatureV35({
        modality,
        subject: nextShot.subject,
        claimIds: nextShot.linkedClaimIds,
        composition: resolved.composition,
        progressionRole: resolved.progressionRole,
        action: nextShot.action,
        modalityStateReference: nextShot.modalityStateReference,
        informationLayer: resolved.informationLayer,
      });
    }
    refined.push(nextShot);
    priorSignature = nextSignature;
    rollingWindow.push(nextSignature);
    if (rollingWindow.length > SEGMENT_DIVERSITY_WINDOW_V35) rollingWindow.shift();
    void purpose;
  }

  const shotsByBeat = new Map<string, string[]>();
  for (const shot of refined) {
    const list = shotsByBeat.get(shot.beatId) ?? [];
    list.push(shot.id);
    shotsByBeat.set(shot.beatId, list);
  }
  const beats = input.beats.map((beat) => ({
    ...beat,
    shotIds: shotsByBeat.get(beat.id) ?? beat.shotIds,
  }));
  return { shots: refined, beats };
}

export function buildVariedVisualConceptV35(input: {
  readonly beatId: string;
  readonly modality: HistoryVisualModalityV35;
  readonly narrationExcerpt: string;
  readonly places: readonly string[];
  readonly temporals: readonly string[];
  readonly claimKinds: readonly string[];
  readonly claimIds?: readonly string[];
  readonly entityLabels: readonly string[];
  readonly beatIndex: number;
}): HistoryVisualConceptV35 {
  const narrationFunction = inferNarrationVisualFunctionV35(input.narrationExcerpt);
  const claimIds = input.claimIds ?? [];
  const progressionRole = progressionRoleForBeatIndexV35(input.beatIndex, claimIds);
  const primaryClaimId = claimIds[0] ?? null;
  const excerpt = input.narrationExcerpt.replace(/\s+/gu, " ").trim();
  const place = input.places[0] ?? null;
  const period = input.temporals.find((item) => item && item !== "as narrated") ?? null;
  const subject =
    input.entityLabels.find((label) => /ship|person|army|empire|plague|expedition/i.test(label)) ??
    input.entityLabels[0] ??
    excerpt.split(/[,.]/u)[0]?.trim() ??
    "narrated subject";
  const evidenceClass =
    input.modality === "document"
      ? "archival-document"
      : input.modality === "quotation"
        ? "attributed-quotation"
        : input.modality === "diagram"
          ? narrationFunction === "causal"
            ? "causal-mechanism"
            : narrationFunction === "quantitative"
              ? "quantitative-comparison"
              : "historical-process"
          : /\b(?:wreck|graves?|remains|equipment|message|note|cairn)\b/iu.test(excerpt)
            ? "material-evidence"
            : /\b(?:army|campaign|route|trade)\b/iu.test(excerpt)
              ? "historical-process"
              : "period-context";
  const composition = buildProgressionCompositionV35({
    narrationFunction,
    modality: input.modality,
    progressionRole,
    subject,
    place,
    claimId: primaryClaimId,
  });
  const fingerprintSource = [
    input.modality,
    evidenceClass,
    narrationFunction,
    progressionRole,
    composition,
    period ?? "unspecified-period",
    place ?? "unspecified-geography",
    [...input.claimKinds].sort().join(","),
    [...claimIds].sort().join(","),
  ].join("|");
  const fingerprint = createHash("sha256").update(fingerprintSource).digest("hex").slice(0, 16);
  return {
    id: `visual-concept-${input.beatId}`,
    beatId: input.beatId,
    modality: input.modality,
    historicalSubject: subject,
    approximatePeriod: period,
    settingGeography: place,
    evidenceSourceClass: evidenceClass,
    intendedComposition: composition,
    protectedFactualRelation: excerpt.slice(0, 120),
    uncertaintyLimits: excerpt.match(/\b(?:may|might|uncertain|possibly|perhaps)\b/iu)
      ? ["preserve narrated uncertainty; do not imply certainty beyond script"]
      : [],
    forbiddenAnachronisms: [
      "unsupported place labels",
      "invented uniforms or technology",
      "modern map styling presented as period evidence",
    ],
    fingerprint,
  };
}

export function semanticShotStructuresV35(input: {
  readonly shots: readonly HistoryShotV34[];
  readonly beats: readonly HistoryBeatV35[];
  readonly concepts: readonly HistoryVisualConceptV35[];
}): string[] {
  const beatModality = new Map(input.beats.map((beat) => [beat.id, beat.modality] as const));
  const conceptByBeat = new Map(input.concepts.map((concept) => [concept.beatId, concept] as const));
  return input.shots.map((shot) => {
    const modality = beatModality.get(shot.beatId) ?? "archival image";
    const concept = conceptByBeat.get(shot.beatId);
    const progressionRole = (shot.purpose.split(/\s+/u)[0] ?? "establish") as EditorialProgressionRole;
    const signature = buildVisualSemanticSignatureV35({
      modality,
      subject: shot.subject,
      claimIds: shot.linkedClaimIds,
      composition: concept?.intendedComposition ?? shot.action,
      progressionRole,
      action: shot.action,
      modalityStateReference: shot.modalityStateReference,
    });
    return canonicalViewerConceptSignatureKeyV35({
      signature,
      subject: shot.subject,
      setting: concept?.settingGeography ?? null,
      modality,
    });
  });
}

export function normalizeTreatmentActionFamilyV35(action: string): string {
  const normalized = action
    .replace(/\s+for\s+.+$/iu, "")
    .replace(/\s+on\s+.+$/iu, "")
    .trim()
    .toLocaleLowerCase();
  if (/\bannotation appearance|label reveal\b/iu.test(normalized)) return "structured-annotation";
  if (/\bdocument evidence\b/iu.test(normalized)) return "document-evidence";
  if (/\benvironmental establishing\b/iu.test(normalized)) return "environment-establish";
  if (/\bartifact detail|evidentiary\b/iu.test(normalized)) return "artifact-detail";
  if (/\bcomparison reveal\b/iu.test(normalized)) return "comparison-reveal";
  if (/\bdiagram layer|diagram progression\b/iu.test(normalized)) return "diagram-layer";
  if (/\bmap orientation|route progression\b/iu.test(normalized)) return "map-progression";
  if (/\bgeneric animated reveal|opacity\b/iu.test(normalized)) return "generic-reveal";
  if (/\bconsequential aftermath\b/iu.test(normalized)) return "aftermath-transition";
  if (/\bexplanatory annotation\b/iu.test(normalized)) return "explanatory-annotation";
  return normalized.split(/\s+/u).slice(0, 4).join(" ");
}

export interface VisualTreatmentSignature {
  readonly modality: HistoryVisualModalityV35;
  readonly treatmentFamily: VisualTemplateFamily;
  readonly editorialPurpose: EditorialProgressionRole;
  readonly compositionFamily: ReturnType<typeof classifyCompositionFamilyV35>;
  readonly motionFamily: ReturnType<typeof classifyMotionFamilyV35>;
  readonly transitionFamily: ReturnType<typeof classifyTransitionFamilyV35>;
  readonly actionFamily: string;
  readonly revealFamily: string;
}

export function buildVisualTreatmentSignatureV35(input: {
  readonly shot: HistoryShotV34;
  readonly modality: HistoryVisualModalityV35;
  readonly progressionRole: EditorialProgressionRole;
}): VisualTreatmentSignature {
  const actionFamily = normalizeTreatmentActionFamilyV35(input.shot.action);
  const revealFamily = /\bannotation|label reveal|comparison reveal|diagram layer\b/iu.test(
    actionFamily
  )
    ? "structured-reveal"
    : /\breveal|opacity\b/iu.test(actionFamily)
      ? "generic-reveal"
      : "none";
  return {
    modality: input.modality,
    treatmentFamily: classifyTemplateFamilyV35({
      modality: input.modality,
      composition: input.shot.framing,
      progressionRole: input.progressionRole,
      action: actionFamily,
    }),
    editorialPurpose: input.progressionRole,
    compositionFamily: classifyCompositionFamilyV35(input.shot.framing),
    motionFamily: classifyMotionFamilyV35(input.shot.cameraMovement),
    transitionFamily: classifyTransitionFamilyV35(input.shot.transition),
    actionFamily,
    revealFamily,
  };
}

export function treatmentSignatureKeyV35(signature: VisualTreatmentSignature): string {
  return [
    signature.modality,
    signature.treatmentFamily,
    signature.editorialPurpose,
    signature.compositionFamily,
    signature.motionFamily,
    signature.transitionFamily,
    signature.actionFamily,
    signature.revealFamily,
  ].join("|");
}

export function measureNearbyTreatmentRepetitionV35(
  signatures: readonly VisualTreatmentSignature[]
): number {
  if (signatures.length < 2) return 0;
  let repetitivePairs = 0;
  for (let index = 1; index < signatures.length; index += 1) {
    const prior = signatures[index - 1]!;
    const next = signatures[index]!;
    if (treatmentSignatureKeyV35(prior) === treatmentSignatureKeyV35(next))
      repetitivePairs += 1;
  }
  return repetitivePairs / (signatures.length - 1);
}

export function measureTreatmentWindowConcentrationV35(
  signatures: readonly VisualTreatmentSignature[],
  windowSize: number = SEGMENT_DIVERSITY_WINDOW_V35
): number {
  if (signatures.length < windowSize) return 0;
  let maxConcentration = 0;
  for (let start = 0; start <= signatures.length - windowSize; start += 1) {
    const window = signatures.slice(start, start + windowSize);
    const families = window.map((item) => treatmentSignatureKeyV35(item));
    const dominant = Math.max(
      ...[...new Set(families)].map(
        (family) => families.filter((item) => item === family).length
      )
    );
    maxConcentration = Math.max(maxConcentration, dominant / windowSize);
  }
  return maxConcentration;
}

export function scoreTreatmentNoveltyV35(
  prior: VisualTreatmentSignature | null,
  next: VisualTreatmentSignature
): number {
  if (!prior) return 10;
  let score = 0;
  if (prior.modality !== next.modality) score += 3;
  if (prior.treatmentFamily !== next.treatmentFamily) score += 3;
  if (prior.editorialPurpose !== next.editorialPurpose) score += 1;
  if (prior.compositionFamily !== next.compositionFamily) score += 2;
  if (prior.motionFamily !== next.motionFamily) score += 1;
  if (prior.transitionFamily !== next.transitionFamily) score += 1;
  return score;
}

export function scoreSemanticNoveltySeparateV35(
  prior: VisualSemanticSignature | null,
  next: VisualSemanticSignature
): number {
  return scoreSemanticNoveltyV35(prior, next).score;
}
