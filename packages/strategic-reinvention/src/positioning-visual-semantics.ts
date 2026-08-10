import { createHash } from "node:crypto";
import type {
  CommunicationIntent,
  ContinuityPlan,
  DiagramEdge,
  DiagramNode,
  DiagramTopology,
  DiversityMetrics,
  OpeningDiversityDiagnostics,
  OpeningFingerprintEntry,
  PositioningVisualTreatment,
  ProgressionStage,
  ViewerVisibleHookFingerprint,
  VisualGrammarFeatures,
  VisualStrategy,
} from "./positioning-visual-contracts.js";
import type { OpeningTreatmentProfile } from "./positioning-opening-treatments.js";

export function canonicalJson(value: unknown): string {
  if (value === null || typeof value === "string" || typeof value === "boolean") {
    return JSON.stringify(value);
  }
  if (typeof value === "number") {
    return JSON.stringify(Number.isFinite(value) ? value : null);
  }
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  if (typeof value === "object") {
    const entries = Object.entries(value).sort(([left], [right]) => left.localeCompare(right));
    return `{${entries
      .filter(([, item]) => item !== undefined)
      .map(([key, item]) => `${JSON.stringify(key)}:${canonicalJson(item)}`)
      .join(",")}}`;
  }
  throw new Error("Unsupported value in deterministic positioning-plan serialization.");
}

export function stableHash(value: unknown): string {
  return createHash("sha256").update(canonicalJson(value)).digest("hex");
}

export function semanticHash(value: string): string {
  return stableHash(
    value
      .toLowerCase()
      .replace(/[^\p{L}\p{N}]+/gu, " ")
      .trim(),
  );
}

export function semanticTokens(value: string): readonly string[] {
  return [
    ...new Set(
      value
        .toLowerCase()
        .split(/[^\p{L}\p{N}]+/gu)
        .filter((token) => token.length > 2 && !STOP_WORDS.has(token)),
    ),
  ].sort();
}

const STOP_WORDS = new Set(["and", "the", "for", "from", "with", "into", "your", "you"]);

function containsAny(value: string, candidates: readonly string[]): boolean {
  return candidates.some((candidate) => value.includes(candidate));
}

export function deriveIntent(concept: string, stage: ProgressionStage): CommunicationIntent {
  if (stage === "COLD_OPEN" || stage === "HOOK") return "create-tension";
  if (stage === "PAYOFF") return "deliver-payoff";
  if (containsAny(concept, ["vs", "conflict", "gap", "different", "comparison"])) {
    return "compare-alternatives";
  }
  if (containsAny(concept, ["evidence", "proof", "signal", "visible", "recognition"])) {
    return "make-proof-visible";
  }
  if (containsAny(concept, ["system", "workflow", "lifecycle", "chapter-to", "method", "test"])) {
    return "explain-process";
  }
  if (containsAny(concept, ["old", "new", "bridge", "transition", "change"])) {
    return "show-transformation";
  }
  if (containsAny(concept, ["category", "niche", "market", "audience", "segment"])) {
    return "define-category";
  }
  if (containsAny(concept, ["client", "customer", "choose", "choice", "recommendation"])) {
    return "prompt-decision";
  }
  if (stage === "PROOF") return "make-proof-visible";
  if (stage === "MANIFESTATION") return "show-consequence";
  return "explain-causality";
}

export function deriveStrategy(input: {
  readonly concept: string;
  readonly intent: CommunicationIntent;
  readonly stage: ProgressionStage;
  readonly ordinal: number;
}): VisualStrategy {
  const value = input.concept.toLowerCase();
  if (input.stage === "COLD_OPEN") {
    return "symbolic-metaphor";
  }
  if (input.stage === "HOOK") {
    return "symbolic-metaphor";
  }
  if (containsAny(value, ["book", "manuscript", "publisher", "chapter"])) {
    return containsAny(value, ["ecosystem", "content", "atomization", "chapter-to"])
      ? "content-ecosystem"
      : "product-object-still-life";
  }
  if (containsAny(value, ["content", "publishing", "interview", "podcast", "website", "social"])) {
    return containsAny(value, ["system", "ecosystem", "multi-format", "distribution"])
      ? "content-ecosystem"
      : "publishing-media-authority";
  }
  if (containsAny(value, ["old", "new", "bridge", "transition", "reposition", "changed"])) {
    return containsAny(value, ["overlap", "bridge"])
      ? "before-after"
      : "transformation";
  }
  if (containsAny(value, ["market", "crowd", "competitor", "everyone"])) return "market-crowd";
  if (containsAny(value, ["niche", "audience", "segment", "customer-context"])) {
    return "audience-segmentation";
  }
  if (containsAny(value, ["client", "customer", "choice", "choose"])) return "client-decision";
  if (containsAny(value, ["recommend", "conversation", "other-people"])) return "social-interaction";
  if (containsAny(value, ["identity", "perception", "memory", "association", "impression"])) {
    return "identity-perception";
  }
  if (containsAny(value, ["evidence", "proof", "signal", "value", "recognition"])) {
    return "evidence-proof";
  }
  if (containsAny(value, ["vs", "gap", "broad", "specific", "conflict"])) {
    return "comparison-composition";
  }
  if (containsAny(value, ["system", "workflow", "lifecycle", "method", "test", "checklist"])) {
    return "process-visualization";
  }
  const fallbacks: readonly VisualStrategy[] = [
    "human-scenario",
    "environmental-storytelling",
    "abstract-conceptual",
    "semantic-diagram",
  ];
  return fallbacks[input.ordinal % fallbacks.length] ?? "environmental-storytelling";
}

interface GrammarTemplate {
  readonly subject: string;
  readonly environment: string;
  readonly composition: string;
  readonly camera: string;
  readonly props: readonly string[];
}

const GRAMMAR: Readonly<Record<VisualStrategy, GrammarTemplate>> = {
  "human-scenario": {
    subject: "service professional responding to a consequential real-world moment",
    environment: "active service counter or field-work setting",
    composition: "layered observational frame with consequence in foreground",
    camera: "35mm shoulder-height documentary angle",
    props: ["work sample", "client brief"],
  },
  "symbolic-metaphor": {
    subject: "ordinary objects carrying a clear contradiction",
    environment: "minimal tactile stage with deep negative space",
    composition: "single visual paradox split across unequal visual weight",
    camera: "85mm low-angle macro editorial",
    props: ["opaque screen", "illuminated object"],
  },
  "environmental-storytelling": {
    subject: "independent craftsperson visible through traces of completed work",
    environment: "workshop, shop floor, studio wall, or hospitality space",
    composition: "wide environmental tableau with evidence trail",
    camera: "28mm high-corner documentary wide",
    props: ["finished work", "tools in use"],
  },
  "product-object-still-life": {
    subject: "authority artifact with visible physical history",
    environment: "editorial tabletop beside production materials",
    composition: "top-down still life with diagonal artifact progression",
    camera: "50mm overhead copy-stand",
    props: ["manuscript pages", "bound book", "page tabs"],
  },
  "comparison-composition": {
    subject: "two meaningfully different outcomes or choices",
    environment: "dual-world editorial set",
    composition: "asymmetric split composition with a decisive visual imbalance",
    camera: "40mm locked frontal comparison",
    props: ["contrasting evidence sets", "decision marker"],
  },
  transformation: {
    subject: "one professional crossing between conflicting public identities",
    environment: "transitional corridor linking old and new work contexts",
    composition: "threshold composition with subject moving across the divide",
    camera: "32mm lateral tracking perspective",
    props: ["old portfolio", "new proof object"],
  },
  "before-after": {
    subject: "same identity before, during, and after a positioning change",
    environment: "matched triptych across evolving business contexts",
    composition: "three-state panoramic progression",
    camera: "50mm matched locked frames",
    props: ["legacy signal", "bridge artifact", "new signal"],
  },
  "process-visualization": {
    subject: "hands moving physical components through a meaningful process",
    environment: "large planning surface with real production materials",
    composition: "diagonal process path with readable spatial stages",
    camera: "35mm oblique overhead",
    props: ["movable modules", "milestone tokens", "thread"],
  },
  "social-interaction": {
    subject: "peer recommending a specialist to another decision maker",
    environment: "event foyer, café queue, or backstage conversation",
    composition: "over-shoulder conversational triangle",
    camera: "65mm candid eye-line compression",
    props: ["shared artifact", "phone shown without UI"],
  },
  "client-decision": {
    subject: "client comparing credible options at a decision point",
    environment: "procurement table or consultation waiting area",
    composition: "client point-of-view with alternatives receding in depth",
    camera: "45mm seated point-of-view",
    props: ["unlabeled portfolios", "evidence samples", "selection token"],
  },
  "audience-segmentation": {
    subject: "distinct audience clusters separated by needs and context",
    environment: "public concourse transformed into spatial audience islands",
    composition: "high-angle clustered field with a deliberate narrow focus",
    camera: "24mm elevated architectural view",
    props: ["color-coded objects", "path markers"],
  },
  "publishing-media-authority": {
    subject: "expert contributing knowledge through a public medium",
    environment: "podcast booth, small stage, interview corner, or editorial desk",
    composition: "medium-wide frame with medium and audience both visible",
    camera: "70mm off-axis broadcast documentary",
    props: ["microphone", "camera tally light", "printed proof"],
  },
  "content-ecosystem": {
    subject: "one core idea propagating into distinct media artifacts",
    environment: "physical editorial production wall and distribution table",
    composition: "radial system with varied artifacts orbiting a source object",
    camera: "30mm top-down-to-oblique hybrid",
    props: ["audio waveform card", "video frame card", "article sheet", "book chapter"],
  },
  "identity-perception": {
    subject: "professional and audience-held impression shown as separate layers",
    environment: "reflection installation in a public threshold space",
    composition: "foreground reflection opposed to background observation",
    camera: "58mm through-glass layered focus",
    props: ["mirror plane", "silhouette cards", "memory tokens"],
  },
  "evidence-proof": {
    subject: "observable work evidence accumulating into trust",
    environment: "case-study archive, exhibition rail, or results wall",
    composition: "progressive evidence trail leading to a decision",
    camera: "35mm shallow diagonal dolly perspective",
    props: ["before-after sample", "prototype", "testimonial portrait without text"],
  },
  "market-crowd": {
    subject: "many visually similar providers and one legible category owner",
    environment: "crowded trade hall or market aisle",
    composition: "compressed crowd field with controlled focal isolation",
    camera: "105mm elevated telephoto compression",
    props: ["repeated neutral objects", "single category artifact"],
  },
  "abstract-conceptual": {
    subject: "physical light, shadow, and material expressing an invisible idea",
    environment: "architectural light laboratory",
    composition: "geometric negative-space study with one changing boundary",
    camera: "90mm orthographic detail",
    props: ["translucent planes", "prism", "shadow grid"],
  },
  "semantic-diagram": {
    subject: "unlabeled shapes with proposition-specific relationships",
    environment: "warm-paper editorial diagram field",
    composition: "topology-led orthographic composition",
    camera: "orthographic graphic plane",
    props: ["semantic nodes", "directional connectors", "highlight region"],
  },
};

const ENSEMBLE_SUBJECTS = [
  "younger independent product designer",
  "mid-career hospitality owner",
  "older technical consultant",
  "nonbinary creative director",
  "woman-led retail founder",
  "male wellness practitioner",
] as const;

export function grammarFor(input: {
  readonly strategy: VisualStrategy;
  readonly concept: string;
  readonly ordinal: number;
  readonly continuity: ContinuityPlan;
  readonly topology: DiagramTopology["type"] | "none";
}): GrammarTemplate & { readonly features: VisualGrammarFeatures } {
  const template = GRAMMAR[input.strategy];
  const humanStrategies: ReadonlySet<VisualStrategy> = new Set([
    "human-scenario",
    "environmental-storytelling",
    "comparison-composition",
    "transformation",
    "before-after",
    "social-interaction",
    "client-decision",
    "publishing-media-authority",
    "identity-perception",
    "evidence-proof",
    "market-crowd",
  ]);
  const protagonist =
    input.continuity.mode === "persistent-protagonist" && humanStrategies.has(input.strategy);
  const context = [
    "street-facing public threshold",
    "backstage production zone",
    "client point-of-decision zone",
    "artifact archive zone",
    "peer-referral setting",
    "field-work context",
  ][input.ordinal % 6] ?? "active professional context";
  const compositionModifier = [
    "foreground consequence against background cause",
    "left-to-right reveal path",
    "central void separating competing signals",
    "occluded-to-visible information progression",
    "near-far contrast between choice and result",
    "layered reflection with off-axis evidence",
  ][input.ordinal % 6] ?? "layered consequence frame";
  const cameraModifier = [
    "low three-quarter viewpoint",
    "elevated diagonal viewpoint",
    "subjective client viewpoint",
    "lateral profile viewpoint",
    "compressed distant observation",
    "close foreground parallax",
  ][input.ordinal % 6] ?? "documentary viewpoint";
  const semanticProp = `${semanticTokens(input.concept)[0] ?? "concept"} evidence artifact`;
  const subject = protagonist
    ? `${template.subject}; same protagonist ${input.continuity.identityId}`
    : `${template.subject}; ${ENSEMBLE_SUBJECTS[input.ordinal % ENSEMBLE_SUBJECTS.length] ?? ENSEMBLE_SUBJECTS[0]}`;
  const environment = `${template.environment}; ${context}`;
  const composition = `${template.composition}; ${compositionModifier}`;
  const camera = `${template.camera}; ${cameraModifier}`;
  const props = [...template.props, semanticProp];
  return {
    ...template,
    subject,
    environment,
    composition,
    camera,
    props,
    features: {
      strategy: input.strategy,
      subjectArchetype: protagonist ? "persistent-protagonist" : subject,
      environment,
      composition,
      camera,
      props,
      topology: input.topology,
      semanticTokens: semanticTokens(input.concept),
      continuityIdentityId: protagonist ? input.continuity.identityId : null,
    },
  };
}

function node(diagramId: string, role: string): DiagramNode {
  const id = `${diagramId}-${role}`.toLowerCase();
  return { id, semanticRole: role, labelKey: `${diagramId}.${role}`.toLowerCase() };
}

function edge(from: DiagramNode, to: DiagramNode, semanticRole: string): DiagramEdge {
  return { from: from.id, to: to.id, semanticRole };
}

function baseDiagram(sceneId: string, concept: string) {
  return {
    diagramId: `${sceneId}-diagram`.toLowerCase(),
    proposition: concept,
    textFreeBackground: true as const,
  };
}

export interface DiagramSelectionContext {
  readonly usedTopologies: readonly DiagramTopology["type"][];
  readonly previousTopology: DiagramTopology["type"] | null;
}

export function validDiagramTopologies(concept: string): readonly DiagramTopology["type"][] {
  const normalized = concept.toLowerCase();
  if (containsAny(normalized, ["matrix", "problem-angle"])) return ["matrix"];
  if (normalized.includes("overlap")) return ["intersection"];
  if (normalized.includes("bridge")) return ["sequence", "before-after"];
  if (normalized.includes("conflict")) return ["before-after", "comparison"];
  if (containsAny(normalized, ["transition", "reposition", "changed"])) {
    return ["before-after", "sequence"];
  }
  if (containsAny(normalized, ["vs", "difference", "broad-vs", "viral-vs", "expertise-vs"])) {
    return ["comparison"];
  }
  if (containsAny(normalized, ["niche", "narrow", "specificity", "focused"])) {
    return ["funnel", "hierarchy"];
  }
  if (containsAny(normalized, ["intersection", "alignment", "three-part"])) {
    return ["intersection"];
  }
  if (containsAny(normalized, ["system", "ecosystem", "touchpoint", "signals", "distribution"])) {
    return ["hub-spoke", "hierarchy"];
  }
  if (containsAny(normalized, ["chapter-to", "workflow", "lifecycle", "starter-checklist", "method"])) {
    return ["sequence"];
  }
  if (containsAny(normalized, ["category", "subniche", "boundaries"])) return ["hierarchy"];
  if (containsAny(normalized, ["cause", "triggers", "problem-recognition", "confusion"])) {
    return ["cause-effect"];
  }
  return [];
}

export function selectDiagramTopology(
  alternatives: readonly DiagramTopology["type"][],
  context?: DiagramSelectionContext,
): DiagramTopology["type"] | null {
  if (alternatives.length === 0) return null;
  if (!context) return alternatives[0] ?? null;
  const counts = new Map<DiagramTopology["type"], number>();
  context.usedTopologies.forEach((topology) => counts.set(topology, (counts.get(topology) ?? 0) + 1));
  return [...alternatives].sort((left, right) => {
    const leftRepeatPenalty = left === context.previousTopology ? 1 : 0;
    const rightRepeatPenalty = right === context.previousTopology ? 1 : 0;
    return (
      (counts.get(left) ?? 0) - (counts.get(right) ?? 0) ||
      leftRepeatPenalty - rightRepeatPenalty ||
      alternatives.indexOf(left) - alternatives.indexOf(right)
    );
  })[0] ?? null;
}

function sequenceDiagram(
  base: ReturnType<typeof baseDiagram>,
  roles: readonly [string, string, string, ...string[]],
): DiagramTopology {
  const [firstRole, secondRole, thirdRole, ...remainingRoles] = roles;
  const orderedNodes: [DiagramNode, DiagramNode, DiagramNode, ...DiagramNode[]] = [
    node(base.diagramId, firstRole),
    node(base.diagramId, secondRole),
    node(base.diagramId, thirdRole),
    ...remainingRoles.map((role) => node(base.diagramId, role)),
  ];
  return {
    ...base,
    type: "sequence",
    orderedNodes,
    edges: orderedNodes.slice(1).map((item, index) =>
      edge(orderedNodes[index] ?? orderedNodes[0], item, "next"),
    ),
    overlayLabelKeys: orderedNodes.map((item) => item.labelKey),
  };
}

function hierarchyDiagram(
  base: ReturnType<typeof baseDiagram>,
  rootRole: string,
  childRoles: readonly [string, string, ...string[]],
): DiagramTopology {
  const root = node(base.diagramId, rootRole);
  const [firstRole, secondRole, ...remainingRoles] = childRoles;
  const children: [DiagramNode, DiagramNode, ...DiagramNode[]] = [
    node(base.diagramId, firstRole),
    node(base.diagramId, secondRole),
    ...remainingRoles.map((role) => node(base.diagramId, role)),
  ];
  return {
    ...base,
    type: "hierarchy",
    root,
    children,
    edges: children.map((child) => edge(root, child, "contains")),
    overlayLabelKeys: [root.labelKey, ...children.map((item) => item.labelKey)],
  };
}

export function buildSemanticDiagram(
  sceneId: string,
  concept: string,
  context?: DiagramSelectionContext,
): DiagramTopology | null {
  const normalized = concept.toLowerCase();
  const base = baseDiagram(sceneId, normalized);
  const alternatives = validDiagramTopologies(normalized);
  const selected = selectDiagramTopology(alternatives, context);
  if (selected === "hierarchy" && alternatives[0] !== "hierarchy") {
    const representsSignals = containsAny(normalized, ["signals", "touchpoint"]);
    const representsSystem = containsAny(normalized, ["system", "ecosystem", "distribution"]);
    return hierarchyDiagram(
      base,
      representsSignals || representsSystem ? "core-position" : "broad-market",
      representsSignals
        ? ["visible-signal-a", "visible-signal-b", "visible-signal-c"]
        : representsSystem
          ? ["output-channel-a", "output-channel-b", "output-channel-c"]
          : ["qualified-segment-a", "qualified-segment-b", "chosen-niche"],
    );
  }
  if (selected === "sequence" && alternatives[0] !== "sequence") {
    return sequenceDiagram(base, ["broad-or-prior-state", "selection-or-change", "focused-outcome"]);
  }
  if (selected === "comparison" && alternatives[0] !== "comparison") {
    const entities: [DiagramNode, DiagramNode] = [
      node(base.diagramId, "state-a"),
      node(base.diagramId, "state-b"),
    ];
    return {
      ...base,
      type: "comparison",
      entities,
      relation: "contrast",
      overlayLabelKeys: entities.map((item) => item.labelKey),
    };
  }
  if (selected === "before-after" && alternatives[0] !== "before-after") {
    const before = node(base.diagramId, "before-state");
    const transformation = node(base.diagramId, "transition-evidence");
    const after = node(base.diagramId, "after-state");
    return {
      ...base,
      type: "before-after",
      before,
      transformation,
      after,
      edges: [edge(before, transformation, "changes-through"), edge(transformation, after, "becomes")],
      overlayLabelKeys: [before.labelKey, transformation.labelKey, after.labelKey],
    };
  }
  if (containsAny(normalized, ["matrix", "problem-angle"])) {
    const cells: [DiagramNode, DiagramNode, DiagramNode, DiagramNode] = [
      node(base.diagramId, "low-low"),
      node(base.diagramId, "high-low"),
      node(base.diagramId, "low-high"),
      node(base.diagramId, "high-high"),
    ];
    return {
      ...base,
      type: "matrix",
      xAxis: { low: "broad", high: "specific" },
      yAxis: { low: "low-relevance", high: "high-relevance" },
      cells,
      overlayLabelKeys: cells.map((item) => item.labelKey),
    };
  }
  if (normalized.includes("overlap")) {
    const sets: [DiagramNode, DiagramNode] = [
      node(base.diagramId, "legacy-strength"),
      node(base.diagramId, "new-direction"),
    ];
    return {
      ...base,
      type: "intersection",
      sets,
      intersectionMeaning: "credible-transition-bridge",
      overlayLabelKeys: [...sets.map((item) => item.labelKey), `${base.diagramId}.bridge`],
    };
  }
  if (normalized.includes("bridge")) {
    const orderedNodes: [DiagramNode, DiagramNode, DiagramNode] = [
      node(base.diagramId, "credible-past"),
      node(base.diagramId, "bridge-evidence"),
      node(base.diagramId, "new-position"),
    ];
    return {
      ...base,
      type: "sequence",
      orderedNodes,
      edges: [edge(orderedNodes[0], orderedNodes[1], "supports"), edge(orderedNodes[1], orderedNodes[2], "transitions-to")],
      overlayLabelKeys: orderedNodes.map((item) => item.labelKey),
    };
  }
  if (containsAny(normalized, ["conflict", "transition", "reposition", "changed"])) {
    const before = node(base.diagramId, "before-state");
    const transformation = node(base.diagramId, "transformation");
    const after = node(base.diagramId, "after-state");
    return {
      ...base,
      type: "before-after",
      before,
      transformation,
      after,
      edges: [edge(before, transformation, "changes-through"), edge(transformation, after, "becomes")],
      overlayLabelKeys: [before.labelKey, transformation.labelKey, after.labelKey],
    };
  }
  if (containsAny(normalized, ["vs", "difference", "broad-vs", "viral-vs", "expertise-vs"])) {
    const entities: [DiagramNode, DiagramNode] = [
      node(base.diagramId, "alternative-a"),
      node(base.diagramId, "alternative-b"),
    ];
    return {
      ...base,
      type: "comparison",
      entities,
      relation: "contrast",
      overlayLabelKeys: entities.map((item) => item.labelKey),
    };
  }
  if (containsAny(normalized, ["niche", "narrow", "specificity", "focused"])) {
    const stages: [DiagramNode, DiagramNode, DiagramNode] = [
      node(base.diagramId, "broad-market"),
      node(base.diagramId, "qualified-segment"),
      node(base.diagramId, "chosen-niche"),
    ];
    return {
      ...base,
      type: "funnel",
      stages,
      direction: "broad-to-narrow",
      overlayLabelKeys: stages.map((item) => item.labelKey),
    };
  }
  if (containsAny(normalized, ["intersection", "alignment", "three-part"])) {
    const sets: [DiagramNode, DiagramNode, DiagramNode] = [
      node(base.diagramId, "market"),
      node(base.diagramId, "problem"),
      node(base.diagramId, "solution"),
    ];
    return {
      ...base,
      type: "intersection",
      sets,
      intersectionMeaning: "positioning-fit",
      overlayLabelKeys: [...sets.map((item) => item.labelKey), `${base.diagramId}.fit`],
    };
  }
  if (containsAny(normalized, ["system", "ecosystem", "touchpoint", "signals", "distribution"])) {
    const hub = node(base.diagramId, "core-position");
    const spokes: [DiagramNode, DiagramNode, DiagramNode, ...DiagramNode[]] = [
      node(base.diagramId, "offer"),
      node(base.diagramId, "content"),
      node(base.diagramId, "reputation"),
      node(base.diagramId, "context"),
    ];
    return {
      ...base,
      type: "hub-spoke",
      hub,
      spokes,
      edges: spokes.map((spoke) => edge(hub, spoke, "reinforces")),
      overlayLabelKeys: [hub.labelKey, ...spokes.map((item) => item.labelKey)],
    };
  }
  if (containsAny(normalized, ["chapter-to", "workflow", "lifecycle", "starter-checklist", "method"])) {
    const orderedNodes: [DiagramNode, DiagramNode, DiagramNode, ...DiagramNode[]] = [
      node(base.diagramId, "source"),
      node(base.diagramId, "development"),
      node(base.diagramId, "distribution"),
      node(base.diagramId, "recognition"),
    ];
    return {
      ...base,
      type: "sequence",
      orderedNodes,
      edges: orderedNodes.slice(1).map((item, index) =>
        edge(orderedNodes[index] ?? orderedNodes[0], item, "next"),
      ),
      overlayLabelKeys: orderedNodes.map((item) => item.labelKey),
    };
  }
  if (containsAny(normalized, ["category", "subniche", "boundaries"])) {
    const root = node(base.diagramId, "category");
    const children: [DiagramNode, DiagramNode, ...DiagramNode[]] = [
      node(base.diagramId, "segment-a"),
      node(base.diagramId, "segment-b"),
      node(base.diagramId, "segment-c"),
    ];
    return {
      ...base,
      type: "hierarchy",
      root,
      children,
      edges: children.map((child) => edge(root, child, "contains")),
      overlayLabelKeys: [root.labelKey, ...children.map((item) => item.labelKey)],
    };
  }
  if (containsAny(normalized, ["cause", "triggers", "problem-recognition", "confusion"])) {
    const causes: [DiagramNode, DiagramNode, ...DiagramNode[]] = [
      node(base.diagramId, "cause-a"),
      node(base.diagramId, "cause-b"),
      node(base.diagramId, "cause-c"),
    ];
    const effect = node(base.diagramId, "consequence");
    return {
      ...base,
      type: "cause-effect",
      causes,
      effect,
      edges: causes.map((cause) => edge(cause, effect, "causes")),
      overlayLabelKeys: [...causes.map((item) => item.labelKey), effect.labelKey],
    };
  }
  return null;
}

function isRecord(value: unknown): value is { readonly [key: string]: unknown } {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function arrayLength(record: { readonly [key: string]: unknown }, key: string): number {
  const value = record[key];
  return Array.isArray(value) ? value.length : 0;
}

function parsedNode(value: unknown): DiagramNode | null {
  if (
    !isRecord(value) ||
    typeof value["id"] !== "string" ||
    value["id"].length === 0 ||
    typeof value["semanticRole"] !== "string" ||
    value["semanticRole"].length === 0 ||
    typeof value["labelKey"] !== "string" ||
    value["labelKey"].length === 0
  ) {
    return null;
  }
  return { id: value["id"], semanticRole: value["semanticRole"], labelKey: value["labelKey"] };
}

function parsedNodes(record: { readonly [key: string]: unknown }, key: string): readonly DiagramNode[] {
  const value = record[key];
  if (!Array.isArray(value)) return [];
  return value.map(parsedNode).filter((item): item is DiagramNode => item !== null);
}

function parsedEdge(value: unknown): DiagramEdge | null {
  if (
    !isRecord(value) ||
    typeof value["from"] !== "string" ||
    typeof value["to"] !== "string" ||
    typeof value["semanticRole"] !== "string" ||
    value["semanticRole"].length === 0
  ) {
    return null;
  }
  return { from: value["from"], to: value["to"], semanticRole: value["semanticRole"] };
}

function parsedEdges(record: { readonly [key: string]: unknown }): readonly DiagramEdge[] {
  const value = record["edges"];
  if (!Array.isArray(value)) return [];
  return value.map(parsedEdge).filter((item): item is DiagramEdge => item !== null);
}

export function validateDiagramTopology(diagram: unknown): readonly string[] {
  if (!isRecord(diagram)) return ["unknown-diagram:malformed-topology"];
  const diagramId = typeof diagram["diagramId"] === "string" ? diagram["diagramId"] : "unknown-diagram";
  const failures: string[] = [];
  const fail = (condition: boolean, code: string): void => {
    if (condition) failures.push(`${diagramId}:${code}`);
  };
  fail(typeof diagram["proposition"] !== "string" || diagram["proposition"].length === 0, "proposition-invalid");
  fail(diagram["textFreeBackground"] !== true, "text-free-background-invalid");
  let topologyNodes: readonly DiagramNode[] = [];
  switch (diagram["type"]) {
    case "comparison": {
      const entities = parsedNodes(diagram, "entities");
      fail(arrayLength(diagram, "entities") < 2, "comparison-needs-two-entities");
      fail(entities.length !== arrayLength(diagram, "entities"), "comparison-node-invalid");
      topologyNodes = entities;
      break;
    }
    case "sequence": {
      const nodes = parsedNodes(diagram, "orderedNodes");
      const edges = parsedEdges(diagram);
      fail(arrayLength(diagram, "orderedNodes") < 3, "sequence-needs-three-nodes");
      fail(nodes.length !== arrayLength(diagram, "orderedNodes"), "sequence-node-invalid");
      fail(
        arrayLength(diagram, "edges") !== Math.max(0, arrayLength(diagram, "orderedNodes") - 1),
        "sequence-edge-chain-invalid",
      );
      fail(edges.length !== arrayLength(diagram, "edges"), "sequence-edge-invalid");
      fail(
        edges.some(
          (item, index) => item.from !== nodes[index]?.id || item.to !== nodes[index + 1]?.id,
        ),
        "sequence-edge-chain-invalid",
      );
      topologyNodes = nodes;
      break;
    }
    case "hierarchy": {
      const root = parsedNode(diagram["root"]);
      const children = parsedNodes(diagram, "children");
      const edges = parsedEdges(diagram);
      fail(root === null, "hierarchy-root-invalid");
      fail(arrayLength(diagram, "children") < 2, "hierarchy-needs-two-children");
      fail(children.length !== arrayLength(diagram, "children"), "hierarchy-child-invalid");
      fail(arrayLength(diagram, "edges") !== arrayLength(diagram, "children"), "hierarchy-parent-link-invalid");
      fail(edges.length !== arrayLength(diagram, "edges"), "hierarchy-edge-invalid");
      fail(
        root !== null &&
          edges.some(
            (item, index) => item.from !== root.id || item.to !== children[index]?.id,
          ),
        "hierarchy-parent-link-invalid",
      );
      topologyNodes = root ? [root, ...children] : children;
      break;
    }
    case "hub-spoke": {
      const hub = parsedNode(diagram["hub"]);
      const spokes = parsedNodes(diagram, "spokes");
      const edges = parsedEdges(diagram);
      fail(hub === null, "hub-spoke-hub-invalid");
      fail(arrayLength(diagram, "spokes") < 3, "hub-spoke-needs-three-spokes");
      fail(spokes.length !== arrayLength(diagram, "spokes"), "hub-spoke-node-invalid");
      fail(arrayLength(diagram, "edges") !== arrayLength(diagram, "spokes"), "hub-spoke-link-invalid");
      fail(edges.length !== arrayLength(diagram, "edges"), "hub-spoke-edge-invalid");
      fail(
        hub !== null &&
          edges.some((item, index) => item.from !== hub.id || item.to !== spokes[index]?.id),
        "hub-spoke-link-invalid",
      );
      topologyNodes = hub ? [hub, ...spokes] : spokes;
      break;
    }
    case "intersection": {
      const sets = parsedNodes(diagram, "sets");
      fail(arrayLength(diagram, "sets") < 2, "intersection-needs-two-sets");
      fail(sets.length !== arrayLength(diagram, "sets"), "intersection-node-invalid");
      fail(typeof diagram["intersectionMeaning"] !== "string", "intersection-meaning-invalid");
      topologyNodes = sets;
      break;
    }
    case "funnel": {
      const stages = parsedNodes(diagram, "stages");
      fail(arrayLength(diagram, "stages") < 3, "funnel-needs-three-stages");
      fail(stages.length !== arrayLength(diagram, "stages"), "funnel-node-invalid");
      fail(diagram["direction"] !== "broad-to-narrow", "funnel-direction-invalid");
      topologyNodes = stages;
      break;
    }
    case "matrix": {
      const cells = parsedNodes(diagram, "cells");
      fail(arrayLength(diagram, "cells") < 4, "matrix-needs-four-cells");
      fail(cells.length !== arrayLength(diagram, "cells"), "matrix-cell-invalid");
      const xAxis = diagram["xAxis"];
      const yAxis = diagram["yAxis"];
      fail(
        !isRecord(xAxis) ||
          !isRecord(yAxis) ||
          typeof xAxis["low"] !== "string" ||
          typeof xAxis["high"] !== "string" ||
          typeof yAxis["low"] !== "string" ||
          typeof yAxis["high"] !== "string",
        "matrix-axes-invalid",
      );
      topologyNodes = cells;
      break;
    }
    case "before-after": {
      const before = parsedNode(diagram["before"]);
      const transformation = parsedNode(diagram["transformation"]);
      const after = parsedNode(diagram["after"]);
      const edges = parsedEdges(diagram);
      fail(
        before === null || transformation === null || after === null,
        "before-after-state-invalid",
      );
      fail(arrayLength(diagram, "edges") < 2, "before-after-needs-transformation-path");
      fail(
        before !== null &&
          transformation !== null &&
          after !== null &&
          (edges[0]?.from !== before.id ||
            edges[0]?.to !== transformation.id ||
            edges[1]?.from !== transformation.id ||
            edges[1]?.to !== after.id),
        "before-after-edge-path-invalid",
      );
      topologyNodes = [before, transformation, after].filter(
        (item): item is DiagramNode => item !== null,
      );
      break;
    }
    case "cause-effect": {
      const causes = parsedNodes(diagram, "causes");
      const effect = parsedNode(diagram["effect"]);
      const edges = parsedEdges(diagram);
      fail(arrayLength(diagram, "causes") < 2, "cause-effect-needs-two-causes");
      fail(causes.length !== arrayLength(diagram, "causes"), "cause-effect-cause-invalid");
      fail(effect === null, "cause-effect-effect-invalid");
      fail(arrayLength(diagram, "edges") !== arrayLength(diagram, "causes"), "cause-effect-link-invalid");
      fail(edges.length !== arrayLength(diagram, "edges"), "cause-effect-edge-invalid");
      fail(
        effect !== null &&
          edges.some((item, index) => item.from !== causes[index]?.id || item.to !== effect.id),
        "cause-effect-link-invalid",
      );
      topologyNodes = effect ? [...causes, effect] : causes;
      break;
    }
    default:
      failures.push(`${diagramId}:unsupported-topology`);
  }
  const overlayLabelKeys = diagram["overlayLabelKeys"];
  fail(!Array.isArray(overlayLabelKeys), "overlay-label-keys-invalid");
  if (Array.isArray(overlayLabelKeys)) {
    const nodeKeys = new Set(overlayLabelKeys);
    fail(nodeKeys.size !== overlayLabelKeys.length, "duplicate-overlay-label-key");
    fail(
      topologyNodes.some((item) => !nodeKeys.has(item.labelKey)),
      "node-overlay-label-missing",
    );
  }
  fail(new Set(topologyNodes.map((item) => item.id)).size !== topologyNodes.length, "duplicate-node-id");
  return failures;
}

export function buildTreatment(input: {
  readonly sceneId: string;
  readonly concept: string;
  readonly stage: ProgressionStage;
  readonly ordinal: number;
  readonly continuity: ContinuityPlan;
  readonly openingProfile?: OpeningTreatmentProfile;
  readonly diagramSelectionContext?: DiagramSelectionContext;
}): PositioningVisualTreatment {
  const intent = deriveIntent(input.concept, input.stage);
  const strategy = input.openingProfile?.strategyFamily ??
    deriveStrategy({ concept: input.concept, intent, stage: input.stage, ordinal: input.ordinal });
  const diagram = input.openingProfile
    ? null
    : buildSemanticDiagram(input.sceneId, input.concept, input.diagramSelectionContext);
  const grammar = input.openingProfile
    ? {
        subject: input.openingProfile.subjectArchetype,
        environment: input.openingProfile.environmentArchetype,
        composition: input.openingProfile.compositionArchetype,
        camera: input.openingProfile.cameraArchetype,
        props: input.openingProfile.props,
        features: {
          strategy,
          subjectArchetype: input.openingProfile.subjectArchetype,
          environment: input.openingProfile.environmentArchetype,
          composition: input.openingProfile.compositionArchetype,
          camera: input.openingProfile.cameraArchetype,
          props: input.openingProfile.props,
          topology: "none" as const,
          semanticTokens: semanticTokens(input.concept),
          continuityIdentityId:
            input.continuity.mode === "persistent-protagonist"
              ? input.continuity.identityId
              : null,
        },
      }
    : grammarFor({
        strategy,
        concept: input.concept,
        ordinal: input.ordinal,
        continuity: input.continuity,
        topology: diagram?.type ?? "none",
      });
  const lighting = input.openingProfile?.lighting ?? lightingFor(strategy);
  const action = input.openingProfile?.actionArchetype ?? actionFor(intent);
  const motionOpportunities = input.openingProfile?.motionOpportunities ?? motionFor(strategy, diagram);
  const viewerVisibleFingerprint = createViewerVisibleHookFingerprint({
    strategyFamily: strategy,
    subjectArchetype: grammar.features.subjectArchetype,
    environmentArchetype: grammar.environment,
    compositionArchetype: grammar.composition,
    cameraArchetype: grammar.camera,
    lightingArchetype: lighting,
    actionArchetype: action,
    props: grammar.props,
    motionArchetype: input.openingProfile?.motionArchetype ?? motionOpportunities.join("-then-"),
  });
  const withoutHash = {
    treatmentId: `${input.sceneId}-treatment`.toLowerCase(),
    sceneId: input.sceneId,
    progressionStage: input.stage,
    narrativeBeat: input.concept,
    communicationIntent: intent,
    strategy,
    subjectRequirement: grammar.subject,
    environment: grammar.environment,
    composition: grammar.composition,
    camera: grammar.camera,
    lighting,
    action,
    props: grammar.props,
    motionOpportunities,
    diagram,
    grammar: grammar.features,
    viewerVisibleFingerprint,
  } as const;
  return { ...withoutHash, treatmentHash: stableHash(withoutHash) };
}

function lightingFor(strategy: VisualStrategy): string {
  if (strategy === "product-object-still-life") return "warm raking artifact light";
  if (strategy === "abstract-conceptual" || strategy === "semantic-diagram") {
    return "controlled graphic light with clear shape separation";
  }
  if (strategy === "market-crowd" || strategy === "social-interaction") {
    return "natural public-space practical light";
  }
  return "soft directional editorial daylight";
}

function actionFor(intent: CommunicationIntent): string {
  switch (intent) {
    case "create-tension":
      return "tension remains visibly unresolved";
    case "show-consequence":
      return "cause resolves into a visible consequence";
    case "compare-alternatives":
      return "two alternatives reveal a meaningful contrast";
    case "make-proof-visible":
      return "observable proof accumulates toward trust";
    case "explain-causality":
      return "multiple visible conditions produce one outcome";
    case "explain-process":
      return "physical stages advance in a meaningful order";
    case "define-category":
      return "a broad field resolves into a legible category";
    case "show-transformation":
      return "one visible state transitions into another";
    case "prompt-decision":
      return "a decision maker selects between visible options";
    case "deliver-payoff":
      return "the final visual state resolves the proposition";
  }
}

function motionFor(strategy: VisualStrategy, diagram: DiagramTopology | null) {
  if (diagram) return ["establishing-crop", "diagram-build", "highlighted-region", "punch-in"] as const;
  if (strategy === "comparison-composition") {
    return ["reveal", "split-composition", "alternate-crop", "punch-in"] as const;
  }
  if (strategy === "product-object-still-life" || strategy === "evidence-proof") {
    return ["establishing-crop", "prop-detail", "pan", "highlighted-region"] as const;
  }
  return ["establishing-crop", "slow-push", "subject-detail", "transition-state"] as const;
}

function duplicateRate(values: readonly string[], exemptions: ReadonlySet<number> = new Set()): number {
  if (values.length < 2) return 0;
  const seen = new Set<string>();
  let duplicates = 0;
  values.forEach((value, index) => {
    if (seen.has(value) && !exemptions.has(index)) duplicates += 1;
    seen.add(value);
  });
  return round(duplicates / values.length);
}

function setSimilarity(left: readonly string[], right: readonly string[]): number {
  const a = new Set(left);
  const b = new Set(right);
  const union = new Set([...a, ...b]);
  if (union.size === 0) return 0;
  return [...a].filter((item) => b.has(item)).length / union.size;
}

function normalizeVisibleArchetype(value: string): string {
  return value
    .toLowerCase()
    .replace(/\b(?:l\d{2}(?:-s\d{2})?|scene|treatment|content)[-_ ]?[a-z0-9-]*\b/gu, " ")
    .replace(/\b(?:evidence card|evidence artifact)(?: [a-z0-9-]+)?\b/gu, "evidence-object")
    .replace(/\b(?:variant|version|sample) [a-z0-9-]+\b/gu, " ")
    .replace(/\s+/gu, " ")
    .trim();
}

function dominantObjectArchetype(props: readonly string[]): string {
  const visible = props.find((prop) => !/^[a-z0-9-]+ evidence artifact$/iu.test(prop)) ??
    props[0] ??
    "no-dominant-object";
  return normalizeVisibleArchetype(visible);
}

export function createViewerVisibleHookFingerprint(input: {
  readonly strategyFamily: VisualStrategy;
  readonly subjectArchetype: string;
  readonly environmentArchetype: string;
  readonly compositionArchetype: string;
  readonly cameraArchetype: string;
  readonly lightingArchetype: string;
  readonly actionArchetype: string;
  readonly props: readonly string[];
  readonly motionArchetype: string;
}): ViewerVisibleHookFingerprint {
  return {
    strategyFamily: input.strategyFamily,
    subjectArchetype: normalizeVisibleArchetype(input.subjectArchetype),
    environmentArchetype: normalizeVisibleArchetype(input.environmentArchetype),
    compositionArchetype: normalizeVisibleArchetype(input.compositionArchetype),
    cameraArchetype: normalizeVisibleArchetype(input.cameraArchetype),
    lightingArchetype: normalizeVisibleArchetype(input.lightingArchetype),
    actionArchetype: normalizeVisibleArchetype(input.actionArchetype),
    dominantObjectArchetype: dominantObjectArchetype(input.props),
    motionArchetype: normalizeVisibleArchetype(input.motionArchetype),
  };
}

export function viewerVisibleHookSignature(fingerprint: ViewerVisibleHookFingerprint): string {
  return stableHash(fingerprint);
}

export function calculateOpeningDiversityDiagnostics(
  entries: readonly OpeningFingerprintEntry[],
): OpeningDiversityDiagnostics {
  const signatureGroups = new Map<string, string[]>();
  const strategyDistribution: Partial<Record<VisualStrategy, number>> = {};
  const cameraCompositionCounts = new Map<string, number>();
  for (const entry of entries) {
    signatureGroups.set(entry.signature, [
      ...(signatureGroups.get(entry.signature) ?? []),
      entry.contentId,
    ]);
    strategyDistribution[entry.fingerprint.strategyFamily] =
      (strategyDistribution[entry.fingerprint.strategyFamily] ?? 0) + 1;
    const cameraComposition = `${entry.fingerprint.cameraArchetype} | ${entry.fingerprint.compositionArchetype}`;
    cameraCompositionCounts.set(
      cameraComposition,
      (cameraCompositionCounts.get(cameraComposition) ?? 0) + 1,
    );
  }
  const exactDuplicateGroups = [...signatureGroups.entries()]
    .filter(([, contentIds]) => contentIds.length > 1)
    .map(([signature, contentIds]) => ({ signature, contentIds: [...contentIds].sort() }))
    .sort((left, right) => left.signature.localeCompare(right.signature));
  const duplicateCount = [...signatureGroups.values()].reduce(
    (sum, contentIds) => sum + Math.max(0, contentIds.length - 1),
    0,
  );
  const parentIds = [...new Set(entries.map((entry) => entry.parentLongFormId))].sort();
  const clusters = parentIds.map((parentLongFormId) => {
    const clusterEntries = entries.filter((entry) => entry.parentLongFormId === parentLongFormId);
    const clusterSignatures = clusterEntries.map((entry) => entry.signature);
    const cameraComposition = clusterEntries.map(
      (entry) => `${entry.fingerprint.cameraArchetype}|${entry.fingerprint.compositionArchetype}`,
    );
    const strategyCounts = new Map<VisualStrategy, number>();
    clusterEntries.forEach((entry) =>
      strategyCounts.set(
        entry.fingerprint.strategyFamily,
        (strategyCounts.get(entry.fingerprint.strategyFamily) ?? 0) + 1,
      ),
    );
    const failures: string[] = [];
    const exactDuplicateCount = clusterSignatures.length - new Set(clusterSignatures).size;
    const materiallyDifferentGrammarCount = new Set(clusterSignatures).size;
    const strategyConcentration = round(
      Math.max(0, ...strategyCounts.values()) / Math.max(1, clusterEntries.length),
    );
    const maxCameraCompositionFrequency = Math.max(
      0,
      ...[...new Set(cameraComposition)].map(
        (value) => cameraComposition.filter((candidate) => candidate === value).length,
      ),
    );
    if (exactDuplicateCount > 0) failures.push("exact-opening-signature-duplicate");
    if (materiallyDifferentGrammarCount < 3) failures.push("fewer-than-three-material-grammars");
    if (strategyConcentration === 1) failures.push("single-strategy-cluster");
    if (maxCameraCompositionFrequency > 2) failures.push("camera-composition-repeated-more-than-twice");
    return {
      parentLongFormId,
      contentIds: clusterEntries.map((entry) => entry.contentId).sort(),
      exactDuplicateCount,
      materiallyDifferentGrammarCount,
      strategyConcentration,
      maxCameraCompositionFrequency,
      status: failures.length === 0 ? ("pass" as const) : ("fail" as const),
      failures,
    };
  });
  const exactDuplicateRate = round(duplicateCount / Math.max(1, entries.length));
  const maxExactSignatureFrequency = Math.max(0, ...[...signatureGroups.values()].map((group) => group.length));
  const failures: string[] = [];
  if (entries.length !== 24) failures.push(`opening-count:${entries.length}`);
  if (exactDuplicateRate > 0.15) failures.push(`exact-hook-duplicate-rate:${exactDuplicateRate}`);
  if (maxExactSignatureFrequency > 2) {
    failures.push(`max-hook-signature-frequency:${maxExactSignatureFrequency}`);
  }
  if (clusters.some((cluster) => cluster.status === "fail")) failures.push("cluster-opening-diversity");
  return {
    entries: [...entries].sort((left, right) => left.contentId.localeCompare(right.contentId)),
    exactDuplicateGroups,
    exactDuplicateRate,
    maxExactSignatureFrequency,
    primaryStrategyDistribution: strategyDistribution,
    cameraCompositionDistribution: [...cameraCompositionCounts.entries()]
      .map(([cameraComposition, count]) => ({ cameraComposition, count }))
      .sort((left, right) => right.count - left.count || left.cameraComposition.localeCompare(right.cameraComposition)),
    clusters,
    status: failures.length === 0 ? "pass" : "fail",
    failures,
  };
}

export function viewerVisibleFingerprintSimilarity(
  left: ViewerVisibleHookFingerprint,
  right: ViewerVisibleHookFingerprint,
): number {
  const fields: readonly (keyof ViewerVisibleHookFingerprint)[] = [
    "strategyFamily",
    "subjectArchetype",
    "environmentArchetype",
    "compositionArchetype",
    "cameraArchetype",
    "lightingArchetype",
    "actionArchetype",
    "dominantObjectArchetype",
    "motionArchetype",
  ];
  return round(fields.filter((field) => left[field] === right[field]).length / fields.length);
}

export function visualGrammarSimilarity(
  left: VisualGrammarFeatures,
  right: VisualGrammarFeatures,
): number {
  const categorical = [
    left.strategy === right.strategy,
    left.subjectArchetype === right.subjectArchetype,
    left.environment === right.environment,
    left.composition === right.composition,
    left.camera === right.camera,
    left.topology === right.topology,
  ].filter(Boolean).length;
  const structural = categorical / 6;
  const props = setSimilarity(
    [dominantObjectArchetype(left.props)],
    [dominantObjectArchetype(right.props)],
  );
  return round(structural * 0.85 + props * 0.15);
}

function grammarKey(features: VisualGrammarFeatures): string {
  return canonicalJson({
    strategy: features.strategy,
    subject: features.subjectArchetype,
    environment: features.environment,
    composition: features.composition,
    camera: features.camera,
    dominantObject: dominantObjectArchetype(features.props),
    topology: features.topology,
  });
}

function round(value: number): number {
  return Math.round(value * 10_000) / 10_000;
}

export const DIVERSITY_THRESHOLDS = {
  visualGrammarDuplicateRate: 0.25,
  subjectArchetypeDuplicateRate: 0.45,
  environmentDuplicateRate: 0.55,
  compositionDuplicateRate: 0.55,
  cameraDuplicateRate: 0.55,
  propDuplicateRate: 0.55,
  diagramTopologyDuplicateRate: 0.75,
  consecutiveSceneSimilarity: 0.72,
  hookVsScene1Similarity: 0.65,
} as const;

export function calculateDiversityMetrics(input: {
  readonly sceneIds: readonly string[];
  readonly features: readonly VisualGrammarFeatures[];
  readonly stages: readonly ProgressionStage[];
  readonly continuity: ContinuityPlan;
}): DiversityMetrics {
  const subjectExemptions = new Set<number>();
  if (input.continuity.mode === "persistent-protagonist") {
    const identityId = input.continuity.identityId;
    input.features.forEach((feature, index) => {
      if (feature.continuityIdentityId === identityId) subjectExemptions.add(index);
    });
  }
  const topologyValues = input.features
    .map((feature) => feature.topology)
    .filter((value) => value !== "none");
  const similarities = input.features.slice(1).map((feature, index) => ({
    pair: `${input.sceneIds[index] ?? "unknown"}->${input.sceneIds[index + 1] ?? "unknown"}`,
    value: visualGrammarSimilarity(input.features[index] ?? feature, feature),
  }));
  const hookIndex = input.stages.indexOf("HOOK");
  const firstNormalIndex = hookIndex >= 0 ? hookIndex + 1 : -1;
  const hookVsScene1Similarity =
    hookIndex >= 0 && firstNormalIndex < input.features.length
      ? visualGrammarSimilarity(
          input.features[hookIndex] ?? input.features[0]!,
          input.features[firstNormalIndex] ?? input.features[0]!,
        )
      : null;
  const values = {
    visualGrammarDuplicateRate: duplicateRate(input.features.map(grammarKey)),
    subjectArchetypeDuplicateRate: duplicateRate(
      input.features.map((item) => item.subjectArchetype),
      subjectExemptions,
    ),
    environmentDuplicateRate: duplicateRate(input.features.map((item) => item.environment)),
    compositionDuplicateRate: duplicateRate(input.features.map((item) => item.composition)),
    cameraDuplicateRate: duplicateRate(input.features.map((item) => item.camera)),
    propDuplicateRate: duplicateRate(input.features.map((item) => canonicalJson([...item.props].sort()))),
    diagramTopologyDuplicateRate: duplicateRate(topologyValues),
  };
  const mean = similarities.length
    ? round(similarities.reduce((sum, item) => sum + item.value, 0) / similarities.length)
    : 0;
  const maximum = similarities.length ? Math.max(...similarities.map((item) => item.value)) : 0;
  const failures: string[] = [];
  for (const key of Object.keys(values) as (keyof typeof values)[]) {
    if (values[key] > DIVERSITY_THRESHOLDS[key]) failures.push(`${key}:${values[key]}`);
  }
  const violatingPairs = similarities
    .filter((item) => item.value > DIVERSITY_THRESHOLDS.consecutiveSceneSimilarity)
    .map((item) => item.pair);
  if (violatingPairs.length > 0) failures.push(`consecutive-scene-similarity:${violatingPairs.join(",")}`);
  if (
    hookVsScene1Similarity !== null &&
    hookVsScene1Similarity > DIVERSITY_THRESHOLDS.hookVsScene1Similarity
  ) {
    failures.push(`hook-vs-scene1-similarity:${hookVsScene1Similarity}`);
  }
  return {
    ...values,
    consecutiveSceneSimilarity: { mean, maximum: round(maximum), violatingPairs },
    hookVsScene1Similarity,
    status: failures.length === 0 ? "pass" : "fail",
    failures,
  };
}
