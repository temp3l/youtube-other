# Agentic Goal — History V3.4 Semantic Visual-Planning Hardening

## Run from the repository root

Save this file in the repository, for example:

```text
prompts/07-history-v3.4-semantic-visual-planning-hardening-goal.md
```

Run:

```text
/goal Implement every requirement and satisfy every acceptance criterion in @prompts/07-history-v3.4-semantic-visual-planning-hardening-goal.md. Repair the History trusted-script claim, entity, map, diagram, timeline, beat, shot, ratio-planning, validation, approval, and review-artifact pipeline. Use OpenAI only for bounded semantic proposals; keep application code authoritative for IDs, spans, geography, graph validity, timing, provenance, and approval. Regenerate and independently validate all required History V3.4 review artifacts. Continue until verified complete or until a concrete external blocker is proven with exact evidence.
```

Recommended Codex configuration:

```toml
model = "gpt-5.6-terra"
model_reasoning_effort = "high"
model_verbosity = "low"
```

---

# Superseding product decisions

This goal supersedes earlier History requirements where they conflict.

The final authority model is:

```ts
type HistorySourceAuthorityMode =
  | "trusted-script"
  | "research-backed"
  | "unverified-external";
```

Default for History stories:

```text
trusted-script
```

Trusted stories:

- do not require OpenAI research;
- do not require web search;
- do not require source retrieval;
- do not require evidence assessment;
- do not require an OpenAI API key;
- may generate factual visuals from narration-bound trusted claims;
- must remain explicit that they were not independently verified by the pipeline.

Research-backed mode remains available only through explicit opt-in.

---

# Core architectural rule

OpenAI may propose semantic structure.

Application code must validate, normalize, resolve, reject, persist, hash, and approve.

## OpenAI may propose

- atomic claim decomposition;
- claim kind and materiality recommendation;
- typed entity mentions and semantic roles;
- visual purpose;
- map intent;
- route semantics;
- diagram type;
- diagram node and edge proposals;
- timeline event proposals;
- beat grouping;
- shot concepts;
- 16:9 and 9:16 adaptation proposals;
- uncertainty and visual-risk annotations.

## OpenAI must never authoritatively determine

- claim IDs;
- entity IDs;
- narration offsets;
- source IDs;
- trust-attestation IDs;
- final materiality;
- final route coordinates;
- canonical place identity;
- final route type;
- final map geometry;
- final diagram graph validity;
- final timeline ordering;
- approval states;
- override validity;
- plan hashes;
- archive checksums.

## No free-form model result is trusted directly

Every OpenAI proposal must pass:

1. strict schema validation;
2. canonical narration-span validation;
3. deterministic type validation;
4. semantic cross-field validation;
5. trusted-script scope validation;
6. reference-integrity validation;
7. modality-specific validation;
8. approval-policy validation.

If validation fails, reject the proposal or choose a safer fallback.

---

# Primary goal

Implement `history-visual-plan.v3.4`, `history-visual-planner.v3.4.0`, and `history-approval-pack.v3.4` as additive contracts.

Fix all defects observed in the Franklin Expedition V3.3 review and generalize the corrections across the History pipeline:

- stopword and phrase fragments incorrectly treated as entities;
- dates, people, organizations, and quantities assigned to wrong semantic fields;
- malformed map actors, origins, destinations, periods, and route types;
- placeholder map coordinates;
- map beats without map states;
- diagram beats without diagram states;
- timeline beats without reviewable timeline artifacts;
- duplicate claim namespaces;
- every sentence treated as material;
- one narration unit per beat and one shot per beat;
- highly templated shots;
- duplicate-rate metrics not enforced;
- generic 16:9 and 9:16 plans;
- incomplete determinism evidence;
- overstated editorial and content approval states.

---

# Workstream 1 — Canonical trusted-claim model

Use one canonical claim namespace.

Do not maintain parallel authoritative `claim-*` and `trusted-claim-*` namespaces.

Implement:

```ts
interface HistoryClaimV34 {
  id: string;
  episodeId: string;

  narrationUnitIds: string[];
  narrationSpans: Array<{
    startUtf16: number;
    endUtf16Exclusive: number;
  }>;

  verbatimTexts: string[];
  normalizedProposition: string;

  claimKind:
    | "date"
    | "quantity"
    | "person"
    | "place"
    | "event"
    | "institution"
    | "causal"
    | "comparative"
    | "quotation"
    | "interpretation"
    | "uncertainty"
    | "compound"
    | "other";

  materiality: "material" | "non_material";

  entityMentionIds: string[];
  temporalQualifierIds: string[];
  geographicQualifierIds: string[];
  quantitativeQualifierIds: string[];
  uncertaintyMarkers: string[];

  authorityMode:
    | "trusted-script"
    | "research-backed"
    | "unverified-external";

  provenanceStatus:
    | "trusted_input"
    | "supported"
    | "partially_supported"
    | "contested"
    | "contradicted"
    | "unresolved"
    | "not_required";

  trustAttestationId: string | null;
  independentlyVerified: boolean;

  schemaVersion: "history-claim.v3.4";
}
```

## Trusted-script behavior

Material factual claims:

```text
provenanceStatus: trusted_input
independentlyVerified: false
```

Rhetorical/editorial narration:

```text
provenanceStatus: not_required
materiality: non_material
```

Do not mark all narration units material.

---

# Workstream 2 — Claim structuring strategy

## Preferred source

For newly generated stories, the story-generation result must emit:

- narration;
- claim proposals;
- claim-to-narration bindings;
- entity proposals;
- visual opportunities.

Validate and persist those proposals without a second full extraction pass.

## Existing/imported stories

Use a layered trusted-script claim structurer:

1. deterministic narration segmentation;
2. deterministic obvious date/quantity/quotation extraction;
3. optional semantic structuring provider;
4. deterministic post-validation.

The semantic structuring provider:

- is not a research provider;
- performs no web search;
- performs no source retrieval;
- may be disabled;
- must use strict typed output;
- must be cached;
- must not change authority mode.

## Atomicity

Allow:

- zero claims from rhetorical narration;
- one claim from a simple factual sentence;
- multiple claims from compound narration;
- one claim spanning multiple narration units where necessary.

Do not force:

```text
claim count = narration-unit count
```

---

# Workstream 3 — Typed entity system

Replace generic phrase extraction with typed entity mentions.

```ts
type HistoryEntityType =
  | "person"
  | "organization"
  | "state"
  | "place"
  | "region"
  | "water-body"
  | "ship"
  | "military-unit"
  | "ethnic-or-cultural-group"
  | "event"
  | "document"
  | "object"
  | "disease"
  | "other";

interface HistoryEntityMentionV34 {
  id: string;
  claimId: string;
  text: string;
  normalizedLabel: string;
  entityType: HistoryEntityType;
  semanticRole:
    | "actor"
    | "leader"
    | "origin"
    | "destination"
    | "location"
    | "institution"
    | "vehicle"
    | "subject"
    | "object"
    | "observer"
    | "other";
  narrationSpan: {
    startUtf16: number;
    endUtf16Exclusive: number;
  };
  confidenceSource:
    | "deterministic"
    | "model-proposed"
    | "metadata"
    | "editorial";
}
```

## Hard rejection rules

Reject as canonical entities:

```text
The
A
An
But
By
For
From
In
It
Its
Later
No
On
Some
That
Their
Then
There
They
This
Those
Whaling
Why
Yet
In May
On June
In October
```

unless a token is part of a validated longer proper noun.

Maintain:

- stopword set;
- temporal-prefix parser;
- title/name parser;
- organization parser;
- canonical entity aliases;
- rejected-entity diagnostics.

`rejected-entities.json` must contain rejected proposals with reasons.

## Cross-field correctness

A person cannot be a geographic qualifier.

An organization cannot become a map origin unless the narration explicitly uses it as a location and the validator confirms that semantics.

A quantity cannot become a date.

A date component cannot become uncertainty.

A pronoun cannot become a map actor unless it is deterministically resolved to a canonical antecedent.

---

# Workstream 4 — Temporal, geographic, quantitative, and uncertainty types

Do not store raw strings in interchangeable arrays.

Implement typed qualifier records.

```ts
interface HistoryTemporalQualifierV34 {
  id: string;
  claimId: string;
  kind:
    | "year"
    | "month-year"
    | "date"
    | "period"
    | "relative-time"
    | "duration";
  normalizedValue: string;
  verbatimText: string;
  span: TextSpanV34;
}

interface HistoryGeographicQualifierV34 {
  id: string;
  claimId: string;
  entityMentionId: string;
  role:
    | "origin"
    | "destination"
    | "location"
    | "region"
    | "route-waypoint"
    | "affected-area";
}

interface HistoryQuantitativeQualifierV34 {
  id: string;
  claimId: string;
  kind:
    | "count"
    | "percentage"
    | "distance"
    | "duration"
    | "mass"
    | "range"
    | "estimate";
  normalizedValue: string;
  unit: string | null;
  verbatimText: string;
  span: TextSpanV34;
}
```

`May` in `May 1845` is temporal, not uncertainty.

`129` survivors is a count, not a year.

---

# Workstream 5 — Place resolution and map authority

OpenAI may propose place mentions and route semantics.

OpenAI must not provide authoritative coordinates.

Implement a deterministic place-resolution layer using:

- canonical place registry;
- episode metadata;
- curated gazetteer;
- cached geocoder where allowed;
- explicit aliases;
- editorial overrides.

Every canonical place must include:

```ts
interface HistoryPlaceV34 {
  id: string;
  label: string;
  placeType:
    | "country"
    | "city"
    | "region"
    | "island"
    | "water-body"
    | "river"
    | "strait"
    | "cape"
    | "site"
    | "other";
  coordinates: {
    latitude: number;
    longitude: number;
  } | null;
  geometrySource:
    | "curated"
    | "gazetteer"
    | "editorial"
    | "unresolved";
  aliases: string[];
}
```

Placeholder coordinates such as `[0,0]` and `[1,1]` are prohibited in reviewable map states.

Unresolved geography must block the map or force a safer non-map modality.

---

# Workstream 6 — Map intent and map-state generation

Use two stages.

## Stage A — Semantic proposal

OpenAI may propose:

```ts
interface HistoryMapIntentProposalV34 {
  claimIds: string[];
  mapPurpose:
    | "journey"
    | "expedition-route"
    | "campaign"
    | "migration"
    | "trade"
    | "territorial-change"
    | "orientation"
    | "search-area"
    | "discovery-location"
    | "comparison";
  movingActorEntityMentionIds: string[];
  originPlaceMentionIds: string[];
  destinationPlaceMentionIds: string[];
  waypointPlaceMentionIds: string[];
  temporalQualifierIds: string[];
  routeType:
    | "maritime"
    | "overland"
    | "river"
    | "mixed"
    | "conceptual"
    | "none";
  uncertainty: string[];
}
```

## Stage B — Deterministic compilation

Application code:

- resolves canonical entities and places;
- resolves coordinates;
- validates actor type;
- validates place type;
- validates route type;
- builds route geometry;
- builds labels;
- creates map master/state IDs;
- rejects invalid proposals.

## Map validators

Block or downgrade a map when:

- moving actor is a stopword, pronoun, date phrase, or unresolved token;
- origin/destination is not a canonical place;
- date/period comes from a quantity;
- route type contradicts the narration;
- a conceptual connection is labelled military;
- a march is classified maritime;
- actor and destination are people without explicit journey semantics;
- coordinates are missing where geometry is required;
- geometry is placeholder data;
- label text introduces unsupported facts;
- a route is not stated or reasonably implied by trusted narration.

## Franklin regression fixtures

Add fixtures preventing:

```text
movingActor = "In May"
origin = "In May"
destination = "Royal Navy"

movingActor = "Arctic"
routeType = "military"

movingActor = "The"
destination = "Francis Crozier"
routeType = "maritime"
dateOrPeriod = "105"

movingActor = "Its"
destination = "Inuit"
```

Correct survivor-march semantics must support:

- moving actor: surviving expedition members;
- leaders: Crozier and Fitzjames as leader metadata;
- destination: Back River;
- route: overland;
- period: April 1848.

---

# Workstream 7 — Complete modality artifacts

A beat declaring a modality must have a complete matching state.

## Map

```text
modality = map
→ mapMasterId required
→ mapStateId required
→ map validation must pass
```

## Diagram

```text
modality = diagram
→ diagramMasterId required
→ diagramStateId required
→ graph validation must pass
```

## Timeline

```text
modality = timeline
→ timelineMasterId required
→ timelineStateId required
→ event ordering validation must pass
```

## Document or quotation

```text
modality = document-or-quotation
→ documentStateId required
```

If a state cannot be created, select a safer modality:

- archival visual;
- text-only transition;
- restrained reconstruction;
- no generated visual.

Never export dangling conceptual IDs without reviewable artifacts.

---

# Workstream 8 — Diagram proposal and compilation

OpenAI may propose diagram semantics.

Application code must compile and validate.

```ts
interface HistoryDiagramProposalV34 {
  claimIds: string[];
  diagramType:
    | "causal-chain"
    | "process"
    | "institutional"
    | "comparison"
    | "hierarchy"
    | "decision-tree"
    | "network"
    | "resource-flow"
    | "uncertainty-range";
  questionAnswered: string;
  nodes: Array<{
    proposalId: string;
    label: string;
    claimIds: string[];
    entityMentionIds: string[];
  }>;
  edges: Array<{
    fromProposalId: string;
    toProposalId: string;
    relationship:
      | "causes"
      | "contributes-to"
      | "leads-to"
      | "contains"
      | "commands"
      | "contrasts-with"
      | "depends-on"
      | "associated-with"
      | "sequence";
    claimIds: string[];
  }>;
}
```

## Diagram validators

Every node must be supported by trusted narration.

Every edge must represent an explicit or clearly implied relationship.

Reject:

- template-generated causal edges;
- entity-wide unions copied to every node;
- nodes without claim bindings;
- causal direction stronger than narration;
- diagrams that should be maps or timelines;
- empty diagram states.

If validation fails, choose another modality.

---

# Workstream 9 — Timeline artifacts

Introduce explicit timeline contracts.

```ts
interface HistoryTimelineEventV34 {
  id: string;
  claimIds: string[];
  label: string;
  temporalQualifierIds: string[];
  dateSortKey: string | null;
  uncertainty: string[];
}

interface HistoryTimelineStateV34 {
  id: string;
  masterId: string;
  eventIds: string[];
  orderingStatus:
    | "valid"
    | "ambiguous"
    | "invalid";
}
```

Validate:

- chronological order;
- duplicate events;
- missing dates;
- relative dates;
- uncertain dates;
- labels adding unsupported facts.

Export timeline masters and states in approval packs.

---

# Workstream 10 — Semantic beat grouping

Stop forcing one narration unit per beat.

Create beats from:

- narrative purpose;
- chronology;
- location;
- claim cluster;
- visual continuity;
- pacing;
- modality compatibility.

A beat may include multiple narration units.

A narration unit may remain its own beat when editorially appropriate.

## Beat constraints

- preferred beat duration: configurable;
- long beats require sufficient visual development;
- very short adjacent beats should be merged where continuity benefits;
- do not merge claims requiring incompatible modalities;
- preserve exact narration timing coverage.

Add diagnostics for:

- beats under minimum duration;
- beats over maximum duration;
- single-unit dominance;
- one-beat-per-unit ratio;
- abrupt modality changes.

For a typical 10–12 minute episode, the planner should not mechanically produce one beat per sentence.

---

# Workstream 11 — Multi-shot planning

A beat may have one or multiple shots.

Require multiple shots when:

- duration exceeds a configurable threshold;
- several distinct claims appear;
- a map/diagram evolves;
- visual evidence changes;
- explanatory density is high;
- continuity requires an establishing/detail/consequence sequence.

Do not require multiple shots for every beat.

## Shot schema

Include:

- shot purpose;
- subject;
- action;
- framing;
- camera movement;
- foreground;
- midground;
- background;
- factual labels;
- claim IDs;
- modality-state reference;
- transition;
- duration;
- 16:9 adaptation;
- 9:16 adaptation;
- prohibited additions;
- reconstruction policy.

Do not emit universal filler fields such as:

```text
No unsupported factual labels
Narration-bound subject
Low-detail neutral context
```

unless they are genuinely beat-specific and useful.

---

# Workstream 12 — Enforce repetition quality gates

Extend quality thresholds to include:

```ts
interface HistoryQualityThresholdsV34 {
  maxExactPurposeDuplicateRate: number;
  maxSemanticPurposeDuplicateRate: number;
  maxDominantCameraRate: number;
  maxTwoInstructionAlternationRate: number;
  maxShotStructureDuplicateRate: number;
  maxAssetTreatmentDuplicateRate: number;
  maxGenericFieldReuseRate: number;
  maxOneShotPerLongBeatRate: number;
}
```

Quality validation must fail when measured values exceed thresholds.

Do not report:

```text
shotStructureDuplicateRate > 0.90
passes = true
```

unless a documented explicit override exists.

Calculate semantic duplication on reusable planning instructions, excluding:

- unique narration text;
- unique IDs;
- claim labels.

Export duplicate clusters with beat/shot IDs.

---

# Workstream 13 — Beat-specific 16:9 and 9:16 plans

Every factual visual must have real ratio-specific composition.

## Map adaptation fields

- retained route IDs;
- retained labels;
- removed labels;
- label priority;
- crop bounds;
- orientation;
- route simplification;
- waypoint simplification;
- legend placement;
- conflict diagnostics;
- minimum text size;
- whether independent portrait rendering is required.

## Diagram adaptation fields

- retained nodes;
- removed/merged nodes;
- retained edges;
- vertical ordering;
- label wrapping;
- font-size result;
- conflict diagnostics;
- independent portrait rendering requirement.

## Timeline adaptation fields

- retained events;
- event grouping;
- horizontal versus vertical layout;
- label priority;
- collision diagnostics.

Do not allow all maps to export:

```text
labelsRetained = []
labelPriority = []
conflictDiagnostics = []
textDensityResult = pass
```

without inspecting actual labels.

---

# Workstream 14 — Approval semantics

Keep four independent gates:

- structural;
- editorial;
- content;
- production.

## Structural

Ready only when:

- schemas valid;
- IDs valid;
- references resolve;
- spans valid;
- declared modalities have states;
- map/diagram/timeline structures validate;
- hashes/checksums valid.

## Editorial

Ready only when:

- beat grouping is reviewable;
- long beats have sufficient visual development;
- repetition thresholds pass;
- modalities are complete;
- ratio plans are specific;
- shot plans are not mechanical placeholders.

## Content

For trusted-script mode, ready only when:

- attestation valid;
- claims bound to narration;
- every factual visual stays within trusted narration;
- maps/diagrams/timelines add no unsupported facts;
- material factual deltas are re-attested;
- no invalid semantic entities drive visuals.

## Production

Ready only when:

- upstream gates ready;
- measured narration duration available where required;
- media references valid;
- rendering preconditions valid;
- final ratio conflicts resolved.

Do not use `valid: true` as a generic approval signal.

Prefer explicit:

```ts
structurallyValid: boolean;
editoriallyReviewable: boolean;
contentApprovalEligible: boolean;
productionApprovalEligible: boolean;
```

---

# Workstream 15 — Determinism evidence

Fix determinism reporting.

The report must include actual commands used for the current episode.

Do not list episodes 02–04 while claiming the command regenerated episode 05.

Record:

- episode ID;
- snapshot/trust hash;
- plan command;
- bundle command;
- first-run hashes;
- second-run hashes;
- byte-equality result;
- stable archive timestamp representation;
- timezone/DOS timestamp interpretation;
- file-order policy;
- permission policy.

Ensure the reported stable timestamp matches actual ZIP metadata.

---

# Workstream 16 — Review-pack completeness

Each V3.4 episode review pack must contain:

```text
README.md
approval.md
manifest.json
checksums.sha256

authoring-mode.json
source-authority.json
trusted-narration-attestation.json

canonical-narration.json
claims.json
entities.json
rejected-entities.json
temporal-qualifiers.json
geographic-qualifiers.json
quantitative-qualifiers.json
script-claim-bindings.json

visual-purposes.json
beats.json
shots.json
asset-intents.json
media-decisions.json

map-masters.json
map-states.json
diagram-masters.json
diagram-states.json
timeline-masters.json
timeline-states.json
document-states.json

aspect-ratio-plans.json
quality-metrics.json
validation.json
planner-config.json
test-summary.json
determinism-report.json
```

Do not export two authoritative claim files with different namespaces.

---

# Workstream 17 — CLI workflow

Add or update explicit commands:

```text
history authoring structure-trusted-script
history authoring validate-trusted-claims
history visuals plan
history visuals validate
history visuals inspect
history visuals review-bundle
```

Optional semantic structuring:

```text
--semantic-structuring
```

Default must remain offline and deterministic.

For trusted-script mode:

- no `OPENAI_API_KEY` required;
- no paid-provider flag required;
- no web access required.

If semantic structuring is enabled:

- no web search;
- no source retrieval;
- cache result;
- record provider/model/token usage;
- preserve trusted authority mode.

---

# Workstream 18 — Regression tests

Add tests covering all Franklin defects.

## Entity regressions

Reject:

```text
The
They
Its
In May
Whaling
On June
```

as canonical map actors/origins/destinations.

Correctly classify:

- Royal Navy as organization;
- Sir John Franklin as person;
- Francis Crozier as person/leader;
- Britain as place/state;
- Back River as place/river;
- Northwest Passage as region/conceptual route;
- April 1848 as temporal period;
- 105 as count.

## Map regressions

Reject:

```text
In May → Royal Navy
Arctic → Atlantic, routeType military
The → Francis Crozier, routeType maritime
Its → Inuit
```

Require real coordinates or unresolved blocking state.

## Modality regressions

- map beat without map state fails;
- diagram beat without diagram state fails;
- timeline beat without timeline state fails;
- fallback modality works.

## Quality regressions

- 93% shot-structure duplication fails;
- absent threshold is a schema error;
- generic field reuse is measured;
- long beat with one generic shot fails when threshold requires more.

## Ratio regressions

- map labels must be retained/removed/prioritized;
- portrait map conflict diagnostics required;
- empty diagnostics cannot automatically pass.

## Authority regressions

- trusted-script remains default;
- no research calls;
- no fake support status;
- attestation required;
- narration-bound visuals allowed.

Use fixtures in CI. Live OpenAI calls must be opt-in.

---

# Workstream 19 — Regeneration targets

Regenerate V3.4 review packs for:

```text
history-youtube-history-10-video-story-pack-02-napoleons-invasion-of-russia
history-youtube-history-10-video-story-pack-03-fall-of-the-roman-empire
history-youtube-history-10-video-story-pack-04-black-death
history-youtube-history-10-video-story-pack-05-franklin-expedition
```

If the exact Franklin episode root differs, resolve it from the repository.

For each:

1. confirm `trusted-script`;
2. create/validate trust attestation;
3. structure claims offline;
4. validate typed entities and qualifiers;
5. generate visual purposes;
6. generate semantic beats;
7. generate shot plans;
8. generate complete map/diagram/timeline states;
9. generate 16:9 and 9:16 plans;
10. validate;
11. generate review bundle;
12. regenerate Phase B a second time;
13. verify byte equality;
14. export combined comparison bundle.

Do not approve the packs automatically.

---

# Acceptance criteria

## Claims and entities

- [ ] One canonical claim namespace.
- [ ] Claims are not forced one-per-sentence.
- [ ] Rhetorical narration can be `not_required`.
- [ ] Stopwords and temporal prefixes are rejected as entities.
- [ ] People, organizations, places, dates, and quantities are typed correctly.
- [ ] Rejected entity proposals are exported.
- [ ] Claim spans and IDs are deterministic.

## Maps

- [ ] OpenAI does not author authoritative coordinates.
- [ ] Every map place resolves through a canonical place layer.
- [ ] Placeholder coordinates are prohibited.
- [ ] Actors, origins, destinations, periods, and route types validate.
- [ ] All Franklin malformed-map regressions are fixed.
- [ ] Every map beat has a valid map state or another modality.

## Diagrams and timelines

- [ ] Every diagram beat has a valid diagram state or another modality.
- [ ] Every node and edge is narration-bound.
- [ ] Every timeline beat has exported timeline artifacts.
- [ ] Timeline ordering and uncertainty validate.

## Beats and shots

- [ ] Beat grouping is semantic rather than mechanically one-per-unit.
- [ ] Long/dense beats may receive multiple shots.
- [ ] Shot fields are beat-specific.
- [ ] Mechanical six-preset rotation is eliminated.
- [ ] Repetition thresholds are enforced.

## Aspect ratios

- [ ] 16:9 and 9:16 plans are asset-specific.
- [ ] Map labels and routes have retention priorities.
- [ ] Diagram nodes/edges have portrait adaptation.
- [ ] Timeline events have ratio-specific adaptation.
- [ ] Conflict diagnostics are real.

## Approval

- [ ] Structural gate includes modality completeness.
- [ ] Editorial gate includes quality thresholds.
- [ ] Content gate includes narration-bound visual validation.
- [ ] Production remains blocked without measured timing when required.
- [ ] No generic `valid: true` implies approval.

## Authority and cost

- [ ] `trusted-script` remains default.
- [ ] No OpenAI research or web search is required.
- [ ] Optional semantic structuring performs no research.
- [ ] Trusted claims remain `trusted_input`.
- [ ] No fake sources or evidence are created.

## Artifacts and determinism

- [ ] All required V3.4 files are exported.
- [ ] No duplicate authoritative claim namespace.
- [ ] All JSON parses.
- [ ] References resolve.
- [ ] Checksums pass.
- [ ] ZIP safety passes.
- [ ] Determinism commands match the current episode.
- [ ] Archive timestamp reporting matches actual metadata.
- [ ] Four episode review ZIPs and one comparison bundle are generated.

## Regression

- [ ] Typecheck passes.
- [ ] Build passes.
- [ ] Focused lint passes.
- [ ] Focused History tests pass.
- [ ] Unrelated genres remain unchanged.
- [ ] No paid calls in CI.

---

# Required final report

Provide:

1. root causes;
2. changed files grouped by workstream;
3. OpenAI/non-OpenAI authority boundary;
4. canonical claim/entity architecture;
5. map compilation and validation architecture;
6. diagram/timeline architecture;
7. beat/shot grouping changes;
8. ratio-planning changes;
9. approval-policy changes;
10. exact commands run;
11. test results;
12. per episode:
    - claim count;
    - non-material count;
    - entity/rejected-entity counts;
    - map/diagram/timeline counts;
    - beat/shot counts;
    - repetition metrics;
    - timing;
    - gate states;
    - bundle path/hash;
13. determinism evidence;
14. remaining blockers;
15. known limitations.

Do not claim independent historical verification for trusted-script episodes.

---

# Definition of done

The goal is complete when:

- trusted-script remains the default;
- claims and entities are semantically structured without requiring research;
- malformed entity data cannot reach maps or diagrams;
- maps use validated canonical geography;
- diagram and timeline artifacts are complete;
- beats and shots are editorially useful rather than mechanically templated;
- ratio plans are specific and reviewable;
- quality metrics actively gate approval;
- review artifacts and approval states are honest;
- regenerated V3.4 packs pass independent structural and semantic review.
