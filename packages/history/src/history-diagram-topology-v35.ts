import type { HistoryDiagramStateV34 } from "./history-v34-contracts.js";
import { computeDiagramRegistrySignatureV35, computeDiagramRenderSignatureV35 } from "./history-effective-change-v35.js";

export type HistoryDiagramTopologyV35 =
  | "sequence"
  | "convergence"
  | "parallel-contributors"
  | "dependency"
  | "divergence"
  | "comparison"
  | "feedback-system";

type DiagramEdgeRelationship = HistoryDiagramStateV34["edges"][number]["relationship"];

export type DiagramNodeDraft = {
  readonly id: string;
  readonly label: string;
  readonly linkedClaimIds: readonly string[];
  readonly entityMentionIds: readonly string[];
  readonly role: "contributor" | "outcome" | "product" | "intermediate" | "neutral";
};

const SEQUENCE_MARKERS =
  /\b(?:then|next|afterwards?|followed by|in turn|subsequently|before returning)\b/iu;
const CONVERGENCE_MARKERS =
  /\b(?:combined(?: with)?|together with|along with|as well as|both .+ and|contribut(?:e|ed|ing) to|converge|interact(?:ed|ing)? with)\b/iu;
const DEPENDENCY_MARKERS =
  /\b(?:depend(?:ed|s|ing)? on|relied on|required|needed|supported by|unless)\b/iu;
const DIVERGENCE_MARKERS = /\b(?:led to several|multiple (?:effects|outcomes)|in turn produced)\b/iu;
const OUTCOME_LABEL_PATTERN =
  /\b(?:collapse|systems? collapse|bronze age collapse|writing loss|social and economic disruption)\b/iu;
const PRODUCT_LABEL_PATTERN = /\b(?:bronze production|palace trade)\b/iu;
const INPUT_RESOURCE_PATTERN = /\b(?:copper|tin|from Cyprus|from distant)\b/iu;

function normalizeLabel(label: string): string {
  return label.replace(/\s+/gu, " ").trim().toLocaleLowerCase();
}

export function classifyDiagramNodeRoleV35(label: string): DiagramNodeDraft["role"] {
  const normalized = normalizeLabel(label);
  if (PRODUCT_LABEL_PATTERN.test(normalized)) return "product";
  if (OUTCOME_LABEL_PATTERN.test(normalized)) return "outcome";
  if (INPUT_RESOURCE_PATTERN.test(normalized)) return "contributor";
  if (/\b(?:pressure|disruption|fragmentation|failure|scarcity|loss|drought|earthquake|trade)\b/iu.test(normalized))
    return "contributor";
  return "neutral";
}

export function inferDiagramTopologyV35(input: {
  readonly labels: readonly string[];
  readonly text: string;
}): HistoryDiagramTopologyV35 {
  const roles = input.labels.map((label) => classifyDiagramNodeRoleV35(label));
  const contributorCount = roles.filter((role) => role === "contributor").length;
  const outcomeCount = roles.filter((role) => role === "outcome").length;
  const productCount = roles.filter((role) => role === "product").length;

  if (
    contributorCount >= 2 &&
    (productCount >= 1 || outcomeCount >= 1) &&
    (CONVERGENCE_MARKERS.test(input.text) || INPUT_RESOURCE_PATTERN.test(input.text))
  )
    return "parallel-contributors";

  if (contributorCount >= 2 && outcomeCount >= 1 && !SEQUENCE_MARKERS.test(input.text))
    return "convergence";

  if (contributorCount >= 3 && outcomeCount >= 1 && /\b(?:interact|interconnected|combined|unless)\b/iu.test(input.text))
    return "feedback-system";

  if (SEQUENCE_MARKERS.test(input.text) && contributorCount <= 1 && outcomeCount <= 1)
    return "sequence";

  if (contributorCount >= 2 && outcomeCount === 0 && productCount === 0) {
    if (/\b(?:combined|together|interact|converge).*\bcollapse\b/iu.test(input.text))
      return "convergence";
    return "comparison";
  }

  if (DEPENDENCY_MARKERS.test(input.text)) return "dependency";

  if (DIVERGENCE_MARKERS.test(input.text)) return "divergence";

  if (contributorCount >= 2 && (outcomeCount >= 1 || productCount >= 1)) return "convergence";

  return "comparison";
}

function edgeRelationshipForTopology(
  topology: HistoryDiagramTopologyV35,
  fromRole: DiagramNodeDraft["role"],
  toRole: DiagramNodeDraft["role"]
): DiagramEdgeRelationship {
  if (topology === "sequence") return "sequence";
  if (fromRole === "contributor" && (toRole === "product" || toRole === "outcome"))
    return "contributes-to";
  if (topology === "dependency") return "depends-on";
  if (topology === "divergence") return "leads-to";
  return "contributes-to";
}

function hasSequenceEvidence(text: string, fromLabel: string, toLabel: string): boolean {
  const escapedFrom = fromLabel.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");
  const escapedTo = toLabel.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");
  return new RegExp(
    `${escapedFrom}.{0,80}(?:then|followed by|led to|resulted in|in turn).{0,80}${escapedTo}`,
    "iu"
  ).test(text);
}

export function buildDiagramEdgesV35(input: {
  readonly beatNumber: string;
  readonly claimIds: readonly string[];
  readonly text: string;
  readonly nodes: readonly DiagramNodeDraft[];
  readonly topology: HistoryDiagramTopologyV35;
}): HistoryDiagramStateV34["edges"] {
  const { nodes, topology, text } = input;
  if (nodes.length < 2) return [];

  const contributors = nodes.filter((node) => node.role === "contributor");
  const products = nodes.filter((node) => node.role === "product");
  const outcomes = nodes.filter((node) => node.role === "outcome");
  const sink = products[0] ?? outcomes[0] ?? nodes.at(-1)!;
  const edges: Array<HistoryDiagramStateV34["edges"][number]> = [];
  let edgeIndex = 0;

  const pushEdge = (
    from: DiagramNodeDraft,
    to: DiagramNodeDraft,
    relationship: DiagramEdgeRelationship
  ) => {
    if (from.id === to.id) return;
    if (edges.some((edge) => edge.fromNodeId === from.id && edge.toNodeId === to.id)) return;
    edgeIndex += 1;
    edges.push({
      id: `edge-${input.beatNumber}-${edgeIndex}`,
      fromNodeId: from.id,
      toNodeId: to.id,
      relationship,
      linkedClaimIds: input.claimIds,
    });
  };

  if (topology === "parallel-contributors" || topology === "convergence" || topology === "feedback-system") {
    for (const contributor of contributors.length ? contributors : nodes.slice(0, -1)) {
      if (contributor.id !== sink.id) {
        pushEdge(
          contributor,
          sink,
          edgeRelationshipForTopology(topology, contributor.role, sink.role)
        );
      }
    }
    if (products.length && outcomes.length) {
      pushEdge(products[0]!, outcomes[0]!, "leads-to");
    }
    return edges;
  }

  if (topology === "sequence") {
    for (let index = 0; index < nodes.length - 1; index += 1) {
      const from = nodes[index]!;
      const to = nodes[index + 1]!;
      if (!hasSequenceEvidence(text, from.label, to.label)) continue;
      pushEdge(from, to, "sequence");
    }
    return edges;
  }

  if (topology === "dependency") {
    for (const contributor of contributors) {
      pushEdge(contributor, sink, "depends-on");
    }
    return edges;
  }

  if (topology === "divergence" && nodes[0]) {
    for (const target of nodes.slice(1)) pushEdge(nodes[0]!, target, "leads-to");
    return edges;
  }

  return edges;
}

export function validateDiagramTopologyV35(input: {
  readonly state: Pick<HistoryDiagramStateV34, "nodes" | "edges" | "diagramType">;
  readonly linkedClaimText: string;
  readonly topology?: HistoryDiagramTopologyV35;
}): readonly string[] {
  const blockers: string[] = [];
  const nodeById = new Map(input.state.nodes.map((node) => [node.id, node] as const));
  const roles = new Map(
    input.state.nodes.map((node) => [node.id, classifyDiagramNodeRoleV35(node.label)] as const)
  );

  for (const edge of input.state.edges) {
    const from = nodeById.get(edge.fromNodeId);
    const to = nodeById.get(edge.toNodeId);
    if (!from || !to) {
      blockers.push("DIAGRAM_UNSUPPORTED_EDGE");
      continue;
    }
    const fromRole = roles.get(from.id) ?? "neutral";
    const toRole = roles.get(to.id) ?? "neutral";

    if (edge.relationship === "sequence" && !hasSequenceEvidence(input.linkedClaimText, from.label, to.label)) {
      blockers.push("DIAGRAM_UNSUPPORTED_CAUSAL_SEQUENCE");
    }

    if (
      fromRole === "outcome" &&
      toRole === "contributor" &&
      ["sequence", "leads-to", "causes", "contributes-to"].includes(edge.relationship)
    ) {
      blockers.push("DIAGRAM_CAUSAL_DIRECTION_CONFLICT");
    }

    if (
      fromRole === "contributor" &&
      toRole === "contributor" &&
      edge.relationship === "sequence" &&
      INPUT_RESOURCE_PATTERN.test(normalizeLabel(from.label)) &&
      INPUT_RESOURCE_PATTERN.test(normalizeLabel(to.label))
    ) {
      blockers.push("DIAGRAM_UNSUPPORTED_CAUSAL_SEQUENCE");
    }
  }

  if (
    input.state.diagramType !== "evidence-set" &&
    input.state.nodes.length >= 3 &&
    input.state.edges.length >= input.state.nodes.length - 1 &&
    input.state.edges.every((edge) => edge.relationship === "sequence") &&
    !SEQUENCE_MARKERS.test(input.linkedClaimText)
  ) {
    blockers.push("DIAGRAM_UNSUPPORTED_CAUSAL_SEQUENCE");
  }

  if (input.state.nodes.length >= 2 && input.state.edges.length === 0 && input.state.diagramType !== "evidence-set")
    blockers.push("DIAGRAM_INSUFFICIENT_RELATIONSHIP_EVIDENCE");

  return [...new Set(blockers)];
}

export function applyDiagramTopologyValidationV35(input: {
  readonly state: HistoryDiagramStateV34;
  readonly linkedClaimText: string;
  readonly topology?: HistoryDiagramTopologyV35;
}): HistoryDiagramStateV34 {
  const blockers = validateDiagramTopologyV35(input);
  if (!blockers.length) return input.state;
  return {
    ...input.state,
    semanticStatus: "blocked",
    blockerCodes: [...new Set([...input.state.blockerCodes, ...blockers])],
    fallbackDecision: blockers.includes("DIAGRAM_INSUFFICIENT_RELATIONSHIP_EVIDENCE")
      ? "insufficient-relationship-evidence"
      : input.state.fallbackDecision,
  };
}

export function validateGeneratedStateIdentityV35(input: {
  readonly diagramStates?: readonly { readonly id: string }[];
  readonly mapStates?: readonly { readonly id: string }[];
  readonly documentStates?: readonly { readonly id: string }[];
  readonly timelineStates?: readonly { readonly id: string }[];
}): readonly {
  readonly code: "DUPLICATE_GENERATED_STATE_ID";
  readonly stateType: string;
  readonly stateId: string;
  readonly occurrenceCount: number;
  readonly affectedIds: readonly string[];
}[] {
  const collections: Array<{ readonly type: string; readonly states: readonly { readonly id: string }[] }> = [
    { type: "diagram", states: input.diagramStates ?? [] },
    { type: "map", states: input.mapStates ?? [] },
    { type: "document", states: input.documentStates ?? [] },
    { type: "timeline", states: input.timelineStates ?? [] },
  ];
  const failures: Array<{
    readonly code: "DUPLICATE_GENERATED_STATE_ID";
    readonly stateType: string;
    readonly stateId: string;
    readonly occurrenceCount: number;
    readonly affectedIds: readonly string[];
  }> = [];
  for (const collection of collections) {
    const counts = new Map<string, number>();
    for (const state of collection.states) {
      counts.set(state.id, (counts.get(state.id) ?? 0) + 1);
    }
    for (const [stateId, occurrenceCount] of counts) {
      if (occurrenceCount > 1) {
        failures.push({
          code: "DUPLICATE_GENERATED_STATE_ID",
          stateType: collection.type,
          stateId,
          occurrenceCount,
          affectedIds: [stateId],
        });
      }
    }
  }
  return failures;
}

export type DiagramCompilationRegistryV35 = {
  readonly register: (input: {
    readonly master: { readonly id: string };
    readonly state: HistoryDiagramStateV34;
  }) => {
    readonly master: { readonly id: string };
    readonly state: HistoryDiagramStateV34;
    readonly reused: boolean;
  };
};

export function createDiagramCompilationRegistryV35(input: {
  readonly diagramMasters: Array<{ readonly id: string }>;
  readonly diagramStates: HistoryDiagramStateV34[];
}): DiagramCompilationRegistryV35 {
  const signatureToStateId = new Map<string, string>();
  for (const state of input.diagramStates) {
    signatureToStateId.set(computeDiagramRegistrySignatureV35(state), state.id);
  }
  return {
    register(compiled) {
      const signature = computeDiagramRegistrySignatureV35(compiled.state);
      const existingId = signatureToStateId.get(signature);
      if (existingId) {
        const existing = input.diagramStates.find((state) => state.id === existingId);
        if (existing) {
          return { master: compiled.master, state: existing, reused: true };
        }
      }
      const duplicateIndex = input.diagramStates.findIndex((state) => state.id === compiled.state.id);
      if (duplicateIndex >= 0) {
        const existing = input.diagramStates[duplicateIndex]!;
        signatureToStateId.set(signature, existing.id);
        return { master: compiled.master, state: existing, reused: true };
      }
      if (!input.diagramMasters.some((item) => item.id === compiled.master.id))
        input.diagramMasters.push(compiled.master);
      input.diagramStates.push(compiled.state);
      signatureToStateId.set(signature, compiled.state.id);
      return { master: compiled.master, state: compiled.state, reused: false };
    },
  };
}

export function selectPortraitDiagramNodeIdsV35(
  nodes: readonly { readonly id: string; readonly label: string }[]
): string[] {
  const outcomes = nodes.filter((node) => {
    const role = classifyDiagramNodeRoleV35(node.label);
    return role === "outcome" || role === "product";
  });
  const contributors = nodes.filter((node) => classifyDiagramNodeRoleV35(node.label) === "contributor");
  const neutral = nodes.filter(
    (node) =>
      !outcomes.includes(node) && !contributors.includes(node)
  );
  return [...outcomes, ...contributors, ...neutral].slice(0, 4).map((node) => node.id);
}

export function buildDiagramNodesV35(input: {
  readonly beatNumber: string;
  readonly masterId: string;
  readonly labels: readonly string[];
  readonly claimIds: readonly string[];
}): DiagramNodeDraft[] {
  return input.labels.map((label, index) => ({
    id: `node-${input.masterId}-${index + 1}`,
    label,
    linkedClaimIds: input.claimIds,
    entityMentionIds: [],
    role: classifyDiagramNodeRoleV35(label),
  }));
}
