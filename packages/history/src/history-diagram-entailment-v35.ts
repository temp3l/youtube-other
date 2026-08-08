import type { HistoryClaimV34, HistoryDiagramStateV34, HistoryEntityMentionV34 } from "./history-v34-contracts.js";
import { isClaimGroundedDiagramLabelV35 } from "./history-diagram-compile-v35.js";

const LABEL_STOP_WORDS = new Set([
  "and",
  "from",
  "the",
  "versus",
  "into",
  "with",
  "of",
  "in",
  "on",
  "at",
  "to",
]);

const DISTINCTIVE_LABEL_TOKENS: Readonly<Record<string, readonly RegExp[]>> = {
  "military fragmentation": [/\bfragmentation\b/iu, /\bfragmented\b/iu],
  "command coordination": [/\bcoordination\b/iu],
  "decision options": [/\boptions?\b/iu],
  "political instability": [/\b(?:political instability|instability)\b/iu],
};

const COMPOUND_THEMATIC_LABEL_STEMS: Readonly<Record<string, readonly string[]>> = {
  "drought pressure": ["drought"],
  "harvest stress": ["harvest"],
  "migration pressure": ["migration"],
  "trade disruption": ["trade"],
  "palace administrative failure": ["palace", "administrat"],
  "systems collapse": ["collapse", "systems"],
  "supply-chain failure": ["supply", "logistics", "supplies"],
  "population loss": ["population", "mortality", "depopulation"],
  "labour scarcity": ["labou?r", "worker"],
  "tax and revenue strain": ["tax", "revenue"],
  "distance and supply-chain failure": ["distance", "suppl"],
  "disease and hunger": ["disease", "hunger"],
  "cold and attrition": ["cold", "attrition"],
  "fodder and horse losses": ["fodder", "horse"],
  "different return routes": ["return", "routes"],
  "variation in army-size estimates": ["army", "estimates", "vary"],
};

const CAUSAL_EDGE_RELATIONSHIPS = new Set([
  "causes",
  "leads-to",
  "contributes-to",
  "depends-on",
]);

const CONVERGENCE_EVIDENCE_PATTERN =
  /\b(?:combining|combined(?: with)?|together with|along with|as well as|both .+ and|contribut(?:e|ed|ing) to|converge|interact(?:ed|ing)? with)\b/iu;
const DEPENDENCY_EVIDENCE_PATTERN =
  /\b(?:depend(?:ed|s|ing)? on|relied on|required|needed|supported by|unless)\b/iu;

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");
}

function normalizeLabel(label: string): string {
  return label.replace(/\s+/gu, " ").trim().toLocaleLowerCase();
}

function contentTokens(label: string): string[] {
  return normalizeLabel(label)
    .split(/\s+/)
    .filter((token) => token.length > 2 && !LABEL_STOP_WORDS.has(token));
}

function labelAppearsAsPhrase(label: string, text: string): boolean {
  const normalized = normalizeLabel(label);
  if (!normalized) return false;
  return new RegExp(`\\b${escapeRegExp(normalized).replace(/\s+/gu, "\\s+")}\\b`, "iu").test(
    normalizeLabel(text)
  );
}

export function collectResolvedEntitySpansForClaimsV35(input: {
  readonly entities: readonly HistoryEntityMentionV34[];
  readonly claimIds: readonly string[];
}): readonly string[] {
  return [
    ...new Set(
      input.entities
        .filter((entity) => input.claimIds.includes(entity.claimId))
        .map((entity) => entity.normalizedLabel.trim())
        .filter(Boolean)
    ),
  ];
}

export function isProperNameFragmentNodeV35(input: {
  readonly label: string;
  readonly entitySpans: readonly string[];
  readonly evidenceClaimText: string;
}): boolean {
  const normalizedLabel = normalizeLabel(input.label);
  if (!normalizedLabel || normalizedLabel.split(/\s+/).length !== 1) return false;

  for (const span of input.entitySpans) {
    const spanTokens = normalizeLabel(span).split(/\s+/).filter(Boolean);
    if (spanTokens.length < 2) continue;
    if (!spanTokens.includes(normalizedLabel)) continue;
    if (normalizeLabel(span) === normalizedLabel) return false;

    const spanPattern = new RegExp(`\\b${escapeRegExp(span).replace(/\s+/gu, "\\s+")}\\b`, "giu");
    const textWithoutSpans = input.evidenceClaimText.replace(spanPattern, " ");
    if (!new RegExp(`\\b${escapeRegExp(normalizedLabel)}\\b`, "iu").test(textWithoutSpans))
      return true;
  }
  return false;
}

function tokenAppearsInText(token: string, text: string): boolean {
  const variants = [token, token.replace(/-/gu, " "), token.replace(/-/gu, "")];
  return variants.some((variant) => {
    const normalized = variant.trim();
    if (!normalized) return false;
    return new RegExp(`\\b${escapeRegExp(normalized).replace(/\s+/gu, "\\s+")}\\b`, "iu").test(text);
  });
}

function partGroundedInText(part: string, evidenceClaimText: string): boolean {
  if (labelAppearsAsPhrase(part, evidenceClaimText)) return true;
  const lowered = part.toLocaleLowerCase();
  if (lowered.includes("supply") && /\bsuppl\w*/iu.test(evidenceClaimText)) return true;
  if (lowered.includes("attrition") && /\battrition\b/iu.test(evidenceClaimText)) return true;
  if (lowered.includes("hunger") && /\bhunger\b/iu.test(evidenceClaimText)) return true;
  const tokens = contentTokens(part.replace(/-/gu, " "));
  if (!tokens.length) return false;
  return tokens.some((token) => tokenAppearsInText(token, evidenceClaimText));
}

function isFactorBundleLabelEntailedV35(label: string, evidenceClaimText: string): boolean {
  const parts = label.split(/\s+and\s+/iu).map((part) => part.trim()).filter(Boolean);
  if (parts.length < 2) return false;
  return parts.every((part) => partGroundedInText(part, evidenceClaimText));
}

export function isStrictDiagramLabelEntailedV35(label: string, evidenceClaimText: string): boolean {
  if (labelAppearsAsPhrase(label, evidenceClaimText)) return true;
  if (isFactorBundleLabelEntailedV35(label, evidenceClaimText)) return true;

  const compoundStems = COMPOUND_THEMATIC_LABEL_STEMS[normalizeLabel(label)];
  if (
    compoundStems?.some((stem) => new RegExp(`\\b${stem}\\b`, "iu").test(evidenceClaimText))
  ) {
    return true;
  }

  const distinctive = DISTINCTIVE_LABEL_TOKENS[normalizeLabel(label)];
  if (distinctive?.length) return distinctive.every((pattern) => pattern.test(evidenceClaimText));

  const tokens = contentTokens(label.replace(/-/gu, " "));
  if (!tokens.length) return false;
  if (tokens.length === 1) {
    return tokenAppearsInText(tokens[0]!, evidenceClaimText);
  }
  return (
    tokens.every((token) => tokenAppearsInText(token, evidenceClaimText)) &&
    isClaimGroundedDiagramLabelV35(label, evidenceClaimText)
  );
}

export function isDiagramNodeSemanticallyEntailedV35(input: {
  readonly label: string;
  readonly evidenceClaimText: string;
  readonly entitySpans: readonly string[];
}): boolean {
  if (isProperNameFragmentNodeV35(input)) return false;
  if (input.entitySpans.some((span) => normalizeLabel(span) === normalizeLabel(input.label)))
    return true;
  return isStrictDiagramLabelEntailedV35(input.label, input.evidenceClaimText);
}

export function hasPairwiseRelationshipEvidenceV35(input: {
  readonly evidenceClaimText: string;
  readonly fromLabel: string;
  readonly toLabel: string;
  readonly relationship: HistoryDiagramStateV34["edges"][number]["relationship"];
}): boolean {
  const escapedFrom = escapeRegExp(input.fromLabel).replace(/\s+/gu, "\\s+");
  const escapedTo = escapeRegExp(input.toLabel).replace(/\s+/gu, "\\s+");

  if (input.relationship === "sequence") {
    return new RegExp(
      `${escapedFrom}.{0,120}(?:then|followed by|before|after|subsequently|in turn|next|funded|defended|helped|which|therefore|to preserve|to continue|in order to|chose to).{0,120}${escapedTo}|${escapedTo}.{0,120}(?:after|following).{0,120}${escapedFrom}`,
      "iu"
    ).test(input.evidenceClaimText);
  }

  if (CAUSAL_EDGE_RELATIONSHIPS.has(input.relationship)) {
    return new RegExp(
      `${escapedFrom}.{0,160}(?:because|led to|caused|resulted in|therefore|triggered|forced|compelled|enabled|produced|brought).{0,160}${escapedTo}|${escapedTo}.{0,80}(?:because of|due to|from).{0,80}${escapedFrom}`,
      "iu"
    ).test(input.evidenceClaimText);
  }

  return false;
}

export function validateDiagramNodeEntailmentV35(input: {
  readonly state: Pick<HistoryDiagramStateV34, "nodes" | "diagramType">;
  readonly evidenceClaimText: string;
  readonly entitySpans: readonly string[];
}): readonly string[] {
  const blockers: string[] = [];
  for (const node of input.state.nodes) {
    if (
      !isDiagramNodeSemanticallyEntailedV35({
        label: node.label,
        evidenceClaimText: input.evidenceClaimText,
        entitySpans: input.entitySpans,
      })
    ) {
      blockers.push("DIAGRAM_UNGROUNDED_NODE");
      if (
        isProperNameFragmentNodeV35({
          label: node.label,
          entitySpans: input.entitySpans,
          evidenceClaimText: input.evidenceClaimText,
        })
      ) {
        blockers.push("DIAGRAM_PROPER_NAME_FRAGMENTATION");
      }
    }
  }
  return [...new Set(blockers)];
}

export function validateDiagramEdgeEntailmentV35(input: {
  readonly state: Pick<HistoryDiagramStateV34, "nodes" | "edges" | "diagramType">;
  readonly evidenceClaimText: string;
  readonly entitySpans?: readonly string[];
}): readonly string[] {
  if (input.state.diagramType === "evidence-set") return [];
  const nodeById = new Map(input.state.nodes.map((node) => [node.id, node] as const));
  const blockers: string[] = [];
  for (const edge of input.state.edges) {
    const from = nodeById.get(edge.fromNodeId);
    const to = nodeById.get(edge.toNodeId);
    if (!from || !to) {
      blockers.push("DIAGRAM_UNSUPPORTED_EDGE");
      continue;
    }
    const nodesEntailed =
      isDiagramNodeSemanticallyEntailedV35({
        label: from.label,
        evidenceClaimText: input.evidenceClaimText,
        entitySpans: input.entitySpans ?? [],
      }) &&
      isDiagramNodeSemanticallyEntailedV35({
        label: to.label,
        evidenceClaimText: input.evidenceClaimText,
        entitySpans: input.entitySpans ?? [],
      });
    if (
      edge.relationship === "contributes-to" &&
      CONVERGENCE_EVIDENCE_PATTERN.test(input.evidenceClaimText) &&
      nodesEntailed
    ) {
      continue;
    }
    if (
      edge.relationship === "depends-on" &&
      DEPENDENCY_EVIDENCE_PATTERN.test(input.evidenceClaimText) &&
      nodesEntailed
    ) {
      continue;
    }
    if (
      edge.relationship === "contributes-to" &&
      input.state.diagramType === "process" &&
      /\b(?:reinforcements|detached|desertion|army[- ]size|estimates|return routes?|because|vary|included)\b/iu.test(
        input.evidenceClaimText
      ) &&
      nodesEntailed
    ) {
      continue;
    }
    if (
      !hasPairwiseRelationshipEvidenceV35({
        evidenceClaimText: input.evidenceClaimText,
        fromLabel: from.label,
        toLabel: to.label,
        relationship: edge.relationship,
      })
    ) {
      blockers.push(
        edge.relationship === "sequence"
          ? "DIAGRAM_UNSUPPORTED_CAUSAL_SEQUENCE"
          : "DIAGRAM_UNSUPPORTED_EDGE"
      );
    }
  }
  return [...new Set(blockers)];
}

export function validateDiagramQuestionEntailmentV35(input: {
  readonly state: Pick<HistoryDiagramStateV34, "exactQuestion" | "diagramType" | "nodes" | "edges">;
  readonly evidenceClaimText: string;
}): readonly string[] {
  const question = input.state.exactQuestion.trim();
  if (!question) return [];
  if (input.state.diagramType === "evidence-set") {
    if (
      /\bwhy did\b/iu.test(question) &&
      input.state.nodes.length >= 2 &&
      /\b(?:destroy|destruction|army|campaign|attrition|suppl|disease|hunger|cold|desertion|logistics|distance)\b/iu.test(
        input.evidenceClaimText
      )
    ) {
      return [];
    }
    return /\b(?:evidence|category|categories)\b/iu.test(question) ||
      /\b(?:found|evidence|record|testimony|discovered)\b/iu.test(input.evidenceClaimText)
      ? []
      : ["DIAGRAM_UNGROUNDED_QUESTION"];
  }
  const abstractSupportQuestion =
    /^what causal or systemic relationships does the narration support\?/iu.test(question);
  if (
    abstractSupportQuestion &&
    (CONVERGENCE_EVIDENCE_PATTERN.test(input.evidenceClaimText) ||
      /\b(?:combining|combined|interconnected|dependencies?|mechanism|systems?)\b/iu.test(
        input.evidenceClaimText
      ))
  ) {
    return input.state.nodes.length >= 2 && input.state.edges.length === 0
      ? ["DIAGRAM_UNGROUNDED_QUESTION"]
      : [];
  }
  const causalQuestion =
    /\b(?:what caused|why did|how did .+ lead|what led to|what explains)\b/iu.test(question);
  if (
    causalQuestion &&
    !/\b(?:because|led to|caused|resulted|therefore|triggered|forced|compelled)\b/iu.test(
      input.evidenceClaimText
    )
  ) {
    return ["DIAGRAM_UNGROUNDED_QUESTION"];
  }
  if (input.state.nodes.length >= 2 && input.state.edges.length === 0) {
    return ["DIAGRAM_UNGROUNDED_QUESTION"];
  }
  return [];
}

export function filterAtomicDiagramEntityLabelsV35(input: {
  readonly labels: readonly string[];
  readonly entitySpans: readonly string[];
  readonly evidenceClaimText: string;
}): string[] {
  return input.labels.filter(
    (label) =>
      !isProperNameFragmentNodeV35({
        label,
        entitySpans: input.entitySpans,
        evidenceClaimText: input.evidenceClaimText,
      })
  );
}

export function validateDiagramEntailmentV35(input: {
  readonly state: HistoryDiagramStateV34;
  readonly evidenceClaimText: string;
  readonly claims: readonly HistoryClaimV34[];
  readonly entities?: readonly HistoryEntityMentionV34[];
}): readonly string[] {
  const evidenceClaimIds = input.state.evidenceClaimIds?.length
    ? input.state.evidenceClaimIds
    : [...new Set(input.state.nodes.flatMap((node) => node.linkedClaimIds))];
  const entitySpans =
    input.entities?.length
      ? collectResolvedEntitySpansForClaimsV35({
          entities: input.entities,
          claimIds: evidenceClaimIds,
        })
      : [];

  return [
    ...new Set([
      ...validateDiagramNodeEntailmentV35({
        state: input.state,
        evidenceClaimText: input.evidenceClaimText,
        entitySpans,
      }),
      ...validateDiagramEdgeEntailmentV35({
        state: input.state,
        evidenceClaimText: input.evidenceClaimText,
        entitySpans,
      }),
      ...validateDiagramQuestionEntailmentV35({
        state: input.state,
        evidenceClaimText: input.evidenceClaimText,
      }),
    ]),
  ];
}
