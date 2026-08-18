import type { CanonicalSourcePlannerInput } from "./veronica-content-pack-2-ingestion.js";
import { buildVeronicaCanonicalVisualPlan } from "./positioning-visual-planner.js";
import { stableHash } from "./positioning-visual-semantics.js";
import type { PositioningFormat } from "./positioning-visual-contracts.js";
import type { VeronicaNarrativeFunction } from "./veronica-visual-language.js";

export const VERONICA_UNIFIED_V3_SEMANTIC_PLAN_VERSION =
  "veronica-unified-v3-semantic-plan.v3" as const;

export type VeronicaStoryMode =
  | "character-led"
  | "object-led"
  | "process-led"
  | "ensemble";

export interface VeronicaNarrationSpanV3 {
  readonly text: string;
  readonly startOffset: number;
  readonly endOffset: number;
  readonly sourceHash: string;
}

export interface VeronicaEvidenceNeedV3 {
  readonly required: boolean;
  readonly objectPhrase: string | null;
  readonly sourceHash: string | null;
}

export interface VeronicaSubjectPlanV3 {
  readonly mode: VeronicaStoryMode;
  readonly primaryIdentityId: string | null;
  readonly supportingIdentityIds: readonly string[];
  readonly subjectRole: "buyer" | "expert" | "business-operator" | "none";
}

export interface VeronicaSemanticSceneV3 {
  readonly sceneId: string;
  readonly narrationSpan: VeronicaNarrationSpanV3;
  readonly narrativeFunction: VeronicaNarrativeFunction;
  readonly communicationIntent: string;
  readonly proposition: string;
  readonly visualizableClaim: string;
  readonly continuityGroup: string;
  readonly subject: VeronicaSubjectPlanV3;
  readonly evidenceNeed: VeronicaEvidenceNeedV3;
  readonly transitionRelationship:
    | "introduces"
    | "explains"
    | "contrasts"
    | "demonstrates"
    | "resolves";
  readonly treatment: {
    readonly strategy: string;
    readonly environment: string;
    readonly composition: string;
    readonly camera: string;
  };
  readonly assetId: string;
  readonly visualStateId: string;
}

export interface VeronicaVisualStateV3 {
  readonly visualStateId: string;
  readonly assetId: string;
  readonly sceneId: string;
  readonly startMs: number;
  readonly durationMs: number;
  readonly semanticClaimHash: string;
  readonly explicitMultiStateAsset: false;
}

export interface VeronicaSemanticAssetV3 {
  readonly assetId: string;
  readonly sceneId: string;
  readonly prompt: string;
  readonly promptHash: string;
  readonly textFree: true;
}

export interface VeronicaSemanticEventV3 {
  readonly eventId: string;
  readonly sceneId: string;
  readonly assetId: string;
  readonly visualStateId: string;
  readonly kind: "establishing-crop" | "slow-push" | "reveal" | "prop-detail";
  readonly startMs: number;
  readonly durationMs: number;
}

export interface VeronicaPortfolioFindingV3 {
  readonly code: string;
  readonly severity: "warning" | "blocker";
  readonly storyIds: readonly string[];
  readonly sceneIds: readonly string[];
  readonly observed: number | string;
  readonly threshold: number | string;
  readonly message: string;
}

export interface VeronicaPortfolioValidationV3 {
  readonly status: "pass" | "fail";
  readonly findings: readonly VeronicaPortfolioFindingV3[];
  readonly distributions: Readonly<
    Record<
      string,
      readonly { readonly value: string; readonly count: number }[]
    >
  >;
}

export interface VeronicaUnifiedV3SemanticPlan {
  readonly schemaVersion: typeof VERONICA_UNIFIED_V3_SEMANTIC_PLAN_VERSION;
  readonly plannerVersion: "veronica-unified-v3-semantic-planner.v1";
  readonly contentId: string;
  readonly format: PositioningFormat;
  readonly canonicalSourceHash: string;
  readonly legacyPlanHash: string;
  readonly sourceNarrationHash: string;
  readonly subjectPlan: VeronicaSubjectPlanV3;
  readonly scenes: readonly VeronicaSemanticSceneV3[];
  readonly visualStates: readonly VeronicaVisualStateV3[];
  readonly assets: readonly VeronicaSemanticAssetV3[];
  readonly visualEvents: readonly VeronicaSemanticEventV3[];
  readonly thumbnail: {
    readonly centralContradiction: string;
    readonly primaryObjectOrPerson: string;
    readonly tension: string;
    readonly composition: string;
    readonly titleRelationship: "thumbnail visualizes the consequence or contradiction; title supplies the claim";
    readonly distinctFromNeighboringEpisodes: string;
    readonly sourceHash: string;
  };
  readonly cadence: {
    readonly motionEventCount: number;
    readonly baseVisualStateCount: number;
    readonly semanticNoveltyCount: number;
    readonly longestBaseVisualStateHoldMs: number;
  };
  readonly validation: {
    readonly status: "pass" | "fail";
    readonly findings: readonly VeronicaPortfolioFindingV3[];
  };
  readonly planHash: string;
}

interface SentenceUnit {
  readonly text: string;
  readonly startOffset: number;
  readonly endOffset: number;
}

const nonObjectWords = new Set([
  "a",
  "an",
  "and",
  "are",
  "as",
  "at",
  "be",
  "because",
  "been",
  "between",
  "but",
  "can",
  "do",
  "does",
  "for",
  "from",
  "how",
  "if",
  "in",
  "is",
  "isn",
  "it",
  "of",
  "on",
  "or",
  "that",
  "the",
  "then",
  "to",
  "was",
  "what",
  "when",
  "with",
  "you",
]);

const concreteHeads = new Set([
  "appointment",
  "brief",
  "book",
  "box",
  "calendar",
  "card",
  "checkout",
  "comparison",
  "contract",
  "display",
  "document",
  "invoice",
  "order",
  "package",
  "page",
  "payment",
  "portfolio",
  "product",
  "proposal",
  "receipt",
  "sample",
  "shelf",
  "shop",
  "slot",
  "table",
  "website",
]);

function splitSentences(narration: string): readonly SentenceUnit[] {
  const units: SentenceUnit[] = [];
  const matcher = /[^.!?…]+(?:[.!?…]+[”"'’)]*|$)/gu;
  for (const match of narration.matchAll(matcher)) {
    const text = match[0].trim();
    if (!text) continue;
    const offset = match.index ?? 0;
    const startOffset = offset + match[0].indexOf(text);
    units.push({ text, startOffset, endOffset: startOffset + text.length });
  }
  return units.length > 0
    ? units
    : [
        {
          text: narration.trim(),
          startOffset: 0,
          endOffset: narration.trim().length,
        },
      ];
}

function groupSentences(input: {
  readonly narration: string;
  readonly format: PositioningFormat;
}): readonly VeronicaNarrationSpanV3[] {
  const units = splitSentences(input.narration);
  const desired =
    input.format === "long"
      ? Math.max(12, Math.min(16, Math.round(units.length / 2)))
      : Math.max(5, Math.min(8, Math.round(units.length / 2)));
  const count = Math.min(desired, units.length);
  const groups = Array.from(
    { length: Math.max(1, count) },
    () => [] as SentenceUnit[]
  );
  units.forEach((unit, index) =>
    groups[
      Math.min(
        groups.length - 1,
        Math.floor((index * groups.length) / units.length)
      )
    ]!.push(unit)
  );
  return groups.map((group) => {
    const first = group[0]!;
    const last = group.at(-1)!;
    const text = group.map((item) => item.text).join(" ");
    return {
      text,
      startOffset: first.startOffset,
      endOffset: last.endOffset,
      sourceHash: stableHash({
        startOffset: first.startOffset,
        endOffset: last.endOffset,
        text,
      }),
    };
  });
}

export function deriveVeronicaNarrativeFunction(input: {
  readonly span: string;
  readonly index: number;
  readonly count: number;
}): VeronicaNarrativeFunction {
  const text = input.span.toLowerCase();
  if (
    input.index === 0 &&
    (/[?]|\b(?:why|stop|never|most|your)\b/u.test(text) || input.count > 1)
  )
    return "hook";
  if (/\b(?:for example|for instance|imagine|consider)\b/u.test(text))
    return "example";
  if (
    /\b(?:because|therefore|which means|so that|this is why|causes?)\b/u.test(
      text
    )
  )
    return "mechanism";
  if (/\b(?:instead|rather than|but|however|versus|different)\b/u.test(text))
    return "contrast";
  if (/\b(?:proof|evidence|shows?|results?|review|case study)\b/u.test(text))
    return "evidence";
  if (/\b(?:first|then|step|process|method|start by)\b/u.test(text))
    return "resolution";
  if (/\b(?:choose|decision|buy|customer|client)\b/u.test(text))
    return "consequence";
  if (input.index === input.count - 1) return "payoff";
  if (input.index === 1) return "context";
  return "mechanism";
}

export function selectVeronicaEvidenceObject(
  span: VeronicaNarrationSpanV3
): VeronicaEvidenceNeedV3 {
  const words = span.text.toLowerCase().match(/[a-z]+(?:['’-][a-z]+)?/gu) ?? [];
  for (let index = 0; index < words.length; index += 1) {
    const head = words[index]!;
    if (!concreteHeads.has(head) || nonObjectWords.has(head)) continue;
    const modifier = words[index - 1];
    const phrase =
      modifier && !nonObjectWords.has(modifier) ? `${modifier} ${head}` : head;
    return {
      required: true,
      objectPhrase: phrase,
      sourceHash: span.sourceHash,
    };
  }
  return { required: false, objectPhrase: null, sourceHash: null };
}

function storySubjectPlan(input: {
  readonly contentId: string;
  readonly narration: string;
}): VeronicaSubjectPlanV3 {
  const text = input.narration.toLowerCase();
  const role = /\b(?:customer|buyer|client)\b/u.test(text)
    ? ("buyer" as const)
    : /\b(?:owner|operator|business)\b/u.test(text)
      ? ("business-operator" as const)
      : /\b(?:expert|professional|you)\b/u.test(text)
        ? ("expert" as const)
        : ("none" as const);
  const mode: VeronicaStoryMode = /\b(?:customer|buyer|client|you)\b/u.test(
    text
  )
    ? "character-led"
    : /\b(?:step|process|workflow|system)\b/u.test(text)
      ? "process-led"
      : "object-led";
  const primaryIdentityId =
    role === "none" ? null : `${input.contentId.toLowerCase()}-${role}`;
  return {
    mode,
    primaryIdentityId,
    supportingIdentityIds: [],
    subjectRole: role,
  };
}

function treatmentFor(
  span: string,
  format: PositioningFormat
): VeronicaSemanticSceneV3["treatment"] {
  const text = span.toLowerCase();
  if (/\b(?:versus|instead|different|compare|choice)\b/u.test(text)) {
    return {
      strategy: "comparison-composition",
      environment: "decision comparison surface",
      composition: "two source-grounded alternatives in direct contrast",
      camera: "45mm over-shoulder comparison",
    };
  }
  if (/\b(?:step|process|workflow|system|sequence)\b/u.test(text)) {
    return {
      strategy: "process-visualization",
      environment: "active process workspace",
      composition: "ordered physical stages reveal the mechanism",
      camera: "35mm lateral process view",
    };
  }
  if (/\b(?:proof|evidence|review|result|example)\b/u.test(text)) {
    return {
      strategy: "evidence-proof",
      environment: "case-study evidence surface",
      composition: "one concrete proof item resolves the claim",
      camera: "70mm controlled evidence detail",
    };
  }
  if (/\b(?:cost|price|revenue|margin|payment|product|offer)\b/u.test(text)) {
    return {
      strategy: "product-object-still-life",
      environment: "operational decision table",
      composition: "physical inputs and consequence remain legible together",
      camera: "50mm editorial object view",
    };
  }
  if (/\b(?:buyer|customer|client|choose|decision)\b/u.test(text)) {
    return {
      strategy: "client-decision",
      environment: "real customer decision context",
      composition: "decision maker meets one visible consequence",
      camera:
        format === "short"
          ? "40mm immediate decision view"
          : "32mm contextual decision view",
    };
  }
  if (/\b(?:niche|audience|everyone|market|specific)\b/u.test(text)) {
    return {
      strategy: "audience-segmentation",
      environment: "source-relevant audience context",
      composition: "one qualifying situation separates from the broad field",
      camera: "85mm selective audience view",
    };
  }
  if (/\b(?:content|post|publish|view|attention|media)\b/u.test(text)) {
    return {
      strategy: "publishing-media-authority",
      environment: "working editorial distribution context",
      composition: "one source claim travels through a visible medium",
      camera: "55mm editorial medium view",
    };
  }
  if (/\b(?:position|recognition|remember|reputation|identity)\b/u.test(text)) {
    return {
      strategy: "identity-perception",
      environment: "source-relevant recognition context",
      composition: "observable signals form one remembered impression",
      camera: "65mm perception-led portrait context",
    };
  }
  return {
    strategy: "environmental-storytelling",
    environment: "source-relevant working environment",
    composition: "one observable consequence anchors the proposition",
    camera: "35mm documentary editorial view",
  };
}

function intentFor(fn: VeronicaNarrativeFunction): string {
  switch (fn) {
    case "hook":
      return "create-tension";
    case "contrast":
      return "compare-alternatives";
    case "evidence":
      return "make-proof-visible";
    case "mechanism":
      return "explain-causality";
    case "resolution":
      return "explain-process";
    case "payoff":
      return "deliver-payoff";
    default:
      return "show-consequence";
  }
}

function relationshipFor(
  fn: VeronicaNarrativeFunction
): VeronicaSemanticSceneV3["transitionRelationship"] {
  if (fn === "hook" || fn === "context") return "introduces";
  if (fn === "contrast") return "contrasts";
  if (fn === "evidence" || fn === "example") return "demonstrates";
  if (fn === "payoff" || fn === "resolution") return "resolves";
  return "explains";
}

export function deriveVeronicaSourceSpanProposition(span: string): string {
  return span
    .replace(/\s+/gu, " ")
    .trim()
    .replace(/[.!?]+$/u, "");
}

function promptFor(input: {
  readonly format: PositioningFormat;
  readonly scene: Omit<VeronicaSemanticSceneV3, "assetId" | "visualStateId">;
}): string {
  const ratio = input.format === "long" ? "16:9" : "9:16";
  const object = input.scene.evidenceNeed.objectPhrase;
  return [
    `Text-free ${ratio} ${input.scene.treatment.strategy}.`,
    `Visible claim: ${input.scene.visualizableClaim}.`,
    `Environment: ${input.scene.treatment.environment}.`,
    `Composition: ${input.scene.treatment.composition}. Camera: ${input.scene.treatment.camera}.`,
    ...(object ? [`Concrete source-backed object: ${object}.`] : []),
    "Contemporary European editorial realism; no readable text, letters, numbers, logos, UI, generic office, or stock handshake.",
  ].join(" ");
}

export function validateVeronicaUnifiedV3SemanticPlan(
  plan: Omit<VeronicaUnifiedV3SemanticPlan, "validation" | "planHash">
): readonly VeronicaPortfolioFindingV3[] {
  const findings: VeronicaPortfolioFindingV3[] = [];
  for (const asset of plan.assets) {
    const malformed = asset.prompt.match(
      /\b(?:are|can|after|about|already|actually|but|everyone|between|isn) evidence artifact\b/iu
    );
    if (malformed) {
      findings.push({
        code: "INVALID_EVIDENCE_FRAGMENT",
        severity: "blocker",
        storyIds: [plan.contentId],
        sceneIds: [asset.sceneId],
        observed: malformed[0],
        threshold: "concrete source object or omission",
        message:
          "Provider prompt contains a malformed evidence-object fragment.",
      });
    } else if (/\bevidence artifact\b/iu.test(asset.prompt)) {
      findings.push({
        code: "MALFORMED_EVIDENCE_ARTIFACT",
        severity: "blocker",
        storyIds: [plan.contentId],
        sceneIds: [asset.sceneId],
        observed: asset.prompt,
        threshold: "absent",
        message:
          "Provider prompt contains a forbidden invented evidence-artifact fragment.",
      });
    }
  }
  for (const scene of plan.scenes) {
    if (
      /a buyer observes how .*changes whether an expert is understood and chosen|it is not a decorative restatement/iu.test(
        scene.proposition
      )
    ) {
      findings.push({
        code: "GENERIC_SEMANTIC_BOILERPLATE",
        severity: "blocker",
        storyIds: [plan.contentId],
        sceneIds: [scene.sceneId],
        observed: scene.proposition,
        threshold: "source-grounded claim",
        message:
          "Scene proposition contains forbidden generic semantic boilerplate.",
      });
    }
  }
  if (plan.format === "long" && plan.visualStates.length < 12) {
    findings.push({
      code: "LONG_BASE_VISUAL_STATE_COUNT_LOW",
      severity: "blocker",
      storyIds: [plan.contentId],
      sceneIds: [],
      observed: plan.visualStates.length,
      threshold: 12,
      message: "Long-form plan has fewer than twelve semantic visual states.",
    });
  }
  if (plan.cadence.longestBaseVisualStateHoldMs > 60_000) {
    findings.push({
      code: "BASE_VISUAL_HOLD_TOO_LONG",
      severity: "blocker",
      storyIds: [plan.contentId],
      sceneIds: [],
      observed: plan.cadence.longestBaseVisualStateHoldMs,
      threshold: 60_000,
      message: "A base visual state holds longer than sixty seconds.",
    });
  }
  const sceneIdentities = new Set(
    plan.scenes.map((scene) => scene.subject.primaryIdentityId).filter(Boolean)
  );
  if (plan.subjectPlan.mode !== "ensemble" && sceneIdentities.size > 2) {
    findings.push({
      code: "UNJUSTIFIED_SUBJECT_CHURN",
      severity: "blocker",
      storyIds: [plan.contentId],
      sceneIds: plan.scenes.map((scene) => scene.sceneId),
      observed: sceneIdentities.size,
      threshold: 2,
      message: "A non-ensemble story changes primary human identity too often.",
    });
  }
  if (
    plan.visualStates.length === 1 &&
    plan.visualEvents.length > 2 &&
    plan.cadence.semanticNoveltyCount <= 1
  ) {
    findings.push({
      code: "SEMANTIC_STATE_NOVELTY_INSUFFICIENT",
      severity: "blocker",
      storyIds: [plan.contentId],
      sceneIds: plan.visualStates.map((state) => state.sceneId),
      observed: `${plan.visualEvents.length} motion events / ${plan.cadence.semanticNoveltyCount} semantic states`,
      threshold: "motion events must not substitute for semantic states",
      message:
        "Motion-event cadence is being counted as semantic visual novelty.",
    });
  }
  return findings;
}

export async function buildVeronicaUnifiedV3SemanticPlan(input: {
  readonly plannerInput: CanonicalSourcePlannerInput;
  readonly outputDir: string;
}): Promise<VeronicaUnifiedV3SemanticPlan> {
  const legacy = await buildVeronicaCanonicalVisualPlan(input);
  const narration = input.plannerInput.narration.narration;
  const thumbnailClaim = deriveVeronicaSourceSpanProposition(
    splitSentences(narration)[0]?.text ?? narration
  );
  const spans = groupSentences({ narration, format: legacy.format });
  const subjectPlan = storySubjectPlan({
    contentId: legacy.contentId,
    narration,
  });
  const totalDurationMs = Math.max(
    1,
    Math.round(
      (narration.trim().split(/\s+/u).filter(Boolean).length /
        input.plannerInput.planningConfiguration.targetWordsPerMinute) *
        60_000
    )
  );
  const sceneDuration = Math.floor(totalDurationMs / Math.max(1, spans.length));
  const scenes = spans.map((span, index) => {
    const narrativeFunction = deriveVeronicaNarrativeFunction({
      span: span.text,
      index,
      count: spans.length,
    });
    const treatment = treatmentFor(span.text, legacy.format);
    const assetId =
      `${legacy.contentId}-${String(index + 1).padStart(2, "0")}-base`.toLowerCase();
    const visualStateId = `${assetId}-state`;
    return {
      sceneId: `${legacy.contentId}-S${String(index + 1).padStart(2, "0")}`,
      narrationSpan: span,
      narrativeFunction,
      communicationIntent: intentFor(narrativeFunction),
      proposition: deriveVeronicaSourceSpanProposition(span.text),
      visualizableClaim: deriveVeronicaSourceSpanProposition(span.text),
      continuityGroup: `${legacy.contentId.toLowerCase()}-${subjectPlan.mode}`,
      subject: subjectPlan,
      evidenceNeed: selectVeronicaEvidenceObject(span),
      transitionRelationship: relationshipFor(narrativeFunction),
      treatment,
      assetId,
      visualStateId,
    } as const;
  });
  const visualStates = scenes.map((scene, index) => {
    const startMs = index * sceneDuration;
    const durationMs =
      index === scenes.length - 1 ? totalDurationMs - startMs : sceneDuration;
    return {
      visualStateId: scene.visualStateId,
      assetId: scene.assetId,
      sceneId: scene.sceneId,
      startMs,
      durationMs,
      semanticClaimHash: stableHash(scene.proposition),
      explicitMultiStateAsset: false as const,
    };
  });
  const assets = scenes.map((scene) => {
    const {
      assetId: _assetId,
      visualStateId: _stateId,
      ...withoutAsset
    } = scene;
    const prompt = promptFor({ format: legacy.format, scene: withoutAsset });
    return {
      assetId: scene.assetId,
      sceneId: scene.sceneId,
      prompt,
      promptHash: stableHash(prompt),
      textFree: true as const,
    };
  });
  const visualEvents = visualStates.flatMap((state, stateIndex) => {
    const eventCount = Math.max(1, Math.ceil(state.durationMs / 15_000));
    const eventDuration = Math.floor(state.durationMs / eventCount);
    return Array.from({ length: eventCount }, (_, eventIndex) => ({
      eventId:
        `${state.sceneId}-event-${String(eventIndex + 1).padStart(2, "0")}`.toLowerCase(),
      sceneId: state.sceneId,
      assetId: state.assetId,
      visualStateId: state.visualStateId,
      kind:
        eventIndex === 0
          ? ("establishing-crop" as const)
          : (stateIndex + eventIndex) % 2 === 0
            ? ("slow-push" as const)
            : ("reveal" as const),
      startMs: state.startMs + eventIndex * eventDuration,
      durationMs:
        eventIndex === eventCount - 1
          ? state.durationMs - eventIndex * eventDuration
          : eventDuration,
    }));
  });
  const novelty = new Set(visualStates.map((state) => state.semanticClaimHash))
    .size;
  const provisional = {
    schemaVersion: VERONICA_UNIFIED_V3_SEMANTIC_PLAN_VERSION,
    plannerVersion: "veronica-unified-v3-semantic-planner.v1" as const,
    contentId: legacy.contentId,
    format: legacy.format,
    canonicalSourceHash: legacy.canonicalSourceHash,
    legacyPlanHash: legacy.planHash,
    sourceNarrationHash: stableHash(narration),
    subjectPlan,
    scenes,
    visualStates,
    assets,
    visualEvents,
    thumbnail: {
      centralContradiction: thumbnailClaim,
      primaryObjectOrPerson:
        scenes.find((scene) => scene.evidenceNeed.objectPhrase)?.evidenceNeed
          .objectPhrase ?? subjectPlan.subjectRole,
      tension:
        scenes.find((scene) => scene.narrativeFunction === "contrast")
          ?.visualizableClaim ??
        scenes.at(-1)?.visualizableClaim ??
        "source consequence",
      composition:
        scenes[0]?.treatment.composition ?? "source-grounded editorial frame",
      titleRelationship:
        "thumbnail visualizes the consequence or contradiction; title supplies the claim" as const,
      distinctFromNeighboringEpisodes: `source claim ${stableHash(scenes.map((scene) => scene.narrationSpan.sourceHash)).slice(0, 12)}`,
      sourceHash: scenes[0]?.narrationSpan.sourceHash ?? stableHash(narration),
    },
    cadence: {
      motionEventCount: visualEvents.length,
      baseVisualStateCount: visualStates.length,
      semanticNoveltyCount: novelty,
      longestBaseVisualStateHoldMs: Math.max(
        0,
        ...visualStates.map((state) => state.durationMs)
      ),
    },
  } as const;
  const findings = validateVeronicaUnifiedV3SemanticPlan(provisional);
  const withoutHash = {
    ...provisional,
    validation: {
      status: findings.some((finding) => finding.severity === "blocker")
        ? ("fail" as const)
        : ("pass" as const),
      findings,
    },
  };
  return { ...withoutHash, planHash: stableHash(withoutHash) };
}

function distribution(values: readonly string[]) {
  return [
    ...new Map(
      values.map((value) => [
        value,
        values.filter((candidate) => candidate === value).length,
      ])
    ).entries(),
  ]
    .map(([value, count]) => ({ value, count }))
    .sort(
      (left, right) =>
        right.count - left.count || left.value.localeCompare(right.value)
    );
}

export function validateVeronicaUnifiedV3Portfolio(
  plans: readonly VeronicaUnifiedV3SemanticPlan[]
): VeronicaPortfolioValidationV3 {
  const findings: VeronicaPortfolioFindingV3[] = [];
  const byFormat = new Map<
    PositioningFormat,
    VeronicaUnifiedV3SemanticPlan[]
  >();
  for (const plan of plans)
    byFormat.set(plan.format, [...(byFormat.get(plan.format) ?? []), plan]);
  for (const [format, entries] of byFormat) {
    if (entries.length < 8) continue;
    const signatures = entries.map((plan) =>
      plan.scenes.map((scene) => scene.narrativeFunction).join(",")
    );
    for (const item of distribution(signatures)) {
      const share = item.count / entries.length;
      if (share > 0.35)
        findings.push({
          code: "NARRATIVE_SIGNATURE_CONCENTRATION",
          severity: share > 0.5 ? "blocker" : "warning",
          storyIds: entries
            .filter(
              (plan) =>
                plan.scenes
                  .map((scene) => scene.narrativeFunction)
                  .join(",") === item.value
            )
            .map((plan) => plan.contentId),
          sceneIds: [],
          observed: share,
          threshold: share > 0.5 ? 0.5 : 0.35,
          message: `${format} narrative-function signature is overly concentrated.`,
        });
    }
  }
  const allScenes = plans.flatMap((plan) =>
    plan.scenes.map((scene) => ({ plan, scene }))
  );
  const fields: ReadonlyArray<
    [string, (item: (typeof allScenes)[number]) => string]
  > = [
    ["treatment", (item) => item.scene.treatment.strategy],
    ["camera", (item) => item.scene.treatment.camera],
    ["environment", (item) => item.scene.treatment.environment],
    ["composition", (item) => item.scene.treatment.composition],
    [
      "subject",
      (item) => item.scene.subject.primaryIdentityId ?? "people-free",
    ],
  ];
  const distributions: Record<
    string,
    readonly { readonly value: string; readonly count: number }[]
  > = {};
  for (const [name, select] of fields) {
    const values = allScenes.map(select);
    distributions[name] = distribution(values);
    const top = distributions[name][0];
    if (top && top.count / Math.max(1, values.length) > 0.35) {
      findings.push({
        code: `PORTFOLIO_${name.toUpperCase()}_CONCENTRATION`,
        severity: top.count / values.length > 0.5 ? "blocker" : "warning",
        storyIds: allScenes
          .filter((item) => select(item) === top.value)
          .map((item) => item.plan.contentId),
        sceneIds: allScenes
          .filter((item) => select(item) === top.value)
          .map((item) => item.scene.sceneId),
        observed: top.count / values.length,
        threshold: top.count / values.length > 0.5 ? 0.5 : 0.35,
        message: `Portfolio ${name} is overly concentrated.`,
      });
    }
  }
  const concepts = plans.map((plan) =>
    plan.thumbnail.centralContradiction.toLowerCase()
  );
  distributions["thumbnail"] = distribution(concepts);
  for (const item of distributions["thumbnail"].filter(
    (entry) => entry.count > 2
  )) {
    findings.push({
      code: "THUMBNAIL_CONCEPT_DUPLICATION",
      severity: item.count > 4 ? "blocker" : "warning",
      storyIds: plans
        .filter(
          (plan) =>
            plan.thumbnail.centralContradiction.toLowerCase() === item.value
        )
        .map((plan) => plan.contentId),
      sceneIds: [],
      observed: item.count,
      threshold: item.count > 4 ? 4 : 2,
      message: "Thumbnail concept is reused across too many stories.",
    });
  }
  const localFailures = plans.flatMap((plan) => plan.validation.findings);
  return {
    status: [...findings, ...localFailures].some(
      (finding) => finding.severity === "blocker"
    )
      ? "fail"
      : "pass",
    findings: [...localFailures, ...findings],
    distributions,
  };
}
