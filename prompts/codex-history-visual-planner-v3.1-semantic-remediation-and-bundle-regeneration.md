# Codex Agentic Goal: History Visual Planner V3.1 Semantic Remediation and Bundle Regeneration

## Mission

Upgrade the existing history visual planner from its current V3 structural foundation to a semantically credible V3.1 implementation, then regenerate and export ChatGPT review bundles for:

```text
history-youtube-history-10-video-story-pack-02-napoleons-invasion-of-russia
history-youtube-history-10-video-story-pack-03-fall-of-the-roman-empire
history-youtube-history-10-video-story-pack-04-black-death
```

This task must preserve the V3 safety, versioning, packaging, narration-coverage, and approval-gating improvements while replacing the remaining shallow heuristics and placeholder semantics.

This is an implementation task.

Do not stop after writing another plan. Implement, test, regenerate, inspect, and package the three episodes.

---

# Operating mode

Work from the repository root.

Use the existing V3 implementation, reports, and review artifacts as evidence.

Inspect and reuse repository conventions before changing code.

Relevant existing material may include:

```text
docs/plans/history-visual-planner-remediation/
docs/reports/codex-runs/
artifacts/chatgpt-review/
episodes/history-youtube-history-10-video-story-pack-02-napoleons-invasion-of-russia/
episodes/history-youtube-history-10-video-story-pack-03-fall-of-the-roman-empire/
episodes/history-youtube-history-10-video-story-pack-04-black-death/
```

Use multi-agent execution if available.

Recommended read/write agent split:

1. **Semantic extraction agent**
   - entity extraction;
   - claim extraction;
   - historical uncertainty;
   - source/provenance state.

2. **Editorial planning agent**
   - semantic beat grouping;
   - visual purposes;
   - anchor sequences;
   - media decisions;
   - editorial hierarchy.

3. **Maps, diagrams, and aspect-ratio agent**
   - geographic semantics;
   - typed routes;
   - diagram graphs;
   - ratio-specific composition.

4. **Validation, testing, and packaging agent**
   - semantic validators;
   - golden/property tests;
   - approval-pack rendering;
   - regenerated ZIP integrity.

The lead agent must verify all subagent output and must not accept generated artifacts containing placeholders or invalid historical semantics.

---

# Persona and quality bar

Act as:

- principal TypeScript/media-pipeline architect;
- history-documentary showrunner;
- historical visual director;
- historical information-modelling engineer;
- production reliability engineer.

The quality bar is not merely “valid JSON.”

The generated visual plan must be editorially usable and historically interpretable.

Optimise for:

- complete narration preservation;
- strict type safety;
- deterministic transformations;
- historically meaningful entities;
- concrete visual direction;
- claim-aware media choices;
- reusable assets;
- semantic maps and diagrams;
- real multi-shot editorial sequences;
- explicit 16:9 and 9:16 treatment;
- truthful uncertainty and source status;
- reviewable approval packs;
- no non-history regressions.

---

# Existing V3 foundation that must be preserved

Do not regress the following capabilities:

1. Complete narration coverage.
2. No silent narration clipping.
3. Reviewability separated from production approval eligibility.
4. Blocking `NARRATION_DURATION_CONFLICT`.
5. `TIMING_ESTIMATE_FALLBACK` warning when measured audio is absent.
6. Approval command omitted from non-approvable packs.
7. CLI-side approval rejection.
8. Versioned planner and schema.
9. Deterministic plan hash.
10. Legacy V1/V2 files preserved.
11. Separate counts for narration units, beats, shots, assets, and render variants.
12. Redacted review-bundle export.
13. Per-episode ZIP plus combined ZIP.
14. 16:9 and 9:16 render-variant concepts.
15. No image, audio, or video generation during planning/export.

If a V3.1 change conflicts with one of these guarantees, stop and resolve the architecture instead of weakening the guarantee.

---

# Current V3 defects that must be fixed

## P0 — Unsafe and incomplete entity extraction

The V3 bundles contained invalid entities such as:

```text
Napoleon’s → place
August → place
Roman → place
formation → army-or-formation
```

The Black Death episode extracted only four entities:

```text
1347
Europe
formation
1351
```

while missing most of its relevant places, actors, events, legal measures, and disease terminology.

This must be fixed at the extraction and validation layers.

### Required entity model

At minimum support:

```text
person
place
date
period
state-or-polity
army-or-formation
ethnic-or-social-group
organisation
event
disease-or-pathogen
law-or-policy
document
object-or-material-culture
trade-route
religious-institution
economic-concept
other
```

Use discriminated unions where type-specific fields differ.

Every accepted entity must include:

```text
id
canonicalName
surfaceForms
type
confidence
sourceUnitIds
normalisationMethod
evidence
```

Where applicable, include:

```text
aliases
dateRange
geographicParent
coordinatesOrGazetteerReference
historicalName
modernName
uncertainty
```

Do not invent precise coordinates if no verified source or repository mechanism supports them.

### Extraction pipeline

Implement a staged pipeline:

1. collect explicit entities from:
   - episode metadata;
   - normalized metadata;
   - canonical narration;
   - existing research/source files;
   - structured topic metadata;
2. derive candidates from narration;
3. classify candidates using the repository’s structured LLM abstraction if available;
4. normalise aliases;
5. validate deterministically;
6. reject invalid candidates;
7. record rejection reason;
8. retain uncertain candidates separately rather than promoting them.

### Deterministic validation rules

Reject or quarantine:

- pronouns;
- articles;
- conjunctions;
- generic sentence-openers;
- isolated months when they are only dates;
- possessive fragments;
- incomplete noun phrases;
- generic ontology words such as `formation`;
- adjectives without a referent such as `Roman`;
- person names classified as places;
- dates classified as places;
- malformed title fragments;
- duplicate entities differing only by punctuation or possessive suffix.

The system must explicitly record rejected candidates.

The following diagnostics must no longer remain empty when candidates were rejected:

```text
rejectedEntityCandidates
invalidEntityReasons
entityNormalisationEvents
entityTypeCorrections
```

### Required episode-level entity coverage

Do not hard-code episode-specific entities into shared logic.

However, regenerated artifacts must be manually checked to ensure the semantic extractor finds the major entities present in the narration.

At minimum verify the following are either:

- extracted correctly;
- deliberately represented through another valid entity;
- or documented as missing with an explicit reason.

#### Napoleon

Check for coverage of:

```text
Napoleon Bonaparte
Grande Armée
Russian Empire
Niemen River
Tsar Alexander I
Mikhail Kutuzov
Smolensk
Borodino
Moscow
Berezina River
France
Poland
Italy
Netherlands
Croatia
Spain
Portugal
Continental System
```

#### Fall of the Roman Empire

Check for coverage of major narration entities such as:

```text
Western Roman Empire
Eastern Roman Empire
Rome
Ravenna
Constantinople
Romulus Augustulus
Julius Nepos
Odoacer
Vandals
Goths
Visigoths
Ostrogoths
Huns
North Africa
Carthage
Alaric
Attila
```

Only require entities actually present in the canonical narration.

#### Black Death

Check for coverage of major narration entities such as:

```text
Black Death
Yersinia pestis
Messina
Sicily
Black Sea
Europe
Middle East
North Africa
Ragusa
England
Eastern Europe
Jewish communities
Statute of Labourers
1347
1351
```

Only require entities actually present in the canonical narration.

### Acceptance criteria

- No known invalid entity examples survive.
- Rejected candidates are visible in diagnostics.
- Entity coverage is materially richer and episode-specific.
- Map and diagram planning use accepted entity IDs, not raw guessed strings.
- Entity confidence is not a single constant across every entity.

---

## P0 — Generic visual-purpose templates

The V3 plans used variants of:

```text
Show the viewer the historical significance of “...” without extending its claim.
```

and:

```text
Explain how ... shapes the narrated outcome.
```

These are placeholders, not documentary direction.

### Required visual-purpose contract

Every semantic beat must include:

```text
viewerUnderstanding
visualPurpose
coveredNarrationUnitIds
claimIds
editorialRole
importance
```

Recommended optional fields:

```text
visualQuestion
contrast
beforeState
afterState
causalMechanism
emotionalRegister
historicalUncertainty
```

### Purpose quality requirements

A valid purpose must:

- describe what the viewer should understand;
- be grounded in the narration;
- be specific to the episode;
- not merely quote the narration;
- not refer to implementation mechanics;
- not use a generic template with only interpolated narration;
- preserve the claim scope;
- support downstream media planning.

Examples:

```text
Establish the multinational scale of the Grande Armée before the campaign begins to fragment.
```

```text
Contrast Napoleon’s tactical possession of Borodino with his strategic failure to destroy the Russian army.
```

```text
Show how the loss of North African tax revenue weakened the western empire’s ability to finance its armies.
```

```text
Explain how maritime trade networks carried plague into Mediterranean ports before inland spread accelerated.
```

### Purpose-generation architecture

Use a structured semantic-planning stage.

Recommended approach:

1. group narration units;
2. identify narrative function;
3. identify claims;
4. identify transformation, contrast, or explanation;
5. generate a concise viewer-understanding statement;
6. validate against generic patterns;
7. retry or fail when output remains generic.

### Generic-purpose validator

Add deterministic detection for:

- exact known templates;
- high textual overlap with narration;
- repeated leading phrases across most beats;
- placeholder tokens;
- beat numbers embedded in the purpose;
- `historical significance` used without concrete explanation;
- `shapes the narrated outcome`;
- `without extending its claim`;
- `clarify the complete narration unit`;
- purpose identical to or mostly copied from narration.

Add diagnostics:

```text
purposeTemplateFrequency
purposeSimilarityClusters
purposeNarrationOverlap
genericPurposeBeatIds
```

Block production approval when generic purposes exceed a strict threshold.

### Acceptance criteria

- No known generic purpose templates remain.
- At least 90% of beats have episode-specific purpose text.
- Purposes for anchor beats are clearly distinct from connective beats.
- Duplicate or near-duplicate purposes are diagnosed.
- Purpose confidence is not a universal constant.

---

## P0 — Non-semantic maps

V3 map states had:

```text
routes: []
actorEntityIds: []
dateOrPeriod: "Narrated period"
geographicExtent: "Validated narration geography"
```

This is not a meaningful map state.

### Required map-domain model

Use typed map masters and states.

A map master should include:

```text
id
title
mapKind
baseGeographicExtent
projectionOrLayoutIntent
supportedAspectRatios
sourceStatus
```

Map kinds may include:

```text
campaign
migration
territorial-change
trade-network
disease-spread
political-context
battlefield
retreat
supply-network
regional-context
```

A map state must include:

```text
id
masterId
title
dateOrPeriod
geographicExtent
locationEntityIds
actorEntityIds
narrationUnitIds
claimIds
labels
legend
camera
confidence
uncertaintyDisclosure
```

Where relevant, include:

```text
routes
movements
frontiersOrZones
territorialExtent
supplyLines
depots
depletedAreas
outbreakNodes
spreadEdges
tradeConnections
battlePositions
```

### Typed route/movement unions

Do not store generic purpose text in route fields.

Example union:

```text
army-advance
army-retreat
migration
maritime-trade
overland-trade
disease-transmission
supply-route
political-boundary-change
territorial-loss
siege-or-capture
```

Every route requires:

```text
id
type
fromEntityId
toEntityId
actorEntityIds
dateOrPeriod
direction
label
claimIds
confidence
```

Allow multi-stop paths only through an explicit ordered structure.

### Validation

Reject:

- map states with no valid place entities;
- empty routes when the beat explicitly concerns movement;
- raw entity IDs rendered as labels;
- person entities used as geographic locations;
- dates used as locations;
- generic placeholder extents;
- generic placeholder periods;
- movement claims with no actor;
- route endpoints of the same invalid entity;
- map titles copied from generic purpose templates;
- maps whose locations do not support the covered narration.

### Episode-specific review expectations

Do not hard-code these states, but regenerated plans should meaningfully support the narration.

#### Napoleon likely needs map sequences for:

```text
crossing the Niemen
initial strategic context
advance toward Smolensk
Borodino and Moscow
attempted south-west retreat
return over devastated route
Berezina crossing
survivors leaving Russia
```

#### Fall of Rome likely needs map sequences for:

```text
western/eastern imperial division
frontier pressures and migrations
loss of North Africa
territorial contraction
Rome/Ravenna/Constantinople political context
476 and the survival of the eastern empire
```

#### Black Death likely needs map sequences for:

```text
Black Sea and Mediterranean maritime transmission
arrival at Messina/Sicily
spread through Europe
Middle East and North Africa coverage
regional waves over time
```

Only include states supported by the narration.

### Acceptance criteria

- Movement narration creates typed routes or explicit non-route justification.
- Map states use accepted entities.
- At least one actor appears where actor-driven movement is narrated.
- Labels are human-readable.
- Dates/periods are specific enough for review.
- Maps differ semantically across episodes.

---

## P0 — Placeholder diagrams

V3 diagrams used:

```text
Narrated condition
Narrated outcome
contributes to
```

for almost every topic.

### Required diagram model

Support typed diagram masters and states.

Diagram kinds:

```text
causal-chain
feedback-loop
logistics-flow
political-relationship
fiscal-military-cycle
disease-transmission
demographic-impact
labour-market-shift
timeline
comparison
hierarchy
process
attrition
system
data-summary
```

Diagram nodes must include:

```text
id
label
kind
entityIds
claimIds
description
```

Diagram edges must include:

```text
id
fromNodeId
toNodeId
relation
label
claimIds
confidence
```

### Diagram quality requirements

- Nodes must be domain-specific.
- Edges must express a real relationship.
- Labels must not be generic placeholders.
- The graph must explain the narration.
- Diagram structure must differ by concept.

### Required validators

Reject:

```text
Narrated condition
Narrated outcome
contributes to
placeholder
node 1
node 2
```

unless those phrases appear in a test fixture explicitly testing rejection.

Reject diagrams with:

- duplicate generic nodes;
- missing edge endpoints;
- nodes not grounded in claims or narration;
- all diagrams sharing identical structure and labels;
- no explanatory advantage over a normal image.

### Acceptance criteria

- Napoleon logistics diagram uses actual logistics concepts.
- Roman fiscal/political diagrams use actual institutions or causal relations.
- Black Death transmission/demographic diagrams use actual epidemiological or social concepts.
- Diagram semantics are visible in the approval pack.

---

## P1 — Fake multi-shot anchors

V3 anchor sequences often split one asset and one purpose across two time ranges.

### Required editorial-shot model

Every shot must include:

```text
id
sequenceId
beatId
editorialFunction
assetIntentId
narrationUnitIds
startMs
endMs
compositionIntent
cameraOrMotionIntent
transitionIntent
```

`editorialFunction` may include:

```text
establish
orient
explain
contrast
reveal
detail
evidence
reaction
transition
resolve
callback
```

### Multi-shot validation

A multi-shot anchor sequence is valid only if at least two shots differ meaningfully in one or more of:

- editorial function;
- asset intent;
- composition;
- map/diagram state;
- camera motion;
- evidence type;
- temporal perspective;
- scale.

Splitting time alone is not sufficient.

Add validation:

```text
duplicateShotPurpose
duplicateShotAsset
anchorSequenceSemanticDiversity
```

Warn or reject when an anchor sequence is only a duration split.

### Acceptance criteria

- Major anchor beats include genuinely different shot functions.
- Connective beats may intentionally use one shot.
- Shot count is not increased merely to satisfy a target.
- Asset reuse remains possible where editorial treatment differs.

---

## P1 — Shallow media selection

V3 overcorrected toward `archival-art`, with nearly constant selection reasons and confidence.

### Required media-decision model

Every media decision must include:

```text
beatId
selectedMediaType
selectionReason
alternativesConsidered
evidenceAvailability
historicalAuthority
productionCostClass
reuseOpportunity
confidence
```

Supported media taxonomy should include:

```text
cinematic-reconstruction
archival-art
archival-photograph
portrait
historical-map
animated-map
document
quotation-card
material-culture
location-or-terrain
diagram
data-graphic
timeline
title-or-chapter-card
```

### Selection logic

Media selection must consider:

- claim type;
- whether direct evidence exists;
- period;
- need for geographic explanation;
- need for causal explanation;
- emotional versus analytical function;
- available research assets;
- production budget;
- continuity;
- asset reuse;
- uncertainty;
- aspect-ratio viability.

Do not use an index cycle or universal fallback.

### Evidence-aware rules

Examples:

- use maps for geographic movement;
- use diagrams for causal mechanisms;
- use portraits for named individuals when contextually useful;
- use documents or quotation cards when the narration references policy, decree, chronicler, law, testimony, or written evidence;
- use material culture for weapons, coins, tools, armour, religious objects, medical practice, trade goods;
- use archival art only when it meaningfully represents the subject;
- use cinematic reconstruction when no direct visual evidence exists and the scene benefits from reconstruction;
- label reconstruction honestly.

### Media diversity validation

Add diagnostics:

```text
dominantMediaShare
mediaReasonSimilarity
mediaConfidenceDistribution
evidentiaryMediaShare
reconstructionShare
archivalSearchIntentCount
mediaFallbackCount
```

Warnings must trigger for:

- one media type dominating without strong episode-specific justification;
- all reasons being near-identical;
- all confidence values being identical;
- no maps in movement-heavy narration;
- no diagrams in causal-heavy narration;
- no portraits/documents/material culture despite relevant named or institutional content;
- no reconstruction where ancient/medieval scene visualisation would reasonably require it.

Do not enforce arbitrary equal distribution.

### Acceptance criteria

- The three regenerated episodes have visibly different media profiles.
- Selection reasons are specific.
- Confidence values vary based on evidence.
- Archival-art dominance is justified or reduced.
- Reconstruction is available and used where appropriate.
- Documentary and evidentiary media remain clearly distinguished from reconstruction.

---

## P1 — Mechanical claim extraction

V3 claims were uniformly:

```text
kind: factual
confidence: 0.72
sourceStatus: unresolved
```

### Required claim taxonomy

Support:

```text
factual
causal
interpretive
quantitative
chronological
geographic
comparative
disputed
uncertain
rhetorical
```

Not every narration sentence needs a claim.

Every claim must include:

```text
id
text
kind
unitIds
confidence
historicalUncertainty
sourceStatus
sourceReferenceIds
```

Optional:

```text
alternativeInterpretations
quantifier
dateRange
geographicEntityIds
actorEntityIds
```

### Claim-quality requirements

- classify causal claims as causal;
- distinguish estimates from precise facts;
- identify explicit uncertainty;
- identify debated interpretations;
- avoid converting rhetorical bridge text into unsupported factual claims;
- avoid a universal confidence value;
- preserve unresolved source status honestly.

### Source/provenance status

Keep these distinct:

```text
unresolved
search-intent-created
candidate-source-found
resolved
rights-unresolved
rights-cleared
```

A media intent is not a source.

### Validation

Warn when:

- all claims share one type;
- all claims share one confidence;
- all claims remain unresolved;
- disputed narration has no uncertainty marker;
- quantitative claims lack quantitative classification;
- geographic claims have no geographic entities;
- map/diagram states lack linked claims where claims exist.

### Acceptance criteria

- Claim distributions differ by episode.
- Uncertainty is represented.
- Claim links support media/map/diagram decisions.
- Claim-free beats are justified by role.

---

## P1 — Generic aspect-ratio adaptations

V3 repeatedly used generic fields such as:

```text
claim-bearing subject
primary subject
vertical recompose
```

### Required ratio-planning model

For every shot or asset intent, produce media-specific plans for:

```text
16:9
9:16
```

Each plan must include:

```text
strategy
focalRegion
protectedSubjects
cropTolerance
textSafeZones
labelPriority
cameraAdjustment
requiresIndependentRender
reason
```

Where possible, include explicit subject/entity IDs.

### Media-specific requirements

#### Maps

Specify:

- portrait geographic extent;
- label priority;
- whether the route is reoriented;
- whether states are split into sequential panels;
- legend placement;
- camera movement.

#### Diagrams

Specify:

- horizontal versus stacked graph;
- node order;
- edge routing;
- label wrapping;
- whether independent render is mandatory.

#### Portraits

Specify:

- headroom;
- face-safe crop;
- contextual object preservation;
- caption placement.

#### Archival art

Specify:

- focal figure or region;
- pan-and-scan path;
- protected composition;
- whether a full-frame intro precedes detail crop.

#### Documents

Specify:

- page region;
- text-highlight area;
- legibility strategy;
- translation overlay;
- independent crop.

#### Reconstruction

Specify:

- subject blocking;
- foreground/background priorities;
- negative space;
- independent vertical composition where necessary.

### Validation

Reject or warn when:

- all assets use the same focal-region string;
- all 9:16 plans use the same strategy;
- protected subjects are generic placeholders;
- map label priority is absent;
- dense diagrams are marked shared-center-safe without justification;
- required independent renders are missing.

### Acceptance criteria

- Ratio plans are media-specific.
- Map and diagram vertical strategies are explicit.
- Generic placeholder terms are absent.
- Render-variant counts remain separate from shot counts.

---

## P1 — Approval-pack incompleteness

The V3 Markdown pack does not surface enough semantic information.

### Required approval-pack sections

Render:

1. episode identity;
2. narration revision;
3. schema/planner version;
4. plan hash;
5. reviewability;
6. production approval eligibility;
7. blocking errors;
8. warnings;
9. timing source and reconciliation;
10. narration coverage;
11. chapter overview;
12. anchor sequences;
13. count semantics;
14. semantic beat summary;
15. shot-sequence summary;
16. media profile;
17. media-selection reasons;
18. entity extraction summary;
19. rejected entity diagnostics;
20. claims by kind and source status;
21. map masters and states;
22. routes/movements summary;
23. diagram masters and states;
24. aspect-ratio strategy summary;
25. asset reuse and production budget;
26. semantic quality diagnostics;
27. unresolved limitations;
28. available commands.

Do not dump enormous JSON into Markdown.

Use concise summaries and tables.

### Semantic red flags section

Add an explicit section that lists:

```text
generic visual purposes
invalid/rejected entities
map states without routes where movement is narrated
placeholder diagrams
duplicate multi-shot anchors
dominant media warnings
uniform confidence warnings
generic ratio strategies
unsourced claim percentage
```

### Acceptance criteria

A human reviewer should be able to reject the plan without opening JSON.

---

# V3.1 architecture requirements

## Schema and planner versions

Introduce explicit new versions, for example:

```text
history-visual-plan.v3.1
history-visual-planner.v3.1.0
```

Follow repository versioning conventions.

Do not overwrite V3 artifacts.

Preserve V1, V2, and V3 packs.

## Hash inputs

Ensure the V3.1 plan hash includes:

- narration revision;
- timing source;
- entity records;
- rejected-entity policy version;
- claims;
- semantic beats;
- visual purposes;
- editorial roles;
- importance;
- shot sequences;
- asset intents;
- media decisions;
- map masters/states;
- diagram masters/states;
- aspect-ratio adaptations;
- schema version;
- planner version;
- planner configuration;
- semantic-validator version.

Exclude timestamps and absolute paths.

## Caching

Do not reuse V3 semantic caches as V3.1 results unless they are explicitly version-compatible.

Preserve legacy artifacts.

Use planner/schema version in cache identity.

## Determinism

All deterministic post-processing and hash generation must be stable.

LLM stages must preserve their structured output artifacts or deterministic cache keys so a plan can be audited.

---

# Testing requirements

The previous implementation did not complete the full property/golden/cross-genre test suite.

This task must complete it.

## Cross-genre characterization tests

Before shared changes, capture and preserve behaviour for:

```text
horror/Dark Truth
math education
veronicaBenini
generic auto-genre
```

Do not regenerate or invalidate their existing episodes.

History-specific semantics should stay in history packages/profile code where possible.

Shared changes must be additive and opt-in.

## Unit tests

Add tests for:

### Entity extraction

- `Napoleon’s` rejected or normalised to `Napoleon Bonaparte`;
- `August` classified as date/period context, not place;
- `Roman` not accepted as a standalone place;
- `formation` rejected as a generic ontology word;
- pronouns rejected;
- aliases merged;
- possessive suffixes normalised;
- rejected diagnostics populated;
- confidence distribution not constant;
- incomplete candidate phrases rejected.

### Visual purposes

- known generic templates rejected;
- high narration overlap detected;
- repeated purpose prefix detected;
- beat-specific purpose accepted;
- anchor purpose differs from connective purpose;
- placeholder retry/failure path tested.

### Maps

- movement narration requires route or explicit justification;
- place entities required;
- person-as-place rejected;
- raw entity IDs not rendered as labels;
- route endpoints validated;
- actor required where appropriate;
- specific dates accepted;
- placeholder periods rejected;
- route claim links validated;
- disease-spread route type tested;
- territorial-change state tested.

### Diagrams

- generic nodes rejected;
- generic edge rejected;
- domain-specific causal chain accepted;
- feedback loop accepted;
- disease transmission accepted;
- graph references validated;
- duplicate structure warning tested.

### Multi-shot anchors

- time-only split rejected;
- semantically distinct shots accepted;
- same asset with distinct crop/function accepted;
- identical duplicate shots warned;
- connective one-shot beat accepted.

### Media selection

- map chosen for geographic movement;
- diagram chosen for causal explanation;
- portrait considered for named person;
- document/quotation intent considered for laws/policies/testimony;
- reconstruction allowed for non-documented scenes;
- dominant media warning;
- identical reason warning;
- constant confidence warning;
- episode-specific selection differences.

### Claims

- causal claim classified correctly;
- quantitative claim classified correctly;
- disputed claim carries uncertainty;
- rhetorical sentence not forced into factual claim;
- confidence varies;
- unsourced remains explicit;
- source intent is not resolved provenance.

### Aspect ratio

- map portrait layout;
- stacked diagram;
- portrait face-safe crop;
- document detail crop;
- archival art pan-and-scan;
- reconstruction independent composition;
- generic placeholders rejected;
- render variants do not increase semantic shot count.

### Approval pack

- semantic red flags rendered;
- no approval command for blocked plan;
- warnings rendered;
- map routes visible;
- diagram nodes visible;
- rejected entities visible;
- test summary included.

## Property-based tests

Use the existing property-test stack if present.

Cover:

- every accepted entity references existing narration units;
- rejected entities never appear in map locations;
- every route endpoint references a valid place entity;
- every graph edge references existing nodes;
- timings are monotonic and non-overlapping;
- every narration unit is covered exactly once unless explicit overlap is supported;
- no render variant changes semantic shot count;
- deterministic hashes remain stable;
- semantic changes modify hashes;
- timestamp-only changes do not modify hashes;
- every map state belongs to an existing master;
- every diagram state belongs to an existing master;
- every shot references an existing beat and asset intent;
- every claim link references an existing claim.

## Golden fixtures

Add compact golden fixtures for:

1. Napoleon-style campaign episode;
2. Roman political/territorial episode;
3. disease-spread episode;
4. valid multi-shot anchor;
5. invalid generic-purpose plan;
6. invalid entity/map plan;
7. valid stateful campaign map;
8. valid disease-spread map;
9. valid causal diagram;
10. reviewable but non-approvable timing-conflict pack;
11. legacy V3 pack;
12. V3.1 bundle manifest.

Assert semantic fields, not volatile prose formatting alone.

## Full validation

Run:

```text
format
lint
typecheck
unit tests
property tests
golden tests
CLI tests
bundle export tests
cross-genre characterization tests
```

If the repository’s complete global suite is too large or contains unrelated existing failures:

1. run the complete relevant workspace/package suites;
2. run all changed-package tests;
3. run cross-genre characterization suites;
4. document unrelated pre-existing failures precisely;
5. do not claim “full suite passed” unless it did.

---

# Implementation sequence

## Phase 0 — Baseline

1. Resolve the canonical paths for all three episodes.
2. Locate V3 artifacts and implementation reports.
3. Run current relevant tests.
4. Parse the three existing V3 bundles.
5. Record the observed defect counts:
   - invalid entities;
   - rejected candidate count;
   - generic-purpose rate;
   - map route count;
   - diagram generic-node count;
   - duplicate anchor count;
   - dominant media share;
   - identical media-reason rate;
   - identical confidence rate;
   - generic ratio-strategy rate.
6. Add regression fixtures before modifying behaviour.

## Phase 1 — Entity and claim remediation

Implement the typed extraction, normalisation, rejection, diagnostics, and claim taxonomy.

Do not continue to semantic map planning until entity tests pass.

## Phase 2 — Semantic beat purposes

Implement concrete viewer-understanding and visual-purpose generation plus generic-template validation.

Do not continue if generated fixtures still exceed the allowed generic-purpose threshold.

## Phase 3 — Map and diagram semantics

Implement typed map routes/states and domain-specific diagram graphs.

Validate episode-agnostic behaviour through campaign, imperial-territorial, and disease-spread fixtures.

## Phase 4 — Editorial shot sequences

Implement genuine multi-shot anchors and semantic shot diversity.

Preserve intentional asset reuse.

## Phase 5 — Evidence-aware media selection

Implement context-specific media decisions, evidence availability, confidence variation, and diversity diagnostics.

## Phase 6 — Aspect-ratio remediation

Implement media-specific 16:9 and 9:16 adaptations.

## Phase 7 — Approval pack

Expose semantic details and red flags in the human-readable pack.

## Phase 8 — Tests and audit

Complete unit, property, golden, CLI, bundle, and cross-genre tests.

## Phase 9 — Regenerate V3.1 plans

Regenerate the three episodes using complete canonical narration.

Do not modify the scripts.

Do not generate images, audio, or video.

Use measured audio only when a revision-compatible immutable artifact exists.

Otherwise retain:

```text
TIMING_ESTIMATE_FALLBACK
```

Retain truthful duration conflicts.

## Phase 10 — Automated artifact lint

Before packaging, run a V3.1 semantic artifact linter.

The linter must fail packaging or mark the bundle failed if it finds critical issues.

Search and validate for at least:

```text
Show the viewer the historical significance of
without extending its claim
shapes the narrated outcome
Clarify the complete narration unit
Narrated condition
Narrated outcome
contributes to
Narrated period
Validated narration geography
claim-bearing subject
primary subject
formation
```

Interpret `formation` contextually. It may be valid inside a descriptive sentence but must not survive as an unsupported standalone entity.

Also detect:

- map states with no routes when movement is narrated;
- all-empty actor arrays in movement maps;
- all confidence values identical;
- all media reasons identical;
- generic purpose rate above threshold;
- dominant media share without justification;
- duplicate anchor shots;
- missing rejected-entity diagnostics;
- raw entity IDs shown as labels;
- approval command present despite blocking errors;
- one map state for a geographically complex disease-spread episode without explicit rationale.

The linter output must be included in each review bundle.

## Phase 11 — Human-style self-review

Before final packaging, inspect the first, middle, and final chapters of each regenerated plan.

For each episode, manually inspect at least:

```text
3 normal beats
2 anchor beats
2 map states
2 diagram states where available
5 media decisions
5 aspect-ratio adaptations
entity summary
claim summary
```

If the artifacts remain generic, fix and regenerate.

Do not package known-bad output merely because schemas pass.

## Phase 12 — Export bundles

Create individual V3.1 review ZIPs and one combined ZIP.

Suggested filenames:

```text
history-youtube-history-10-video-story-pack-02-napoleons-invasion-of-russia-v3.1.zip
history-youtube-history-10-video-story-pack-03-fall-of-the-roman-empire-v3.1.zip
history-youtube-history-10-video-story-pack-04-black-death-v3.1.zip
chatgpt-review-history-approval-packs-v3.1.zip
```

Follow repository-safe filename conventions if dots are not allowed.

---

# Review-bundle contents

Each individual bundle must include:

```text
README.md
manifest.json
checksums.sha256
episode-metadata.json
canonical-script.md
visual-approval-pack.md
visual-plan.json
validation.json
diagnostics.json
artifact-lint.json
entities.json
rejected-entities.json
claims.json
media-decisions.json
map-masters.json
map-states.json
diagram-masters.json
diagram-states.json
aspect-ratio-plan.json
planner-config-snapshot.json
generation-command.txt
test-summary.md
self-review.md
```

Preserve native filenames where repository conventions differ.

## `README.md`

Include:

- episode ID and title;
- bundle purpose;
- V3.1 schema and planner version;
- narration revision;
- plan hash;
- timing source;
- requested target;
- planned duration;
- reviewability;
- approval eligibility;
- blocking errors;
- warnings;
- semantic-lint status;
- file index;
- recommended ChatGPT review checklist;
- statement that no generated media is included.

## `test-summary.md`

Must be self-contained.

Include exact commands and results for:

- changed package typecheck;
- changed package lint;
- relevant unit tests;
- property tests;
- golden tests;
- CLI tests;
- bundle integrity;
- cross-genre characterization tests.

Do not merely point to another report.

## `self-review.md`

Include:

```text
Episode summary
Entity coverage assessment
Generic-purpose rate
Map semantic assessment
Diagram semantic assessment
Anchor-sequence assessment
Media diversity assessment
Aspect-ratio assessment
Known limitations
Why the bundle is ready or not ready for ChatGPT review
```

## `artifact-lint.json`

Include:

```text
valid
errors
warnings
genericPurposeRate
invalidEntityCount
rejectedEntityCount
emptyMovementRouteCount
genericDiagramCount
duplicateAnchorShotCount
dominantMediaShare
identicalMediaReasonRate
constantConfidenceFlags
genericAspectRatioRate
approvalCommandSafety
```

---

# Approval eligibility rules

The generated review pack may remain reviewable while production approval is blocked.

Production approval must be blocked when any of the following apply:

- narration duration conflict beyond configured tolerance;
- immutable measured timing required but absent;
- incomplete narration coverage;
- generic-purpose rate above threshold;
- invalid accepted entities;
- map state semantic errors;
- placeholder diagrams;
- duplicate anchor sequences above threshold;
- unsupported aspect-ratio variants;
- corrupted graph references;
- semantic artifact-lint failure.

Do not automatically make all V3.1 packs production eligible.

The current three scripts are expected to remain non-approvable due to timing until measured audio or script-duration decisions are resolved.

That is acceptable.

The goal is semantically credible review output, not forced approval.

---

# Episode runtime policy

Do not rewrite any script.

Do not split an episode.

Do not alter target durations automatically.

Expected current provisional mismatches:

```text
Napoleon: materially over 10 minutes
Fall of Rome: substantially over 10 minutes
Black Death: slightly over 10 minutes
```

Retain full narration and report exact V3.1 timing.

For Black Death, do not remove the duration conflict merely because the estimate is close. Use configured tolerance and timing-source policy consistently.

---

# Cross-genre protection

Explicitly preserve:

```text
horror/Dark Truth
math education
veronicaBenini
generic auto-genre
```

History-specific:

- entity ontology;
- claim taxonomy;
- map routes;
- documentary media logic;
- provenance;
- semantic artifact lint;

should remain scoped to the history planner/profile unless a shared additive abstraction is clearly justified.

Do not change:

- non-history prompts;
- non-history default pacing;
- non-history media mix;
- non-history cache keys;
- non-history existing artifacts;
- non-history CLI defaults.

Any shared contract change requires characterization tests.

---

# Deliverables

## Code

- V3.1 schema and planner implementation;
- semantic entity extraction;
- claim taxonomy;
- semantic beat purposes;
- typed maps and diagrams;
- genuine multi-shot anchors;
- evidence-aware media decisions;
- media-specific ratio adaptations;
- semantic validators;
- artifact linter;
- improved approval renderer;
- bundle exporter updates.

## Tests

- unit;
- property;
- golden;
- CLI;
- bundle;
- cross-genre characterization.

## Regenerated artifacts

For all three episodes:

- V3.1 visual plan;
- V3.1 validation;
- V3.1 diagnostics;
- V3.1 approval pack;
- V3.1 review bundle.

## Combined bundle

One ZIP containing all three review bundles or unpacked bundle directories plus a comparison manifest.

## Implementation report

Create:

```text
docs/plans/history-visual-planner-remediation/09-v3.1-semantic-remediation-report.md
```

Include:

```text
Summary
Baseline V3 defect metrics
Architecture changes
Files changed
Schema/planner versions
Entity extraction changes
Claim changes
Purpose-generation changes
Map changes
Diagram changes
Shot-sequence changes
Media-selection changes
Aspect-ratio changes
Validation changes
Artifact-linter changes
Test coverage
Commands executed
Test results
Cross-genre results
Regenerated episode summaries
Before/after metrics
Bundle paths
Known limitations
Recommended next step
```

---

# Required before/after metrics

For each episode compare V3 versus V3.1:

```text
narration units
semantic beats
editorial shots
unique asset intents
render variants
accepted entities
rejected entity candidates
invalid accepted entities
claims by kind
unsourced claims
generic-purpose rate
map masters
map states
typed routes
map states with actors
diagram masters
diagram states
generic diagram count
anchor sequences
duplicate anchor sequences
dominant media type
dominant media share
media reason similarity
confidence distribution
generic aspect-ratio rate
semantic lint errors
semantic lint warnings
reviewable
approval eligible
blocking errors
warnings
```

Do not manipulate the counts to appear improved.

---

# Acceptance criteria

This task is complete only when:

## Safety

- No narration is clipped.
- Invalid plans cannot be approved.
- Blocked packs omit approval commands.
- Legacy artifacts remain preserved.
- Review ZIPs are redacted and checksum-valid.

## Entities

- Invalid V3 examples are gone.
- Rejected diagnostics are populated.
- Entity coverage is materially richer.
- Entity types are historically meaningful.
- Confidence values vary.
- Maps use validated place entities.

## Purposes

- Known templates are absent.
- Generic-purpose rate is below the configured threshold.
- Purposes are episode-specific.
- Anchor purposes are more substantial than connective purposes.

## Maps

- Movement-heavy states contain typed routes or justified absence.
- Actors are linked where appropriate.
- Dates/periods are specific.
- Geographic extents are meaningful.
- Labels are human-readable.
- Black Death has meaningful multi-region spread planning.
- Napoleon has meaningful campaign movement planning.
- Fall of Rome has meaningful territorial/political context planning.

## Diagrams

- No generic condition/outcome placeholders remain.
- Nodes and edges are domain-specific.
- Diagram kinds match the explanation.
- Graph references are valid.

## Shots

- Multi-shot anchors are semantically distinct.
- Time-only duplicate splits are rejected.
- Asset reuse remains explicit.
- Shot count is independent of ratio-variant count.

## Media

- Selection reasons are specific.
- Confidence varies.
- Media profiles differ across episodes.
- Archival art is not a universal fallback.
- Reconstruction is available and honestly labelled.
- Maps/diagrams/documents/portraits/material culture are selected where appropriate.

## Claims

- Claim kinds vary.
- Causal, quantitative, geographic, disputed, and uncertain claims are represented where present.
- Source status remains truthful.
- Uniform confidence is eliminated.
- Claims support maps, diagrams, and media decisions.

## Aspect ratios

- Strategies are media-specific.
- Placeholder focal-region terms are gone.
- Dense maps and diagrams have explicit portrait layouts.
- Independent render requirements are explicit.
- Semantic shot counts exclude ratio duplication.

## Approval pack

- Human-readable semantic summaries are present.
- Red flags are visible.
- A reviewer does not need to open raw JSON to identify major issues.
- Test summary is self-contained.

## Tests

- Relevant typecheck passes.
- Relevant lint passes.
- Unit tests pass.
- Property tests pass.
- Golden tests pass.
- CLI tests pass.
- Bundle integrity tests pass.
- Cross-genre characterization tests pass.
- Any unrelated global-suite failures are documented precisely.

## Bundles

- Three individual V3.1 ZIPs exist.
- One combined V3.1 ZIP exists.
- Checksums pass.
- Artifact lint runs and is included.
- Self-review is included.
- No image/audio/video binaries are included.

---

# Restrictions

- Do not modify narration scripts.
- Do not generate images.
- Do not generate audio.
- Do not generate video.
- Do not approve plans.
- Do not delete V1/V2/V3 artifacts.
- Do not hard-code episode-specific solutions into shared logic.
- Do not classify entities through capitalization alone.
- Do not fix semantic output only in Markdown.
- Do not hide generic semantics behind valid schemas.
- Do not use universal confidence values.
- Do not use a universal media-selection reason.
- Do not use universal aspect-ratio instructions.
- Do not package known-invalid semantic artifacts as successful output.
- Do not claim full acceptance if required tests were not run.

---

# Final Codex response

Return a concise evidence-based summary containing:

1. canonical episode paths;
2. schema/planner versions;
3. major V3.1 changes;
4. typecheck/lint/test results;
5. cross-genre characterization results;
6. V3 versus V3.1 metrics for each episode;
7. semantic artifact-lint status for each episode;
8. reviewability and approval eligibility for each episode;
9. blocking errors and warnings for each episode;
10. individual bundle paths;
11. combined bundle path;
12. implementation report path;
13. remaining limitations;
14. exact command to regenerate/export another episode.

If any acceptance criterion fails:

- state it explicitly;
- include diagnostic artifacts;
- do not describe the remediation as complete;
- do not suppress the failing condition.
