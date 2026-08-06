# Agentic Goal — History Visual Planner V3.3 Complete Remediation, OpenAI-Assisted Claims, and Approval-Pack Regeneration

## How to run this goal

Run this from the repository root in the same Codex session that has access to the current History implementation and generated V3.2 artifacts.

```text
/goal Implement every requirement and satisfy every acceptance criterion in @prompts/03-history-v3.3-complete-remediation-claims-provenance-and-regeneration-goal.md. Continue until the implementation, tests, regenerated approval packs, and final audit are complete, or until a concrete external blocker is proven with exact evidence. Do not stop after planning or after a partial implementation pass.
```

Use the actual path where this file is stored.

Do not paste the entire file into the `/goal` command. Reference it by path so the full specification remains available without exceeding the goal-command length limit.

---

# Operating mode

Work autonomously from the repository root.

Before modifying code:

1. inspect the repository architecture, package boundaries, History schemas, planner versions, generators, CLI commands, tests, fixtures, and prior V3/V3.1/V3.2 artifacts;
2. locate and read `history-approval-packs-v3.2-review-report.md` if present;
3. inspect the generated V3.2 bundles and reproduce the reported failures;
4. establish the existing test baseline, including any already failing unrelated tests;
5. record the exact commands used for the baseline.

Do not ask for confirmation for normal engineering decisions. Prefer the smallest coherent production-grade implementation that fits the existing architecture. Do not create a disconnected replacement pipeline merely to satisfy fixtures.

Do not report completion until all acceptance criteria in this goal have been checked against regenerated artifacts.

---

# Goal

Implement the next explicit History contract:

- `history-visual-plan.v3.3`
- `history-visual-planner.v3.3.0`
- `history-approval-pack.v3.3`

Fix every defect identified in the V3.2 review and regenerate complete, independently reviewable approval packs for:

1. `episodes/history-youtube-history-10-video-story-pack-02-napoleons-invasion-of-russia`
2. `episodes/history-youtube-history-10-video-story-pack-03-fall-of-the-roman-empire`
3. `episodes/history-youtube-history-10-video-story-pack-04-black-death`

Canonical episode inputs remain:

- `languages/script-en.md`
- `source/normalized-metadata.json`

The resulting workflow must be:

- type-safe;
- evidence-grounded;
- semantically defensible;
- deterministic after the research snapshot is frozen;
- resumable;
- observable;
- auditable;
- approval-safe;
- suitable for 16:9 and 9:16 production;
- isolated from unrelated genres.

Do not approve or render final production video merely because schemas parse or structural lint passes.

---

# Scope and compatibility

Default all behavioral changes to:

- History planning packages;
- History schemas and validators;
- History-specific generation workflows;
- History CLI integration;
- History approval-pack exporters;
- History-specific OpenAI/retrieval adapters;
- History tests and fixtures.

Any shared-package change must be:

- additive;
- backward compatible;
- opt-in for the History V3.3 profile;
- covered by characterization tests for existing consumers.

Preserve behavior and artifacts for:

- Horror / Dark Truth;
- Math Education;
- Veronica Benini;
- generic genres;
- all unrelated episodes.

Do not regenerate, migrate, invalidate, or rewrite non-History episodes.

Preserve V1, V2, V3, V3.1, and V3.2 schemas and parsers where compatibility requires them. Add V3.3 explicitly rather than mutating an older contract in place.

Do not weaken existing archive-safety, redaction, checksum, reference-integrity, or approval guarantees.

---

# Architectural rule: OpenAI assists semantic work; application code owns identity and approval

Use OpenAI calls for claim and evidence semantics. Do **not** use the model as the source of truth for identifiers, provenance, offsets, or approval.

## OpenAI should be used for

- extracting atomic historical claims from canonical narration;
- separating factual claims from rhetoric, transitions, opinions, and uncertainty statements;
- proposing normalized propositions;
- suggesting materiality;
- identifying claim type, entities, dates, places, quantities, causal language, and uncertainty;
- generating research queries;
- discovering candidate sources through a real retrieval tool;
- comparing persisted claims with persisted evidence fragments;
- returning schema-constrained evidence assessments;
- detecting contradictory or contested evidence;
- proposing semantically appropriate visual purposes;
- deciding whether a beat is suited to a map, timeline, diagram, archival image, quotation card, comparison card, or no generated visual;
- proposing map/diagram semantics and editorial treatments that application validators can verify.

## OpenAI must never authoritatively determine

- claim IDs;
- narration-unit IDs;
- character offsets;
- source-reference IDs;
- evidence-fragment IDs;
- arbitrary URLs, page numbers, quotations, locators, or bibliographic identities;
- final `sourceReferenceIds`;
- final `sourceStatus`;
- approval states;
- override validity;
- deterministic plan hashes;
- checksum manifests.

Model confidence is advisory metadata only. It must never independently permit approval.

## Required authority boundary

1. Deterministic code creates canonical narration units and exact text anchors.
2. OpenAI extracts claim proposals tied to canonical unit IDs and verbatim text.
3. Deterministic code aligns each proposal to canonical text and creates the claim ID.
4. A real retrieval adapter obtains source records and source content or reproducible evidence locators.
5. Deterministic code normalizes source identity and creates source/evidence IDs.
6. OpenAI compares claims only with persisted evidence fragments and returns structured assessments.
7. Deterministic, versioned application policy computes final claim provenance status.
8. Approval policy consumes only validated deterministic provenance results.
9. Human overrides are explicit, append-only, hash-bound audit records.

A schema-valid model response is not automatically a semantically valid or factually supported response.

---

# Workstream 1 — Repair canonical narration normalization and offsets

V3.2 narration offsets split words, point beyond `normalizedText`, and appear to have been calculated against a different representation.

Implement one canonical normalization and segmentation pipeline.

## Canonical representation

Define and document:

- normalization version;
- line-ending normalization;
- heading treatment;
- Markdown removal or preservation rules;
- whitespace collapsing/preservation rules;
- paragraph separators;
- Unicode normalization policy;
- punctuation normalization policy;
- spoken versus non-spoken content;
- offset encoding.

Because the runtime is TypeScript/JavaScript, use unambiguous UTF-16 code-unit offsets or clearly named equivalent fields:

```ts
interface TextSpanV3_3 {
  startUtf16: number;
  endUtf16Exclusive: number;
}
```

Do not expose ambiguous generic `start` and `end` fields without defining their encoding.

## Required invariants

For every narration unit:

- `0 <= startUtf16`;
- `startUtf16 < endUtf16Exclusive`;
- `endUtf16Exclusive <= normalizedText.length`;
- `normalizedText.slice(startUtf16, endUtf16Exclusive) === unit.text`;
- units are ordered;
- units do not overlap;
- any gaps between units contain only documented canonical separators or non-spoken content;
- boundaries must not split a word;
- the final unit must not exceed the canonical text;
- repeated text must still resolve to the correct occurrence;
- unit IDs must be deterministic.

Generate `normalizedText`, units, spans, hashes, and separators in one canonical pass. Do not normalize text again after calculating offsets.

## Claim alignment

OpenAI must return:

- canonical narration-unit ID;
- verbatim claim-bearing text copied from that unit;
- normalized proposition;
- semantic metadata.

Application code must locate the exact claim-bearing text inside the specified unit. Reject:

- text not present in the unit;
- ambiguous repeated matches without disambiguation;
- model-supplied offsets;
- cross-unit spans unless the schema explicitly supports them and deterministic code resolves them.

Claim IDs should be deterministic from stable inputs such as:

- episode ID;
- canonical narration hash;
- narration-unit ID;
- resolved UTF-16 span;
- normalized proposition hash.

## Tests

Add unit, integration, and property-based tests covering:

- blank lines;
- headings;
- Markdown emphasis;
- repeated whitespace;
- curly quotes;
- em dashes;
- apostrophes;
- German umlauts;
- accented names;
- non-BMP Unicode characters;
- repeated identical sentences;
- punctuation-only lines;
- paragraph boundaries;
- chapter boundaries;
- scripts with no trailing newline;
- all three canonical episodes.

Explicitly assert that the V3.2 examples can no longer occur, including mid-word slices such as:

- `lages were emptied. The`
- `vinces paid taxes. Tax`
- `e complex. Social changes`

---

# Workstream 2 — Replace the defective timing model and support 8–20 minute long-form episodes

The current planner inflates narration based on narration-unit structure and then masks the defect by replacing the original target with an inflated declared duration.

Fix the estimator and introduce a truthful duration contract.

## Duration policy

For the History long-form profile used by these episodes:

- preferred duration: `600_000 ms` when canonical metadata declares ten minutes;
- allowed long-form range: `480_000 ms` to `1_200_000 ms`;
- hard maximum: `1_200_000 ms`;
- never rewrite the preferred target to match an estimate;
- a valid episode may be longer than the preferred ten minutes;
- an episode inside the allowed range may pass timing even when it differs substantially from the preferred target;
- deviation from the preferred duration is editorial information, not automatically a production blocker;
- duration beyond 20 minutes is blocking unless an explicit profile-level override exists.

Make the range configuration-driven and stored in the plan snapshot. Do not silently hard-code it in unrelated genres.

Use distinct fields with non-overlapping meaning:

```ts
interface DurationPolicyV3_3 {
  profile: "history-long-form";
  preferredDurationMs: number | null;
  allowedMinDurationMs: number;
  allowedMaxDurationMs: number;
  hardMaxDurationMs: number;
  policyVersion: string;
}

interface TimingResultV3_3 {
  timingSource:
    | "provisional-text-estimate"
    | "measured-tts"
    | "measured-final-audio";
  normalizedWordCount: number;
  configuredWordsPerMinute: number;
  baseSpeechDurationMs: number;
  punctuationPauseDurationMs: number;
  paragraphPauseDurationMs: number;
  chapterPauseDurationMs: number;
  totalDurationMs: number;
  preferredDeltaMs: number | null;
  preferredDeltaPercent: number | null;
  withinAllowedRange: boolean;
  estimatorVersion: string;
}
```

Do not use `declaredDurationMs` as an overloaded substitute for target, estimate, or measurement. Migrate V3.3 to precise names.

## Estimation algorithm

- Base provisional speech duration on aggregate normalized spoken words and configured WPM.
- Do not apply minimum duration independently per sentence, claim, beat, or narration unit.
- Add punctuation, paragraph, section, and chapter pauses through bounded aggregate rules.
- Store each pause component separately.
- Ensure the same words with different sentence segmentation produce reasonably close estimates.
- Make WPM and pause policy configurable per narration/voice profile.
- Keep the algorithm deterministic.
- Prefer measured TTS duration once narration audio exists.
- Prefer measured final-audio duration once final narration processing exists.
- Do not use model calls to calculate duration.

## Approval behavior

- An estimate inside the allowed range may satisfy planning-time timing validation.
- Planning approval must state that timing is provisional when no measured audio exists.
- Final production approval must use measured TTS or measured final-audio duration, unless an explicit audited workflow policy permits estimated-only approval.
- `preferredDurationMs` deviation should be:
  - informational inside a configurable editorial tolerance;
  - a warning outside that tolerance but inside the allowed range;
  - not a blocker solely because the episode is 13 or 17 minutes;
  - blocking when outside the allowed range or hard maximum.
- Do not classify a legitimate 17-minute episode as invalid merely because the preferred target was ten minutes.
- Do not conceal an estimator defect by changing the preferred target.

## Regression tests

Include:

- all three canonical scripts;
- aggregate word-count expectations;
- configured WPM expectations;
- punctuation-heavy variants;
- many-short-sentences versus few-long-sentences;
- empty and malformed narration;
- estimator determinism;
- allowed-range boundaries at 8 and 20 minutes;
- measured-duration precedence;
- target preservation.

The Fall of Rome estimate must no longer become approximately 17 minutes merely because it contains more narration units. If measured narration genuinely lasts 17 minutes, that is acceptable and must be reported as measured rather than inferred from unit count.

---

# Workstream 3 — Implement OpenAI-assisted claim extraction correctly

Yes: use OpenAI for semantic claim extraction. Do it in a bounded, observable, schema-constrained workflow.

## Claim-extraction input

Provide the model:

- episode ID;
- canonical narration hash;
- canonical narration units with deterministic IDs;
- relevant local context;
- extraction policy version;
- materiality rules;
- output JSON schema.

Do not ask the model to return application IDs or offsets.

## Claim proposal schema

Implement a strict schema equivalent to:

```ts
interface ClaimProposalV3_3 {
  narrationUnitId: string;
  verbatimText: string;
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
    | "other";
  materialityRecommendation:
    | "material"
    | "non_material"
    | "uncertain";
  entities: Array<{
    text: string;
    role: string;
  }>;
  temporalQualifiers: string[];
  geographicQualifiers: string[];
  quantitativeQualifiers: string[];
  uncertaintyMarkers: string[];
  requiresMultipleSources: boolean;
  researchHints: string[];
}
```

Use the repository's schema library and strict Structured Outputs or strict function calling.

## Deterministic post-processing

Application code must:

- validate the narration-unit reference;
- locate `verbatimText`;
- reject unmatched text;
- deterministically resolve duplicate occurrences;
- create the claim span;
- deduplicate semantically identical claims without losing distinct contextual claims;
- assign deterministic claim IDs;
- apply deterministic forced-materiality rules;
- record model/provider/version, prompt hash, schema version, request ID, token usage, and retry count;
- persist the raw provider response only in secure diagnostics, not in public approval packs.

## Materiality policy

Always force a claim to material when it contains or drives:

- a date or period;
- a quantity, casualty figure, population estimate, economic figure, or percentage;
- a named person, group, state, institution, treaty, battle, location, or historical event;
- a causal or explanatory assertion;
- a disputed interpretation stated as fact;
- a direct or indirect quotation;
- a map route, endpoint, date, actor, movement, or territorial boundary;
- a diagram node or relationship;
- timeline text;
- on-screen factual labels;
- comparison cards;
- factual captions;
- generated imagery that depicts a specific factual event.

Allow `not_required` only for genuinely non-factual transitions, rhetorical framing, subjective tone, or purely editorial instructions.

## Batching and cost control

Do not make one extraction call per sentence or per claim.

- Batch coherent narration sections.
- Keep stable prompt prefixes to benefit from provider prompt caching where supported.
- Cache successful extraction results by narration hash, unit IDs, prompt version, schema version, provider, and model.
- Make calls idempotent and resumable.
- Limit concurrency.
- use exponential backoff with jitter;
- distinguish retryable provider failures from schema/semantic failures;
- expose cost/token telemetry.
- provide an offline fixture mode for tests.
- never require paid live calls in normal unit-test or CI runs.

---

# Workstream 4 — Retrieve and persist real sources

Implement a provider abstraction. OpenAI Responses API web search may be one retrieval provider, but domain logic must not depend directly on it.

## Retrieval requirements

The retrieval layer must return only real provider/tool results. Never accept a URL invented in free-form model text.

For OpenAI web search:

- accept URLs and citations only from tool-provided annotations/results;
- persist the retrieved citation metadata;
- fetch or otherwise resolve the cited source through an auditable retrieval step where technically and legally possible;
- reject inaccessible, malformed, or unverifiable source records;
- never mark a claim supported from model memory alone;
- never treat a search-result snippet alone as sufficient evidence for a material claim unless policy explicitly allows that source type and the snippet is persisted with a reproducible locator.

## Source quality policy

Implement configurable quality tiers such as:

1. primary documents and archival collections;
2. peer-reviewed scholarship and scholarly books;
3. universities, museums, national archives, and recognized research institutions;
4. reputable reference works and high-quality historical editorial sources;
5. discovery-only sources.

Discovery-only sources may generate leads but must not independently satisfy material-claim approval.

Do not use Wikipedia as the sole approval evidence for material historical claims. It may be used for discovery if the source policy permits it.

## Source record

Implement a versioned record equivalent to:

```ts
interface SourceReferenceV3_3 {
  id: string;
  canonicalIdentity: string;
  canonicalUrl: string | null;
  sourceType: string;
  qualityTier: number;
  title: string;
  authors: string[];
  publisherOrInstitution: string | null;
  publicationDate: string | null;
  edition: string | null;
  language: string | null;
  doi: string | null;
  isbn: string | null;
  archiveIdentifier: string | null;
  retrievalProvider: string;
  retrievedAt: string;
  snapshotHash: string | null;
  normalizedCitation: string;
}
```

Generate `id` deterministically from canonical persisted source identity. The model must never provide it.

Normalize:

- URL scheme/host casing;
- tracking parameters;
- fragments;
- DOI form;
- ISBN form;
- archive identifiers;
- bibliographic identity.

Avoid collapsing genuinely distinct editions or pages.

## Evidence fragments

Persist concise, copyright-safe fragments with reproducible locators.

```ts
interface EvidenceFragmentV3_3 {
  id: string;
  sourceReferenceId: string;
  locator: {
    kind: "page" | "section" | "heading" | "paragraph" | "timestamp" | "text-anchor" | "other";
    value: string;
  };
  excerpt: string;
  excerptHash: string;
  independentlyReproducible: boolean;
  retrievedAt: string;
}
```

Generate the fragment ID deterministically from source ID, locator, and excerpt hash.

Do not store or export excessive copyrighted text. Store only what is necessary for audit and entailment.

---

# Workstream 5 — Use OpenAI for evidence assessment, not final status

Once claims and evidence fragments are persisted, use OpenAI to assess semantic support.

## Assessment input

Provide only:

- one or more persisted claims;
- exact persisted evidence fragments;
- source-quality metadata;
- temporal/geographic/entity context;
- assessment policy;
- strict output schema.

The model may not cite content outside the supplied fragments.

## Assessment schema

```ts
interface ClaimEvidenceAssessmentV3_3 {
  claimId: string;
  evidenceFragmentId: string;
  assessment:
    | "supports"
    | "partially_supports"
    | "contradicts"
    | "irrelevant"
    | "ambiguous";
  supportedAspects: string[];
  unsupportedAspects: string[];
  contradictionAspects: string[];
  temporalAlignment:
    | "aligned"
    | "misaligned"
    | "not_applicable"
    | "unclear";
  geographicAlignment:
    | "aligned"
    | "misaligned"
    | "not_applicable"
    | "unclear";
  entityAlignment:
    | "aligned"
    | "misaligned"
    | "not_applicable"
    | "unclear";
  rationale: string;
  confidence: number;
}
```

The application must verify:

- claim ID exists;
- evidence fragment exists;
- assessment references only supplied records;
- no unsupported IDs;
- confidence is within range;
- required fields are complete;
- no model-authored source IDs or status fields are accepted.

## Deterministic final status

Compute final status in versioned application policy:

- `supported`
- `partially_supported`
- `contested`
- `contradicted`
- `unresolved`
- `not_required`

Recommended baseline rules:

### `supported`

- at least one valid supporting assessment from an acceptable source tier;
- no credible contradiction;
- all material aspects of the claim are supported;
- stricter requirements are satisfied for high-risk claims.

### `partially_supported`

- at least one material aspect remains unsupported;
- the unsupported aspect does not directly contradict the evidence;
- must block approval until the narration is narrowed, qualified, or covered by policy.

### `contested`

- credible sources disagree, or an interpretation has competing scholarly positions;
- narration must accurately express the uncertainty or dispute;
- approval may pass only when wording and evidence represent the dispute faithfully.

### `contradicted`

- credible evidence conflicts with a material claim;
- blocks approval.

### `unresolved`

- no adequate evidence;
- only discovery-tier evidence;
- inaccessible source;
- ambiguous or irrelevant fragments;
- blocks approval for material claims.

### `not_required`

- deterministic materiality policy classifies the claim as non-material;
- no factual visual depends on it.

## Higher-evidence claims

Require two independent acceptable sources or one exceptionally strong primary/scholarly source plus explicit uncertainty handling for:

- disputed causal claims;
- contested interpretations;
- precise casualty/population/economic estimates;
- claims with wide scholarly ranges;
- legendary or retrospective-attribution claims;
- claims whose falsity would materially change the episode thesis.

Do not manufacture false consensus. Prefer narration revisions such as “historians debate,” “estimates vary,” or “later tradition claimed” when supported by the evidence.

## Human overrides

Overrides must be:

- explicit;
- append-only;
- reviewer identified;
- timestamped;
- reasoned;
- scoped to specific claims;
- bound to narration, claim, source, evidence, plan, and policy hashes;
- automatically invalidated when bound inputs change.

Never silently downgrade a blocker.

---

# Workstream 6 — Separate nondeterministic research from deterministic generation

OpenAI and live web research are not guaranteed to return byte-identical results. Do not make a false determinism claim.

Implement two phases:

## Phase A — Research snapshot

Produces an immutable, versioned snapshot containing:

- canonical narration;
- claim proposals and deterministic claims;
- source records;
- evidence fragments;
- evidence assessments;
- final deterministic provenance statuses;
- provider/model metadata;
- prompt and schema hashes;
- retrieval timestamps;
- research snapshot hash.

Live calls are permitted only in this phase.

A refresh creates a new snapshot version/hash. It must not silently mutate the previous snapshot.

## Phase B — Deterministic planning and packaging

Consumes a fixed research snapshot and generates:

- entities;
- visual purposes;
- beats;
- shots;
- maps;
- diagrams;
- asset intents;
- media decisions;
- ratio plans;
- validation results;
- approval records;
- manifests;
- ZIP files.

Two clean Phase B runs from the same canonical inputs, configuration, and frozen research snapshot must produce byte-identical deterministic artifacts and archives.

Do not claim that two independent live web/OpenAI research runs must be byte-identical.

---

# Workstream 7 — Fix visual-purpose semantics and repetition

The V3.2 purpose classifier still produces cross-domain errors and repetitive text.

## Required semantic behavior

Each visual purpose must identify:

- the exact narration span;
- linked claim IDs;
- protected factual meaning;
- recommended visual modality;
- semantic justification;
- disallowed misleading treatments;
- required entities, dates, places, quantities, or uncertainty;
- evidence requirements.

Prevent classification errors such as:

- Napoleon’s Russian campaign described as a “Britain battle”;
- supply wagons and depots classified as feudal landholding;
- Black Death transmission classified as campaign manpower;
- pogroms classified as landholding obligations;
- Eastern Roman survival classified as military attrition without textual support.

## Modality choice

Choose beat-specific modalities from:

- archival image;
- historical artwork;
- map;
- timeline;
- diagram;
- document/quotation;
- comparison card;
- restrained atmospheric reconstruction;
- text-only transition;
- no generated visual.

Do not use one global fallback such as `diagramFallback: "map"`.

Every fallback decision must include:

- rejected modality;
- reason for rejection;
- selected fallback;
- semantic justification;
- linked claims/evidence.

## Repetition metrics

Export exact and semantic repetition diagnostics for:

- visual-purpose text;
- evidence instructions;
- camera instructions;
- transition instructions;
- shot structures;
- asset-treatment patterns.

Implement configurable thresholds. For these review packs:

- no exact duplicate visual-purpose instruction across unrelated beats unless explicitly marked intentional;
- semantic near-duplicate rate must be below a documented threshold;
- no single camera instruction may dominate the majority of shots;
- no two-instruction alternation may constitute the entire episode;
- repeated treatments must be justified by continuity rather than template convenience.

The validator must emit actionable diagnostics with beat and shot IDs.

---

# Workstream 8 — Restore and validate complete beat and shot plans

V3.2 exported only summaries. Restore the full review surface.

For each beat, export:

- beat ID;
- narration-unit/span bindings;
- start/end timing;
- linked claims and evidence;
- visual purpose;
- modality;
- asset intent;
- map/diagram/timeline/document reference;
- shot IDs;
- transition;
- continuity notes;
- uncertainty treatment;
- 16:9 plan;
- 9:16 plan.

For each shot, export:

- shot ID;
- beat ID;
- duration;
- framing;
- camera movement;
- subject;
- focal evidence;
- foreground/midground/background;
- permitted motion;
- prohibited misleading motion;
- transition;
- asset reuse reference;
- linked claims/evidence;
- ratio-specific adaptations.

Validate:

- contiguous timing where required;
- no negative/zero durations;
- no overlap unless explicitly supported;
- full planned-duration coverage;
- all references resolve;
- every factual shot is evidence-bound;
- every generated reconstruction is labelled internally with its uncertainty/depiction policy.

---

# Workstream 9 — Make maps semantically valid and evidence-bound

Export actual map masters and map states.

Represent separately:

- map purpose;
- base geography;
- time period;
- route type;
- origin;
- destination;
- moving actor;
- carrier or vehicle;
- transported object/pathogen, where applicable;
- affected area;
- territorial state;
- uncertainty;
- labels;
- linked claim IDs;
- linked evidence IDs.

## Validators

- maritime routes cannot be labelled overland;
- overland routes cannot be labelled maritime;
- a pathogen cannot be the merchant/carrier actor;
- ships must follow defensible maritime routes;
- endpoints must be geographically renderable;
- labels must match route semantics;
- broad endpoints such as “Black Sea → Europe” require explicit justification;
- static orientation maps must not be represented as movement routes;
- every route, label, actor, date, and boundary must be evidence-bound;
- unsupported precision must be rejected or visually qualified;
- map-driving unresolved claims block map approval.

Add regression fixtures for the Black Death contradiction where a maritime merchant route was labelled “Overland trade connection.”

---

# Workstream 10 — Make diagrams semantically valid and evidence-bound

Export diagram masters and states.

For every diagram:

- define diagram type;
- define exact question answered;
- bind every node to specific claims/evidence;
- bind every edge to claims/evidence that express or strongly entail that relationship;
- bind entities at node/edge level rather than copying a diagram-wide union;
- include time/geography applicability;
- include uncertainty;
- include rejected alternatives;
- include fallback decision.

Reject a diagram when:

- a node is not supported;
- an edge is inferred only from a generic template;
- causal direction is unsupported;
- unrelated entities are attached;
- the diagram ontology does not match the narration;
- a map, timeline, quotation, archival visual, or no diagram is more defensible.

Add regression fixtures preventing recurrence of:

- Napoleon revenue/institutional-capacity diagrams unsupported by campaign claims;
- Fall of Rome disease/demographic diagrams attached to Julius Nepos, Dalmatia, or 480 without evidence;
- Black Death fiscal-political diagrams derived from persecution or broad social renegotiation without an expressed relationship.

---

# Workstream 11 — Implement beat-specific 16:9 and 9:16 plans

A generic ratio policy is insufficient.

For every beat and factual graphic, export independent 16:9 and 9:16 composition records containing:

- protected subject;
- focal evidence;
- safe zones;
- crop strategy;
- reframing strategy;
- labels retained;
- labels removed;
- label priority;
- minimum text size;
- text-density result;
- map simplification;
- diagram simplification;
- conflict diagnostics;
- whether independent portrait rendering is mandatory.

Do not treat portrait output as a blind crop of 16:9.

Validate:

- protected subjects remain visible;
- critical labels remain readable;
- no essential route/edge/node is cropped;
- no text overlaps unsafe zones;
- portrait maps/diagrams are simplified rather than merely shrunk;
- every ratio record resolves to a beat and visual asset.

---

# Workstream 12 — Restore complete approval packs

Each episode pack must include at least:

- `README.md`
- `approval.md`
- `manifest.json`
- `checksums.sha256`
- canonical/redacted narration input or reproducible canonical-input artifact
- `plan.json`
- `validation.json`
- `planner-config.json`
- `research-snapshot.json`
- `claims.json`
- `source-references.json`
- `evidence-fragments.json`
- `claim-evidence-assessments.json`
- `provenance-summary.json`
- `entities.json`
- `rejected-entities.json`
- `visual-purposes.json`
- `beats.json`
- `shots.json`
- `asset-intents.json`
- `media-decisions.json`
- `map-masters.json`
- `map-states.json`
- `diagram-masters.json`
- `diagram-states.json`
- `aspect-ratio-plans.json`
- `quality-metrics.json`
- `test-summary.json`
- `determinism-report.json`

Adapt exact file names only when existing conventions provide a clearly better equivalent. Do not omit the information.

## `approval.md`

Include human-readable:

- episode identity and title;
- narration hashes;
- research-snapshot hash;
- plan hash;
- all four approval gates;
- blocker and warning summaries;
- duration preferred target, allowed range, estimate/measurement, and timing source;
- provenance counts;
- unsupported/partial/contested/contradicted claims;
- map/diagram semantic status;
- repetition metrics;
- test summary;
- deterministic-regeneration status;
- reviewer decision fields;
- override status and invalidation rules.

Do not mark editorial state fully reviewable when detailed shots, maps, diagrams, media decisions, or ratio plans are absent.

Use more precise states if necessary, for example:

- `not_generated`
- `blocked`
- `purpose_reviewable`
- `production_plan_reviewable`
- `approved`

Keep compatibility mappings explicit.

---

# Workstream 13 — Build a useful comparison manifest

The combined V3.3 bundle must expose one identified record per episode.

Include:

- episode ID;
- title;
- schema/planner versions;
- narration hash;
- research-snapshot hash;
- plan hash;
- manifest hash;
- structural state;
- editorial state;
- content state;
- production state;
- blockers and warnings;
- normalized word count;
- preferred duration;
- allowed duration range;
- timing source;
- total duration;
- preferred delta;
- within-range status;
- total/material claim counts;
- supported/partial/contested/contradicted/unresolved/not-required counts;
- material claims with adequate provenance;
- map count and semantic validation status;
- diagram count and semantic validation status;
- beat and shot counts;
- aspect-ratio validation status;
- exact and semantic repetition metrics;
- test status;
- deterministic-regeneration status.

Do not emit anonymous hash-only entries.

The top-level bundle must not collapse mixed episode states into a false aggregate approval. It may provide aggregate counts only when each episode state remains visible.

---

# Workstream 14 — Approval policy

Keep four independent gates:

- structural;
- editorial;
- content;
- production.

## Structural gate

Block on:

- schema failure;
- invalid offsets;
- invalid hashes;
- dangling references;
- invalid timing spans;
- unsafe archive entries;
- checksum failure;
- malformed source/evidence identity.

## Editorial gate

Block on:

- missing detailed beats/shots;
- missing ratio plans;
- invalid semantic modality;
- excessive unresolved repetition;
- unreviewable map/diagram states;
- misleading reconstruction treatment.

## Content gate

Block on:

- unresolved material claims;
- contradicted material claims;
- materially partial claims not reflected in narration;
- unsupported map/diagram/quotation/timeline labels;
- invalid or missing evidence chains;
- invalidated overrides.

## Production gate

Block on:

- any upstream gate;
- duration outside the allowed range;
- duration above 20 minutes;
- missing required measured narration duration;
- broken media references;
- unresolved 16:9/9:16 conflicts;
- failed required tests or deterministic packaging checks.

Do not let a model set any gate.

---

# Workstream 15 — OpenAI provider implementation quality

Implement OpenAI integration behind interfaces suitable for replacement or testing.

## Requirements

- official maintained SDK already used by the repository, or the repository's established HTTP abstraction;
- Responses API or current supported equivalent;
- strict schema outputs;
- explicit model configuration;
- no hard-coded secrets;
- environment-based credentials;
- request timeouts;
- retry policy with jitter;
- bounded concurrency;
- cancellation support;
- idempotent cache keys;
- usage/cost telemetry;
- request/response correlation IDs;
- redacted structured logs;
- circuit-breaker or failure-throttling behavior where existing architecture supports it;
- deterministic fixture/replay mode;
- provider error taxonomy;
- no API calls during ordinary unit tests;
- opt-in integration tests;
- fail-closed behavior when retrieval or evidence validation fails.

Store:

- provider;
- model;
- API feature/version where available;
- prompt version/hash;
- schema version/hash;
- request ID;
- timestamp;
- token usage;
- cached-token usage where exposed;
- retry count.

Do not store API keys, authorization headers, or sensitive raw payloads in approval packs.

---

# Workstream 16 — Tests and regression evidence

Add or update:

- unit tests;
- schema tests;
- property tests;
- integration tests;
- CLI tests;
- exporter tests;
- archive-safety tests;
- deterministic-generation tests;
- provider fixture tests;
- approval-policy tests;
- characterization tests for unrelated genres.

## Required fixture coverage

At minimum:

- the three canonical History scripts;
- timing segmentation invariance;
- narration offset integrity;
- duplicate claim text;
- ambiguous claim alignment;
- unsupported material claim;
- supported claim;
- partially supported claim;
- contested claim;
- contradicted claim;
- two-source requirement;
- invalid model-authored URL;
- inaccessible source;
- source canonicalization;
- evidence-fragment hashing;
- invalid entailment reference;
- human override invalidation;
- maritime/overland mismatch;
- pathogen/actor mismatch;
- unsupported diagram edge;
- valid map;
- valid diagram;
- no-diagram fallback;
- portrait simplification;
- purpose repetition;
- shot-treatment repetition;
- comparison-manifest completeness;
- approval.md completeness;
- nested ZIP equality;
- checksum coverage;
- unsafe ZIP paths;
- secret redaction.

## Existing failing tests

Do not dismiss unrelated failures without evidence.

If a test already fails before the change:

- capture the clean baseline command and output;
- prove the same failure exists before modification;
- prove the change does not worsen it;
- include it in `test-summary.json`;
- do not claim a fully passing repository suite.

If this change touches shared behavior, add characterization tests before modifying it.

Run all relevant package suites and the full repository suite when feasible. If the full suite cannot run due to a proven external dependency or environment limitation, report the exact command, failure, and scope of remaining uncertainty.

---

# Workstream 17 — Deterministic packaging and security

Retain and strengthen:

- canonical JSON serialization;
- stable file order;
- stable archive timestamps;
- stable permission bits;
- no traversal paths;
- no symlinks;
- no executable payloads;
- no local absolute paths;
- no secrets;
- complete checksums;
- nested ZIP byte equality;
- canonical hash documentation.

Two clean Phase B regenerations from the same frozen research snapshot must produce byte-identical:

- plans;
- review JSON;
- Markdown approval files where timestamps are excluded or fixed;
- manifests;
- checksums;
- nested ZIPs;
- combined ZIP.

Record the commands and resulting hashes in `determinism-report.json`.

---

# Required CLI/workflow behavior

Provide or update explicit commands for:

1. canonical narration normalization;
2. OpenAI-assisted claim extraction;
3. source retrieval;
4. evidence assessment;
5. deterministic provenance evaluation;
6. research-snapshot freeze;
7. deterministic visual planning;
8. validation;
9. approval-pack export;
10. clean deterministic regeneration;
11. combined comparison-pack export.

The workflow must be resumable. A failure in one episode must not corrupt completed snapshots for another episode.

Support:

- dry run;
- offline fixture mode;
- live research mode;
- refresh-source mode;
- reuse-frozen-snapshot mode;
- force regeneration;
- structured output;
- human-readable summary.

Never perform live research implicitly in a deterministic packaging command.

---

# Required regeneration

After implementation:

1. generate or refresh V3.3 research snapshots for all three episodes;
2. resolve every material claim where reliable evidence is available;
3. revise or qualify narration where evidence does not support the original wording, if the existing workflow permits narration modification;
4. keep unresolved claims blocked rather than inventing support;
5. freeze each research snapshot;
6. generate complete V3.3 plans;
7. validate all maps, diagrams, beats, shots, and ratio plans;
8. generate measured TTS duration if the repository workflow supports safe narration preflight;
9. otherwise mark timing as provisional and keep only the appropriate production gate blocked;
10. export each complete episode approval pack;
11. export the combined comparison bundle;
12. run two clean Phase B regenerations from the same frozen snapshots;
13. verify byte equality and all checksums;
14. audit the final bundles manually through scripts, not visual assumption;
15. produce a final implementation report.

Do not reuse V3.2 hashes or approval decisions after the underlying inputs change.

---

# Acceptance criteria

The goal is complete only when all of the following are true.

## Narration and timing

- [ ] Canonical normalized text and unit offsets are generated in one pass.
- [ ] Every unit slices exactly to its exported text.
- [ ] No offset splits a word.
- [ ] No offset exceeds text length.
- [ ] Offset encoding is explicit and tested.
- [ ] Claim spans resolve deterministically.
- [ ] Preferred ten-minute duration remains visible and is not overwritten.
- [ ] Allowed History long-form duration is 8–20 minutes.
- [ ] The estimator uses aggregate words/WPM rather than per-unit minimums.
- [ ] Pause contributions are separately reported and bounded.
- [ ] Napoleon/Fall of Rome are not inflated based on unit count.
- [ ] A genuine measured duration of up to 20 minutes is accepted.
- [ ] Timing source is explicit.
- [ ] Final production approval uses measured duration or an explicit audited policy.

## Claims and provenance

- [ ] OpenAI-assisted claim extraction uses strict schema.
- [ ] The model does not author IDs or offsets.
- [ ] Claim IDs are deterministic.
- [ ] Materiality has deterministic forced rules.
- [ ] Real sources are retrieved and persisted.
- [ ] Free-form model URLs are rejected.
- [ ] Source IDs are deterministic.
- [ ] Evidence fragments have reproducible locators and hashes.
- [ ] OpenAI assessments are limited to supplied evidence.
- [ ] Final source status is deterministic and versioned.
- [ ] All material claims are supported, accurately contested, revised, overridden, or blocked.
- [ ] Unresolved/contradicted material claims cannot pass content approval.
- [ ] Model confidence never authorizes approval.
- [ ] Human overrides are append-only and hash-invalidated.
- [ ] Tests and CI do not require live paid calls.

## Visual semantics

- [ ] Purpose classification regressions are fixed.
- [ ] No global map fallback substitutes for all diagrams.
- [ ] Every modality choice is beat-specific and justified.
- [ ] Actual beats and shots are exported.
- [ ] Every factual visual links to supported claims/evidence.
- [ ] Every map route, actor, endpoint, date, and label is evidence-bound.
- [ ] Maritime/overland contradictions are prevented.
- [ ] Every diagram node and edge is independently evidence-bound.
- [ ] Unsupported generic diagrams are rejected.
- [ ] Purpose and shot repetition metrics are exported and pass thresholds.
- [ ] Actual beat-specific 16:9 and 9:16 plans are exported and validated.

## Approval and packaging

- [ ] All required approval artifacts are included.
- [ ] `approval.md` contains sufficient review evidence.
- [ ] Editorial state is not overstated.
- [ ] Comparison records include episode IDs and all required status/quality fields.
- [ ] All JSON parses.
- [ ] All references resolve.
- [ ] All checksums pass.
- [ ] Nested ZIPs match expanded directories.
- [ ] No secrets, binaries, unsafe paths, symlinks, or local absolute paths exist.
- [ ] Two clean Phase B regenerations are byte-identical.
- [ ] Exact test commands and pass/fail/skip counts are exported.
- [ ] Any pre-existing failing tests are proven and reported accurately.
- [ ] Unrelated genres remain unchanged.

---

# Required final deliverables

Commit or leave in the workspace, following repository conventions:

1. V3.3 schemas and types;
2. canonical narration/offset implementation;
3. corrected duration policy and estimator;
4. OpenAI claim-extraction adapter;
5. retrieval provider abstraction and OpenAI web-search adapter if configured;
6. source/evidence persistence;
7. deterministic provenance policy;
8. semantic visual validators;
9. complete approval-pack exporter;
10. comparison-manifest exporter;
11. tests and fixtures;
12. CLI/workflow documentation;
13. three complete V3.3 episode approval packs;
14. one combined V3.3 comparison bundle;
15. determinism report;
16. final implementation report.

The final report must include:

- changed files grouped by workstream;
- architectural decisions;
- exact commands run;
- test results with counts;
- live OpenAI/retrieval calls performed;
- source-resolution counts;
- remaining unresolved claims;
- per-episode duration policy and timing result;
- per-episode approval state;
- artifact paths and hashes;
- deterministic-regeneration evidence;
- known limitations;
- any concrete external blockers.

Do not claim success when packs remain incomplete, when material claims remain silently unresolved, when only compact summaries are exported, or when production approval is inferred from structural validity.

---

# Definition of done

The implementation is done when the V3.3 bundles are complete enough for an independent reviewer to verify:

- what the narration says;
- where every claim appears;
- which source evidence supports it;
- how final provenance status was calculated;
- why each visual modality was selected;
- what every map route and diagram relationship means;
- how every shot is composed;
- how 16:9 and 9:16 differ;
- whether timing is estimated or measured;
- whether the episode is within the 8–20 minute History long-form range;
- which approval gate remains blocked and why;
- that deterministic artifacts reproduce from a frozen research snapshot.

If reliable evidence cannot be obtained for a material claim, preserve the blocker or revise the narration. Never invent provenance to make the pack pass.
