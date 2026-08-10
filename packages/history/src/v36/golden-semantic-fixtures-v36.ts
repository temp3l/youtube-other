import {
  claimIdV36,
  entityIdV36,
  episodeIdV36,
  type ConceptRefV36,
  type EntityIdV36,
  type ExplanatoryRelationDraftV36,
  type EventSubjectTypeV36,
  type GroundedRelationPropositionV36,
  type PlaceRefV36,
  type RelationSupportClaimV36,
  type ResolvedEntityV36,
} from "./explanatory-relation-v36.js";
import type { RelationDiagnosticCodeV36 } from "./explanatory-relation-validator-v36.js";

export interface ForbiddenRelationFixtureV36 {
  readonly relation: ExplanatoryRelationDraftV36;
  readonly diagnostic: RelationDiagnosticCodeV36;
}

export interface RelationFixtureV36 {
  readonly name: string;
  readonly narration: string;
  readonly claims: readonly RelationSupportClaimV36[];
  readonly entities: readonly ResolvedEntityV36[];
  readonly expectedRelations: readonly ExplanatoryRelationDraftV36[];
  readonly forbiddenRelations: readonly ForbiddenRelationFixtureV36[];
}

const episode = episodeIdV36("history-v36-golden");
const claim = claimIdV36("claim-golden-001");
const participantId = (label: string): EntityIdV36 =>
  entityIdV36(`entity-${label.toLocaleLowerCase().replaceAll(/[^a-z0-9]+/gu, "-").replaceAll(/^-|-$/gu, "")}`);
const place = (canonicalLabel: string): PlaceRefV36 => ({ entityId: participantId(canonicalLabel), canonicalLabel });
const concept = (canonicalLabel: string): ConceptRefV36 => ({ canonicalLabel });
const support = [claim] as const;
const base = { episodeId: episode, supportClaimIds: support } as const;

const movement = (from: string, to: string, via: readonly string[] = []): ExplanatoryRelationDraftV36 => ({
  ...base, kind: "movement", from: place(from), to: place(to), via: via.map(place),
});
const comparison = (first: string, second: string, ...remaining: readonly string[]): ExplanatoryRelationDraftV36 => ({
  ...base, kind: "spatial-comparison", places: [place(first), place(second), ...remaining.map(place)],
});
const area = (name: string): ExplanatoryRelationDraftV36 => ({ ...base, kind: "spatial-area", place: place(name) });
const causal = (cause: string, effect: string): ExplanatoryRelationDraftV36 => ({ ...base, kind: "causal", cause: concept(cause), effect: concept(effect) });
const dependency = (dependencyName: string, dependent: string): ExplanatoryRelationDraftV36 => ({ ...base, kind: "dependency", dependency: concept(dependencyName), dependent: concept(dependent) });
const process = (first: string, second: string, ...remaining: readonly string[]): ExplanatoryRelationDraftV36 => ({ ...base, kind: "process", steps: [concept(first), concept(second), ...remaining.map(concept)] });
const temporal = (first: string, second: string, ...remaining: readonly string[]): ExplanatoryRelationDraftV36 => ({ ...base, kind: "temporal-sequence", steps: [concept(first), concept(second), ...remaining.map(concept)] });
const response = (condition: string, policy: string): ExplanatoryRelationDraftV36 => ({ ...base, kind: "policy-response", condition: concept(condition), response: concept(policy) });
const evidence = (first: string, second: string, ...remaining: readonly string[]): ExplanatoryRelationDraftV36 => ({ ...base, kind: "evidence-set", evidence: [concept(first), concept(second), ...remaining.map(concept)] });
const evidenceFor = (subject: string, first: string, second: string, ...remaining: readonly string[]): ExplanatoryRelationDraftV36 => ({ ...base, kind: "evidence-set", subject: concept(subject), evidence: [concept(first), concept(second), ...remaining.map(concept)] });
const eventLocation = (event: string, location: string, assertionStatus: "asserted" | "intended" | "attempted" | "uncertain" | "counterfactual" | "reported" = "asserted", eventType: EventSubjectTypeV36 = "event"): ExplanatoryRelationDraftV36 => ({
  ...base, kind: "event-location", event: { ...concept(event), eventType }, location: place(location), assertionStatus,
});

function grounded(draft: ExplanatoryRelationDraftV36): GroundedRelationPropositionV36 {
  switch (draft.kind) {
    case "movement": return { kind: draft.kind, from: draft.from, to: draft.to, via: draft.via };
    case "spatial-comparison": return { kind: draft.kind, places: draft.places };
    case "spatial-area": return { kind: draft.kind, place: draft.place };
    case "causal": return { kind: draft.kind, cause: draft.cause, effect: draft.effect };
    case "dependency": return { kind: draft.kind, dependency: draft.dependency, dependent: draft.dependent };
    case "process":
    case "temporal-sequence": return { kind: draft.kind, steps: draft.steps };
    case "policy-response": return {
      kind: draft.kind,
      condition: draft.condition,
      ...(draft.conditionAssertionStatus ? { conditionAssertionStatus: draft.conditionAssertionStatus } : {}),
      response: draft.response,
      ...(draft.responseAssertionStatus ? { responseAssertionStatus: draft.responseAssertionStatus } : {}),
    };
    case "evidence-set": return { kind: draft.kind, ...(draft.subject ? { subject: draft.subject } : {}), evidence: draft.evidence };
    case "event-location": return { kind: draft.kind, event: draft.event, location: draft.location, assertionStatus: draft.assertionStatus };
  }
}

function participantEntities(drafts: readonly ExplanatoryRelationDraftV36[]): readonly ResolvedEntityV36[] {
  const entities = new Map<string, ResolvedEntityV36>();
  const addPlace = (ref: PlaceRefV36): void => {
    entities.set(ref.entityId, { id: ref.entityId, canonicalLabel: ref.canonicalLabel, kind: "place", atomic: ref.canonicalLabel.includes(" ") });
  };
  for (const draft of drafts) {
    if (draft.kind === "movement") [draft.from, draft.to, ...draft.via].forEach(addPlace);
    if (draft.kind === "spatial-comparison") draft.places.forEach(addPlace);
    if (draft.kind === "spatial-area") addPlace(draft.place);
    if (draft.kind === "event-location") addPlace(draft.location);
  }
  return [...entities.values()];
}

function fixture(
  name: string,
  narration: string,
  expectedRelations: readonly ExplanatoryRelationDraftV36[] = [],
  forbiddenRelations: readonly ForbiddenRelationFixtureV36[] = [],
  entities: readonly ResolvedEntityV36[] = []
): RelationFixtureV36 {
  return {
    name,
    narration,
    claims: [{ id: claim, episodeId: episode, normalizedProposition: narration, claimKind: "compound", groundedPropositions: expectedRelations.map(grounded) }],
    entities: [...participantEntities([...expectedRelations, ...forbiddenRelations.map((item) => item.relation)]), ...entities],
    expectedRelations,
    forbiddenRelations,
  };
}

/** A focused fixture may model more than one valid evidence window for one proposition. */
function fixtureWithEvidenceWindows(
  name: string,
  narration: string,
  expectedRelations: readonly ExplanatoryRelationDraftV36[],
  forbiddenRelations: readonly ForbiddenRelationFixtureV36[] = []
): RelationFixtureV36 {
  const claimIds = [...new Set(expectedRelations.flatMap((relation) => relation.supportClaimIds))];
  return {
    name,
    narration,
    claims: claimIds.map((id) => ({
      id,
      episodeId: episode,
      normalizedProposition: narration,
      claimKind: "compound",
      groundedPropositions: expectedRelations
        .filter((relation) => relation.supportClaimIds.includes(id))
        .map(grounded),
    })),
    entities: participantEntities([...expectedRelations, ...forbiddenRelations.map((item) => item.relation)]),
    expectedRelations,
    forbiddenRelations,
  };
}

const atomicEntity = (label: string): ResolvedEntityV36 => ({ id: participantId(label), canonicalLabel: label, kind: "named-entity", atomic: true });

export const goldenSemanticFixturesV36: readonly RelationFixtureV36[] = [
  fixture("movement: Lisbon through channel", "The fleet sailed from Lisbon through the English Channel.", [movement("Lisbon", "English Channel")]),
  fixture("movement: East Anglia to York", "The army moved north from East Anglia and captured York.", [movement("East Anglia", "York")]),
  fixture("movement: Britain toward passage", "The ships sailed from Britain toward the Northwest Passage.", [movement("Britain", "Northwest Passage")]),
  fixture("movement: route with waypoint", "Merchants travelled from Alexandria via Sinai to Gaza.", [movement("Alexandria", "Gaza", ["Sinai"])]),
  fixture("movement negative: geopolitical list", "Britain, France and Spain opposed the policy.", [], [{ relation: movement("Britain", "France"), diagnostic: "RELATION_PROPOSITION_UNSUPPORTED" }]),
  fixture("movement negative: allied list", "The United States, Britain and the Netherlands opposed Japan.", [], [{ relation: movement("United States", "Britain"), diagnostic: "RELATION_PROPOSITION_UNSUPPORTED" }]),
  fixture("movement negative: co-location", "Lisbon and the English Channel were discussed in the briefing.", [], [{ relation: movement("Lisbon", "English Channel"), diagnostic: "RELATION_PROPOSITION_UNSUPPORTED" }]),
  fixture("movement negative: collapsed route", "The fleet sailed at Lisbon.", [], [{ relation: movement("Lisbon", "Lisbon"), diagnostic: "RELATION_CARDINALITY_INVALID" }]),
  fixture("spatial comparison: Normandy choice", "The Allies chose Normandy rather than Pas-de-Calais.", [comparison("Normandy", "Pas-de-Calais")], [{ relation: movement("Normandy", "Pas-de-Calais"), diagnostic: "RELATION_TYPE_MISMATCH" }]),
  fixture("spatial comparison: island alternatives", "The commanders preferred Sicily over Sardinia.", [comparison("Sicily", "Sardinia")]),
  fixture("spatial comparison negative: no route", "Normandy was compared with Pas-de-Calais.", [comparison("Normandy", "Pas-de-Calais")], [{ relation: movement("Normandy", "Pas-de-Calais"), diagnostic: "RELATION_TYPE_MISMATCH" }]),
  fixture("spatial area: Bay of Naples", "Pompeii stood near the Bay of Naples.", [area("Bay of Naples")], [{ relation: area("Bay"), diagnostic: "RELATION_PROPER_NAME_FRAGMENTATION" }], [atomicEntity("Bay of Naples")]),
  fixture("spatial area: Pearl Harbor", "Pearl Harbor lies on Oahu.", [area("Pearl Harbor")], [{ relation: area("Pearl"), diagnostic: "RELATION_PROPER_NAME_FRAGMENTATION" }], [atomicEntity("Pearl Harbor")]),
  fixture("spatial area: North Atlantic", "The convoy assembled in the North Atlantic.", [area("North Atlantic")], [{ relation: movement("North Atlantic", "Atlantic"), diagnostic: "RELATION_PROPOSITION_UNSUPPORTED" }]),
  fixture("spatial area negative: location is not movement", "Pompeii stood near the Bay of Naples.", [area("Bay of Naples")], [{ relation: movement("Pompeii", "Bay of Naples"), diagnostic: "RELATION_PROPOSITION_UNSUPPORTED" }]),
  fixture("event location: intended invasion near Calais", "The main invasion was intended near Calais.", [eventLocation("main invasion", "Calais", "intended")], [
    { relation: movement("Calais", "Calais"), diagnostic: "RELATION_CARDINALITY_INVALID" },
    { relation: causal("main invasion", "Calais"), diagnostic: "RELATION_PROPOSITION_UNSUPPORTED" },
  ]),
  fixture("causal: labour scarcity to wage pressure", "Labour shortages allowed workers to demand higher wages.", [causal("labour scarcity", "wage pressure")]),
  fixture("causal: drought to harvest failure", "Drought caused the harvest to fail.", [causal("drought", "harvest failure")]),
  fixture("causal: blockade to shortages", "The blockade produced food shortages.", [causal("blockade", "food shortages")]),
  fixture("causal negative: ruler description", "Tutankhamun was an Egyptian ruler.", [], [{ relation: causal("Tutankhamun", "Egypt"), diagnostic: "RELATION_PROPOSITION_UNSUPPORTED" }]),
  fixture("causal negative: arbitrary pair in causal claim", "Labour shortages allowed workers to demand higher wages while merchants gathered in London.", [causal("labour scarcity", "wage pressure")], [{ relation: causal("merchants", "London"), diagnostic: "RELATION_PROPOSITION_UNSUPPORTED" }]),
  fixture("causal direction", "Drought caused the harvest to fail.", [causal("drought", "harvest failure")], [{ relation: causal("harvest failure", "drought"), diagnostic: "RELATION_DIRECTION_UNSUPPORTED" }]),
  fixture("dependency: archive requires tax revenue", "The archive depended on tax revenue.", [dependency("tax revenue", "archive")]),
  fixture("dependency direction", "The archive depended on tax revenue.", [dependency("tax revenue", "archive")], [{ relation: dependency("archive", "tax revenue"), diagnostic: "RELATION_DIRECTION_UNSUPPORTED" }]),
  fixture("dependency versus funding extension", "Taxes funded armies and administration.", [], [{ relation: dependency("tax revenue", "armies"), diagnostic: "RELATION_PROPOSITION_UNSUPPORTED" }]),
  fixture("process: production chain", "Ore was mined, smelted, then forged into tools.", [process("ore extraction", "smelting", "tool forging")]),
  fixture("process: paper chain", "Rags were pulped before paper was pressed.", [process("rag pulping", "paper pressing")]),
  fixture("process negative: adjacency", "Ore and tools appear in the same inventory.", [], [{ relation: process("ore extraction", "tool forging"), diagnostic: "RELATION_PROPOSITION_UNSUPPORTED" }]),
  fixture("temporal: three days later", "Three days later, event B occurred after event A.", [temporal("event A", "event B")], [{ relation: causal("event A", "event B"), diagnostic: "RELATION_TYPE_MISMATCH" }]),
  fixture("temporal: succession", "After the king died, the council met.", [temporal("king's death", "council meeting")]),
  fixture("temporal negative: chronology not cause", "The treaty was signed in May; the election followed in June.", [temporal("treaty signing", "election")], [{ relation: causal("treaty signing", "election"), diagnostic: "RELATION_TYPE_MISMATCH" }]),
  fixture("policy response: wages", "Labour scarcity pushed wages upward. Authorities responded by restricting wages.", [causal("labour scarcity", "wage pressure"), response("wage pressure", "wage restriction")]),
  fixture("policy response direction", "Authorities responded to wage pressure by restricting wages.", [response("wage pressure", "wage restriction")], [{ relation: response("wage restriction", "wage pressure"), diagnostic: "RELATION_DIRECTION_UNSUPPORTED" }]),
  fixture("evidence set: Franklin-style finds", "Searchers found graves, abandoned equipment, human remains and a written message.", [evidenceFor("expedition fate", "graves and remains", "abandoned equipment", "written message")]),
  fixture("evidence set: document collection", "The archive preserved letters, receipts and ledgers.", [evidenceFor("archive", "letters", "receipts", "ledgers")]),
  fixture("evidence set negative: not causal", "Searchers found graves and a written message.", [evidence("graves", "written message")], [{ relation: causal("graves", "written message"), diagnostic: "RELATION_TYPE_MISMATCH" }]),
  fixtureWithEvidenceWindows("identity: same movement across different evidence windows", "The fleet sailed from Lisbon to the English Channel.", [
    { ...movement("Lisbon", "English Channel"), supportClaimIds: [claimIdV36("claim-window-c1")] },
    { ...movement("Lisbon", "English Channel"), supportClaimIds: [claimIdV36("claim-window-c1"), claimIdV36("claim-window-c2")] },
  ]),
  fixtureWithEvidenceWindows("identity: reordered evidence support", "The fleet sailed from Lisbon to the English Channel.", [
    { ...movement("Lisbon", "English Channel"), supportClaimIds: [claimIdV36("claim-order-c1"), claimIdV36("claim-order-c2")] },
    { ...movement("Lisbon", "English Channel"), supportClaimIds: [claimIdV36("claim-order-c2"), claimIdV36("claim-order-c1")] },
  ]),
  fixtureWithEvidenceWindows("identity: causal reverse direction is distinct", "Drought caused the harvest to fail.", [
    causal("drought", "harvest failure"),
  ], [{ relation: causal("harvest failure", "drought"), diagnostic: "RELATION_DIRECTION_UNSUPPORTED" }]),
  fixtureWithEvidenceWindows("identity: ordered process is distinct when reordered", "Ore was mined, smelted, then forged into tools.", [
    process("ore extraction", "smelting", "tool forging"),
    process("ore extraction", "tool forging", "smelting"),
  ]),
  fixtureWithEvidenceWindows("identity: evidence-set members are unordered", "The archive preserved letters, receipts and ledgers.", [
    evidence("letters", "receipts", "ledgers"),
    evidence("ledgers", "letters", "receipts"),
  ]),
  fixtureWithEvidenceWindows("identity: dependency direction control", "The archive depended on tax revenue.", [
    dependency("tax revenue", "archive"),
  ], [{ relation: dependency("archive", "tax revenue"), diagnostic: "RELATION_DIRECTION_UNSUPPORTED" }]),
  fixture("proper name: Great Heathen Army", "The Great Heathen Army camped near York.", [], [{ relation: area("Great"), diagnostic: "RELATION_PROPER_NAME_FRAGMENTATION" }], [atomicEntity("Great Heathen Army")]),
  fixture("proper name: Great Fire of London", "The Great Fire of London transformed the city.", [], [{ relation: causal("Great", "London"), diagnostic: "RELATION_PROPER_NAME_FRAGMENTATION" }], [atomicEntity("Great Fire of London")]),
  fixture("proper name: United States", "The United States debated the policy.", [], [{ relation: causal("United", "States"), diagnostic: "RELATION_PROPER_NAME_FRAGMENTATION" }], [atomicEntity("United States")]),
  fixture("sequence cardinality: repeated process step", "Ore was mined and smelted.", [process("ore extraction", "smelting")], [{ relation: process("ore extraction", "ore extraction"), diagnostic: "RELATION_CARDINALITY_INVALID" }]),
];

export const goldenFixtureSummaryV36 = {
  fixtureCount: goldenSemanticFixturesV36.length,
  positiveByKind: {
    movement: 8,
    "spatial-comparison": 3,
    "spatial-area": 4,
    causal: 7,
    dependency: 3,
    process: 5,
    "temporal-sequence": 3,
    "policy-response": 2,
    "evidence-set": 5,
    "event-location": 1,
  },
  negativeByRule: {
    movement: 4,
    "cross-kind-inference": 6,
    causality: 2,
    direction: 5,
    "proper-name-atomicity": 5,
    cardinality: 2,
    "taxonomy-extension-required": 0,
  },
} as const;
