import type { HistoryClaimV34, HistoryDiagramStateV34 } from "./history-v34-contracts.js";

type DiagramEdgeRelationship = HistoryDiagramStateV34["edges"][number]["relationship"];

export type DiagramPropositionRelationV35 =
  | "causal"
  | "contribution"
  | "dependency"
  | "temporal-before"
  | "containment"
  | "command"
  | "contrast"
  | "association"
  | "located-in"
  | "mentions-together";

const RELATIONSHIP_COMPATIBILITY = {
  causes: ["causal"],
  "contributes-to": ["causal", "contribution"],
  "leads-to": ["causal"],
  contains: ["containment"],
  commands: ["command"],
  "contrasts-with": ["contrast"],
  "depends-on": ["causal", "dependency"],
  "associated-with": ["association"],
  sequence: ["temporal-before"],
} as const satisfies Readonly<Record<DiagramEdgeRelationship, readonly DiagramPropositionRelationV35[]>>;

const CONCEPT_ALIASES: Readonly<Record<string, readonly RegExp[]>> = {
  "population loss": [
    /\bpopulation loss\b/iu,
    /\bdemographic shock\b/iu,
    /\b(?:mass )?mortality\b/iu,
  ],
  "labour scarcity": [
    /\blabou?r scarcity\b/iu,
    /\b(?:worker|labou?r) shortage\b/iu,
    /\bshortage of labou?r\b/iu,
    /\blacked workers\b/iu,
    /\blost apprentices\b/iu,
    /\bstruggled to harvest\b/iu,
  ],
  "wage pressure": [
    /\bwage pressure\b/iu,
    /\bhigher wages\b/iu,
    /\bdemand higher wages\b/iu,
    /\brising wages\b/iu,
    /\bbetter terms\b/iu,
  ],
  "labour policy response": [
    /\blabou?r policy response\b/iu,
    /\bOrdinance\b/iu,
    /\bStatute of Labourers\b/iu,
  ],
  "wage restriction attempt": [
    /\bwage restriction attempt\b/iu,
    /\brestrict wages\b/iu,
    /\bcompel work\b/iu,
  ],
  "tax revenue": [/\btax revenue\b/iu, /\b(?:paid )?taxes\b/iu],
  "armies and administration": [
    /\barmies and administration\b/iu,
    /\bfunded armies\b/iu,
  ],
  "provincial control": [
    /\bprovincial control\b/iu,
    /\bdefended provinces\b/iu,
    /\bthe system\b/iu,
  ],
  "continued revenue": [
    /\bcontinued revenue\b/iu,
    /\breproduce itself\b/iu,
  ],
  "drought pressure": [/\bdrought(?: pressure)?\b/iu],
  "migration pressure": [/\bmigration(?: pressure)?\b/iu],
  "trade disruption": [
    /\btrade disruption\b/iu,
    /\btrade routes?\b/iu,
    /\btrade network\b/iu,
  ],
  "political instability": [
    /\bpolitical instability\b/iu,
    /\binstability\b/iu,
    /\bfragmentation\b/iu,
  ],
  "systems collapse": [
    /\bsystems? collapse\b/iu,
    /\bcollapse more likely\b/iu,
    /\bmake collapse\b/iu,
  ],
  "copper from cyprus": [/\bcopper\b[^.!?]{0,80}\bCyprus\b/iu],
  "tin from distant regions": [/\btin\b/iu],
  "bronze production": [/\bbronze(?: production)?\b/iu],
  "palace trade networks": [/\bpalace trade networks?\b/iu, /\btrade networks?\b/iu],
};

const NORMALIZED_MECHANISMS: ReadonlyArray<{
  readonly from: string;
  readonly to: string;
  readonly relations: readonly DiagramPropositionRelationV35[];
}> = [
  { from: "population loss", to: "labour scarcity", relations: ["causal", "dependency"] },
  { from: "labour scarcity", to: "wage pressure", relations: ["causal", "dependency"] },
  { from: "wage pressure", to: "labour policy response", relations: ["causal", "dependency"] },
  { from: "labour policy response", to: "wage restriction attempt", relations: ["causal"] },
  { from: "tax revenue", to: "armies and administration", relations: ["causal", "dependency"] },
  { from: "armies and administration", to: "provincial control", relations: ["causal", "dependency"] },
  { from: "provincial control", to: "continued revenue", relations: ["causal", "dependency"] },
];

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");
}

function normalizeLabel(value: string): string {
  return value.replace(/\s+/gu, " ").trim().toLocaleLowerCase();
}

function patternsForConcept(label: string): readonly RegExp[] {
  const normalized = normalizeLabel(label);
  return (
    CONCEPT_ALIASES[normalized] ?? [
      new RegExp(`\\b${escapeRegExp(normalized).replace(/\s+/gu, "\\s+")}\\b`, "iu"),
    ]
  );
}

function firstConceptSpan(label: string, text: string): { readonly start: number; readonly end: number } | null {
  let first: { readonly start: number; readonly end: number } | null = null;
  for (const pattern of patternsForConcept(label)) {
    const match = pattern.exec(text);
    if (!match || (first && first.start <= match.index)) continue;
    first = { start: match.index, end: match.index + match[0].length };
  }
  return first;
}

function explicitPropositionRelations(input: {
  readonly text: string;
  readonly fromLabel: string;
  readonly toLabel: string;
}): readonly DiagramPropositionRelationV35[] {
  const from = firstConceptSpan(input.fromLabel, input.text);
  const to = firstConceptSpan(input.toLabel, input.text);
  if (!from || !to) return [];

  const relations = new Set<DiagramPropositionRelationV35>();
  const forward = from.start < to.start;
  const between = forward
    ? input.text.slice(from.end, to.start)
    : input.text.slice(to.end, from.start);
  const whole = input.text;

  if (
    (forward &&
      /\b(?:caused|led to|resulted in|triggered|forced|compelled|enabled|produced|brought|funded|defended|helped|made|allowed|meant|therefore|so that|which)\b/iu.test(
        between
      )) ||
    (!forward && /\b(?:because of|due to|resulted from)\b/iu.test(between))
  ) {
    relations.add("causal");
  }

  if (
    forward &&
    (/\b(?:combined|combining|together|along with|as well as|contribut(?:e|ed|ing)|interact(?:ed|ing)?|converge)\b/iu.test(
      whole.slice(from.start, to.start)
    ) ||
      (() => {
        const combinationStart = whole.search(/\b(?:combining|combined)\b/iu);
        const outcomeConnector = whole.search(/\b(?:into|to make|to produce)\b/iu);
        return (
          combinationStart >= 0 &&
          combinationStart < from.start &&
          outcomeConnector > from.end &&
          outcomeConnector < to.start
        );
      })())
  ) {
    relations.add("contribution");
  }

  if (
    (forward && /\b(?:supported|funded|enabled|required|needed|allowed)\b/iu.test(between)) ||
    (!forward && /\b(?:depend(?:ed|s|ing)? on|relied on|required|needed|supported by)\b/iu.test(between))
  ) {
    relations.add("dependency");
  }

  if (
    (forward && /\b(?:then|followed by|before|subsequently|in turn|next|afterwards?)\b/iu.test(between)) ||
    (!forward && /\b(?:after|following)\b/iu.test(between))
  ) {
    relations.add("temporal-before");
  }

  if (forward && /\b(?:contains?|includes?|comprises?|within|made up of)\b/iu.test(between))
    relations.add("containment");
  if (forward && /\b(?:commands?|commanded|led|directed)\b/iu.test(between))
    relations.add("command");
  if (/\b(?:unlike|rather than|contrasts? with|compared with|not because)\b/iu.test(whole))
    relations.add("contrast");
  if (/\b(?:associated with|linked to|related to|connected to)\b/iu.test(between))
    relations.add("association");
  if (/\b(?:in|at|within|located in|buried in|found in|from)\b/iu.test(between))
    relations.add("located-in");
  if (!relations.size) relations.add("mentions-together");
  return [...relations];
}

function compatible(relationship: DiagramEdgeRelationship, relation: DiagramPropositionRelationV35): boolean {
  return (RELATIONSHIP_COMPATIBILITY[relationship] as readonly DiagramPropositionRelationV35[]).includes(
    relation
  );
}

function normalizedMechanismRelations(input: {
  readonly claimTexts: readonly string[];
  readonly fromLabel: string;
  readonly toLabel: string;
}): readonly DiagramPropositionRelationV35[] {
  const from = normalizeLabel(input.fromLabel);
  const to = normalizeLabel(input.toLabel);
  const mechanism = NORMALIZED_MECHANISMS.find(
    (item) => item.from === from && item.to === to
  );
  if (!mechanism) return [];
  const joined = input.claimTexts.join("\n");
  if (!firstConceptSpan(from, joined) || !firstConceptSpan(to, joined)) return [];
  return mechanism.relations;
}

export function assessDiagramPropositionEdgeV35(input: {
  readonly fromLabel: string;
  readonly toLabel: string;
  readonly relationship: DiagramEdgeRelationship;
  readonly claims?: readonly Pick<HistoryClaimV34, "id" | "normalizedProposition">[];
  readonly linkedClaimIds?: readonly string[];
  readonly evidenceClaimText?: string;
}): {
  readonly entailed: boolean;
  readonly relationshipTypeMismatch: boolean;
  readonly propositionRelations: readonly DiagramPropositionRelationV35[];
} {
  const allowedClaimIds = new Set(input.linkedClaimIds ?? []);
  const claimTexts = input.claims?.length
    ? input.claims
        .filter((claim) => !allowedClaimIds.size || allowedClaimIds.has(claim.id))
        .map((claim) => claim.normalizedProposition)
    : (input.evidenceClaimText ?? "").split(/\n+/gu).filter(Boolean);

  const propositionRelations = new Set<DiagramPropositionRelationV35>();
  for (const text of claimTexts) {
    for (const relation of explicitPropositionRelations({
      text,
      fromLabel: input.fromLabel,
      toLabel: input.toLabel,
    })) {
      propositionRelations.add(relation);
    }
  }
  for (const relation of normalizedMechanismRelations({
    claimTexts,
    fromLabel: input.fromLabel,
    toLabel: input.toLabel,
  })) {
    propositionRelations.add(relation);
  }

  const entailed = [...propositionRelations].some((relation) =>
    compatible(input.relationship, relation)
  );
  return {
    entailed,
    relationshipTypeMismatch: propositionRelations.size > 0 && !entailed,
    propositionRelations: [...propositionRelations],
  };
}

export function diagramRelationshipCompatibilityV35(
  relationship: DiagramEdgeRelationship
): readonly DiagramPropositionRelationV35[] {
  return RELATIONSHIP_COMPATIBILITY[relationship];
}
