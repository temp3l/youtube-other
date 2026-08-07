# History V3.4 — Token-Efficient Remediation Goal

## Purpose

Fix every blocker identified in the independent V3.4 review while minimizing Codex token consumption, file churn, repeated analysis, and unnecessary regeneration.

This is a focused remediation pass. Do not redesign the History architecture, create V3.5, or repeat work already completed in V3.4.

The authoritative review findings are in:

```text
history-v3.4-independent-review-report.md
```

Copy that report into the repository under:

```text
reports/history-v3.4-independent-review-report.md
```

before starting, or use the findings repeated in this goal.

---

# Run command

From the repository root:

```text
/goal Implement every requirement and acceptance criterion in @prompts/08-history-v3.4-token-efficient-remediation-goal.md. Treat @reports/history-v3.4-independent-review-report.md as the defect specification. Make the smallest safe changes required to fix all V3.4 blockers. Do not redesign working contracts, do not perform live historical research, do not create a new major plan version, and do not regenerate unrelated genres. Work fixture-first, validate incrementally, then regenerate the four History approval packs once. Continue until complete or until a concrete external blocker is demonstrated with exact command output.
```

Recommended Codex configuration:

```toml
model = "gpt-5.6-terra"
model_reasoning_effort = "medium"
model_verbosity = "low"

approval_policy = "on-request"
sandbox_mode = "workspace-write"
```

Use high reasoning only if the focused regression tests cannot be satisfied safely at medium reasoning.

---

# Token-saving operating rules

1. Read only:
   - the independent review report;
   - current V3.4 schemas;
   - current V3.4 validators;
   - current V3.4 planners;
   - focused History tests;
   - one relevant fixture per defect.
2. Do not reread the whole repository.
3. Do not produce a long plan. Start with a concise defect-to-file map.
4. Do not create duplicate abstractions when an existing parser, validator, or artifact type can be extended.
5. Do not change public contracts unless required by a listed defect.
6. Prefer focused tests over full-suite runs until the end.
7. Do not regenerate approval packs after every change.
8. Regenerate test fixtures first; regenerate all four packs only after focused tests pass.
9. Do not call OpenAI, web search, source retrieval, or evidence assessment.
10. Keep `trusted-script` as the History default.
11. Do not modify Horror, Math, Veronica Benini, or generic genre behavior.
12. Do not add verbose comments, migration prose, or duplicate documentation.
13. Reuse existing V3.4 artifact names and schema versions wherever possible.
14. If a proposed visual cannot be validated safely, downgrade it to a safer modality instead of adding complex recovery logic.
15. Report only:
    - changed files;
    - tests;
    - regenerated bundles;
    - remaining blockers.

---

# Scope

Fix these exact areas:

1. temporal and quantitative qualifier classification;
2. geographic qualifier role consistency;
3. canonical entity typing and concept separation;
4. Napoleon diagram semantics;
5. timeline versus date-card handling;
6. misleading quotation/document states;
7. shot and asset-treatment repetition;
8. ratio-plan collision and label diagnostics;
9. real authority audit timestamps;
10. semantic validation diagnostics;
11. measured-timing production blocker handling;
12. deterministic ZIP timestamp reporting;
13. regeneration and verification of all four V3.4 packs.

Do not perform independent historical fact research.

---

# 1. Fix temporal and quantitative parsing

## Defects

Fall of Rome currently classifies years such as `235` and `476` as counts.

Franklin currently classifies day components such as `11` in `June 11` and `22` in `April 22` as counts.

Some timelines derive dates that are absent from `temporal-qualifiers.json`.

## Required implementation

Use one canonical History date/quantity parsing path.

Parsing order:

```text
full date
→ month/year
→ year range
→ standalone year
→ period
→ duration
→ percentage
→ measurement
→ count
```

A token span consumed by a temporal expression must not also become a quantity.

Required examples:

```text
Between 235 and 284
→ one temporal period or two year qualifiers
→ no count qualifiers

476
→ year
→ no count qualifier

June 11, 1847
→ full date
→ 11 is not a quantity

April 22, 1848
→ full date
→ 22 is not a quantity

105 survivors
→ count = 105
→ not a date
```

Ensure timeline generation consumes the same canonical temporal qualifiers rather than reparsing narration independently.

## Acceptance

- no year or day component is exported as a count;
- dates used by timelines exist in `temporal-qualifiers.json`;
- nested values such as `April 1848` and `1848` are deduplicated when they refer to the same event;
- focused regression tests cover Rome and Franklin examples.

---

# 2. Fix geographic qualifier roles

## Defect

Franklin exports Britain as a geographic `destination` while its entity semantic role is `origin`.

## Required implementation

Validate every `HistoryGeographicQualifier.role` against:

- the referenced entity mention;
- the claim proposition;
- map intent when applicable.

Do not silently preserve contradictory roles.

Allowed resolution:

1. correct the qualifier role deterministically;
2. reject the qualifier;
3. emit a validation blocker if ambiguity remains.

## Acceptance

- Britain is the origin for the Franklin departure claim;
- no geographic qualifier contradicts the referenced entity semantic role;
- a new validation diagnostic reports role mismatches.

---

# 3. Improve canonical entity typing

## Defects

Canonical entities still include weak entries such as:

```text
Exact
Taxes
People
Trade
Disease
Fleas
Survivors
```

Known institutions are often typed as `other`, including:

```text
The Roman Senate
The Roman Empire
The Eastern Roman Empire
The Grande Armée
The Church
```

## Required implementation

Separate:

```text
canonical entity mention
```

from:

```text
visual concept or ordinary noun
```

Do not promote ordinary nouns into canonical entities solely because they are capitalized at sentence start.

Normalize leading articles for type resolution while preserving verbatim text.

Required typing examples:

```text
Royal Navy → organization
Roman Senate → organization/institution
Roman Empire → state
Eastern Roman Empire → state
Grande Armée → military-unit
Church → organization/institution
Yersinia pestis → disease
HMS Erebus / HMS Terror → ship
```

Ordinary concepts such as taxes, trade, disease, survivors, fleas, or exactness may remain diagram concepts without becoming canonical entities.

## Acceptance

- sentence-start fragments such as `Exact` are rejected;
- ordinary nouns are not canonical entities without a valid typed reason;
- known states, institutions, armies, ships, and diseases receive suitable types;
- `rejected-entities.json` contains rejected proposals and reasons.

---

# 4. Rebuild or reject the Napoleon diagrams

## Defects

The current diagrams include invalid graphs such as:

```text
Exact → leads-to → Grande Armée
Moscow → associated-with → Kutuzov
```

## Required implementation

Add a compact diagram coverage validator.

For every diagram:

- each essential clause of `exactQuestion` must map to a node or edge;
- sentence fragments cannot become nodes;
- edges must answer the stated question;
- causal narration requires a causal/process relationship;
- generic `associated-with` cannot stand in for an explicit decision or consequence;
- unsupported semantic strengthening is prohibited.

### Required Napoleon outcomes

For the varying-army-size claim, either create a valid structure such as:

```text
reinforcements
detached units
desertion
capture
different return routes
        ↓
variation in army-size estimates
```

or select a safer non-diagram modality.

For Kutuzov and Moscow, either create a valid process such as:

```text
abandon Moscow
→ preserve Russian army
→ continue the war
```

with narration-bound wording, or select a safer modality.

## Acceptance

- the two invalid graphs no longer exist;
- every surviving diagram passes semantic coverage validation;
- invalid proposals fall back safely;
- diagram diagnostics identify missing clause coverage and meaningless edges.

---

# 5. Distinguish timelines from date cards

## Defects

Many exported timelines contain only one event.

Labels are truncated mid-word.

Franklin duplicates `April 1848` and `1848`.

## Required implementation

Add or reuse a `date-card` modality/state.

Rules:

```text
one isolated event
→ date-card

two or more related chronological events
→ timeline
```

Timeline labels must:

- be concise;
- end at word boundaries;
- preserve meaning;
- reference stable event IDs in ratio plans.

Deduplicate nested temporal expressions belonging to the same event.

## Acceptance

- one-event timelines are converted to date cards;
- surviving timelines contain at least two related events;
- no label ends mid-word;
- Franklin no longer emits duplicate nested dates for one event;
- ratio plans reference event IDs rather than truncated display strings.

---

# 6. Separate quotations, documents, and narration emphasis

## Defect

`document-states.json` uses `quotationText` for narration paraphrases.

Examples include:

```text
Napoleon waited for a political message that did not come.
Chroniclers wrote of abandoned relatives...
Searchers found graves, abandoned equipment...
```

These are not verified quotations.

## Required implementation

Use explicit state kinds:

```ts
type HistoryTextualVisualKind =
  | "quotation-card"
  | "document-card"
  | "narration-emphasis-card"
  | "summary-card";
```

Rules:

- `quotation-card` requires exact quoted text present in narration and explicitly identified as a quotation;
- `document-card` requires document metadata and actual document text or a clearly labelled summary;
- `narration-emphasis-card` may display narration text but must be labelled as narration;
- `summary-card` may display an editorial summary but must not use quotation marks.

Rename or replace ambiguous `quotationText` fields where required, keeping changes additive when possible.

## Acceptance

- no narration paraphrase is presented as a quotation;
- each textual visual has an explicit kind;
- validators block quotation cards without exact quotation status;
- review artifacts expose textual visual kind.

---

# 7. Resolve shot and asset-treatment repetition

## Current failing metrics

All four episodes fail:

- `assetTreatmentDuplicateRate`;
- `shotStructureDuplicateRate`;
- `dominantCameraRate`;
- `twoInstructionAlternationRate`.

## Required implementation

Do not add more random preset rotation.

Build a deterministic diversification pass using:

- beat purpose;
- modality;
- subject count;
- duration;
- information density;
- chronology;
- prior and next shot;
- asset reuse;
- whether the visual is explanatory, orienting, evidentiary, transitional, or emotional.

For each shot, derive:

- purpose-specific framing;
- subject-specific foreground/midground/background;
- camera behavior appropriate to the asset;
- transition appropriate to continuity;
- factual labels only when needed;
- beat-specific reconstruction policy.

Prevent identical generic triplets such as:

```text
wide contextual frame
slow lateral reveal
brief neutral dissolve
```

from dominating the episode.

Use deterministic selection; do not add paid OpenAI calls.

## Minimal acceptance thresholds

Use the existing configured thresholds. All must pass.

Additionally:

```text
twoInstructionAlternationRate < configured maximum
dominantCameraRate < configured maximum
shotStructureDuplicateRate < configured maximum
assetTreatmentDuplicateRate < configured maximum
```

Do not weaken thresholds to make the packs pass.

---

# 8. Improve 16:9 and 9:16 plan validation

## Defects

- `conflictDiagnostics = []` everywhere;
- `textDensityResult = "pass"` everywhere;
- some protected-subject and timeline strings are truncated;
- many ratio plans contain generic crop instructions only.

## Required implementation

For each visual state, compute actual ratio-specific planning inputs:

- retained artifact IDs;
- retained and removed labels;
- label priority;
- subject bounds or logical layout bounds;
- text footprint;
- collision result;
- crop risk;
- portrait reflow requirement;
- minimum font-size result;
- route/node/event simplification.

Use a diagnostic structure such as:

```ts
{
  evaluated: true,
  conflicts: [],
  result: "pass"
}
```

An empty list without `evaluated: true` must not imply that analysis occurred.

For maps, diagrams, timelines, and text cards, retain stable IDs rather than truncated labels.

## Acceptance

- every factual visual has an evaluated ratio plan;
- truncation occurs only at word boundaries;
- maps preserve explicit route and label priorities;
- diagrams preserve node and edge IDs;
- timelines preserve event IDs;
- text-density and collision results are computed rather than hard-coded.

---

# 9. Preserve real authority audit timestamps

## Defect

Trust and authority audit records use:

```text
1980-01-01T00:00:00.000Z
```

which is the deterministic build epoch, not the actual assertion time.

## Required implementation

Separate:

```text
audit event time
```

from:

```text
reproducible archive build time
```

Keep real append-only timestamps in:

- trust attestations;
- authority transitions;
- editorial re-attestations.

For deterministic bundles, choose one of:

1. include immutable audit records whose real timestamps are already persisted and therefore stable;
2. include a canonical audit snapshot hash plus the persisted audit record;
3. exclude volatile generation timestamps while retaining genuine event timestamps.

Do not rewrite an existing attestation time on regeneration.

## Acceptance

- no trust assertion uses the 1980 build epoch unless it genuinely occurred then;
- rerunning Phase B preserves the same persisted attestation time;
- authority-transition audit remains append-only;
- deterministic ZIPs still pass.

---

# 10. Add missing semantic diagnostics

Extend `validation.json` and approval summaries with diagnostics for:

```text
TEMPORAL_QUALIFIER_INVALID
QUANTITATIVE_QUALIFIER_INVALID
GEOGRAPHIC_ROLE_MISMATCH
ENTITY_TYPE_INVALID
DIAGRAM_CLAUSE_COVERAGE_INCOMPLETE
DIAGRAM_EDGE_SEMANTICS_INVALID
TIMELINE_TOO_FEW_EVENTS
TIMELINE_LABEL_TRUNCATED
TEMPORAL_DUPLICATE_NESTED
TEXTUAL_VISUAL_KIND_INVALID
QUOTATION_NOT_VERBATIM
RATIO_ANALYSIS_NOT_EVALUATED
AUDIT_TIMESTAMP_INVALID
```

Classify them into the correct gates.

Recommended gate impact:

- qualifier/entity contract violations → structural + content;
- invalid diagram semantics → content;
- one-event timeline or truncated labels → editorial;
- misleading quotation type → content;
- unevaluated ratio analysis → editorial/production;
- invalid audit timestamp → structural/audit blocker.

## Acceptance

The four regenerated packs must contain no unresolved error-level diagnostics from this list.

---

# 11. Timing and production gate

Do not synthesize measured timing.

Keep:

```text
TIMING_MEASUREMENT_REQUIRED
```

until measured TTS or final audio exists.

Ensure estimated timing remains visible and does not block structural review merely because it is provisional.

Production must remain blocked for missing measured timing.

Do not generate TTS, images, video, or YouTube output as part of this remediation.

---

# 12. Deterministic archive timestamp reporting

## Defect

The report records midnight UTC while ZIP metadata displays a DOS timestamp equivalent to 01:00 in the local environment.

## Required implementation

Record both:

```ts
{
  canonicalBuildEpochUtc: string;
  zipDosTimestamp: {
    year: number;
    month: number;
    day: number;
    hour: number;
    minute: number;
    second: number;
  };
  timezoneInterpretation: string;
}
```

Do not compare a timezone-aware UTC string directly with timezone-naive ZIP/DOS metadata.

## Acceptance

- determinism report matches actual archive metadata;
- first and second generation hashes match;
- file order, permissions, and timestamps are documented accurately.

---

# 13. Focused implementation order

Use this order to minimize tokens and reruns:

## Phase A — Parsers and validators

1. date/quantity parser;
2. geographic-role validator;
3. entity typing;
4. textual-visual kind validator;
5. diagram coverage validator;
6. timeline/date-card validator;
7. ratio evaluation validator;
8. audit timestamp handling.

Run focused tests only.

## Phase B — Planner corrections

9. rebuild Napoleon diagrams or apply fallback;
10. convert one-event timelines to date cards;
11. implement deterministic shot diversification;
12. populate real ratio diagnostics.

Run focused History planner tests.

## Phase C — Franklin and Napoleon regression packs

Regenerate temporary packs for:

```text
history-youtube-history-10-video-story-pack-02-napoleons-invasion-of-russia
history-youtube-history-10-video-story-pack-05-franklin-expedition
```

Inspect only the defect-specific fields.

Do not produce final ZIPs yet.

## Phase D — Final regeneration

After all focused tests pass, regenerate once for:

```text
history-youtube-history-10-video-story-pack-02-napoleons-invasion-of-russia
history-youtube-history-10-video-story-pack-03-fall-of-the-roman-empire
history-youtube-history-10-video-story-pack-04-black-death
history-youtube-history-10-video-story-pack-05-franklin-expedition
```

Then produce the combined comparison pack.

---

# 14. Required tests

Add only focused tests needed for these defects.

## Date/quantity

- `235–284` is temporal;
- `476` in historical-date context is temporal;
- `June 11` does not emit count `11`;
- `April 22` does not emit count `22`;
- `105 survivors` emits count `105`.

## Geographic role

- Britain departure role is origin;
- contradictory qualifier/entity roles fail.

## Entities

- `Exact` rejected;
- ordinary sentence-start noun rejected as canonical entity;
- Roman Senate typed as institution/organization;
- Roman Empire typed as state;
- Grande Armée typed as military unit;
- Church typed as organization/institution.

## Diagrams

- `Exact → Grande Armée` rejected;
- `Moscow associated-with Kutuzov` rejected;
- valid causal/process replacement passes;
- fallback modality succeeds.

## Timelines

- one event becomes date card;
- two related events remain timeline;
- nested dates deduplicate;
- labels do not truncate mid-word.

## Textual visuals

- narration paraphrase cannot become quotation card;
- exact quotation may become quotation card;
- narration-emphasis card passes.

## Repetition

- existing V3.4 repetitive fixture fails;
- diversified output passes existing thresholds;
- thresholds are not weakened.

## Ratio plans

- evaluation flag required;
- stable IDs retained;
- label collisions produce diagnostics;
- word-safe text output.

## Audit/determinism

- real attestation time persists across regeneration;
- build epoch does not replace audit time;
- DOS timestamp report matches ZIP entry metadata.

No live API calls in CI.

---

# 15. Final pack acceptance criteria

For every regenerated episode:

## Integrity

- [ ] JSON parses.
- [ ] References resolve.
- [ ] Checksums pass.
- [ ] Nested ZIP matches expanded files.
- [ ] Archive paths are safe.
- [ ] Phase B is deterministic.

## Authority

- [ ] `sourceAuthorityMode = "trusted-script"`.
- [ ] provider calls = 0.
- [ ] web-search calls = 0.
- [ ] trusted claims remain `trusted_input`.
- [ ] no fake sources or evidence.
- [ ] real trust timestamp preserved.

## Semantic contracts

- [ ] dates are not counts;
- [ ] day components are not counts;
- [ ] geographic roles are consistent;
- [ ] canonical entity types are valid;
- [ ] rejected entities are recorded;
- [ ] no invalid Napoleon diagrams;
- [ ] no one-event timelines;
- [ ] no mid-word labels;
- [ ] no paraphrase presented as quotation.

## Visual quality

- [ ] all configured repetition thresholds pass;
- [ ] ratio analysis was actually evaluated;
- [ ] stable artifact IDs are retained;
- [ ] no generic hard-coded all-pass diagnostics.

## Gates

- [ ] structural gate has no error-level blockers;
- [ ] editorial gate has no repetition or artifact-quality blockers;
- [ ] content gate has no semantic visual blockers;
- [ ] production remains blocked only by legitimate production prerequisites such as measured timing.

Do not automatically approve any gate. Mark only whether it is ready for human approval.

---

# 16. Required final output

Keep the final response concise.

Provide:

1. changed files;
2. focused tests and results;
3. per-episode:
   - claims;
   - rejected entities;
   - maps;
   - diagrams;
   - timelines;
   - date cards;
   - beats;
   - shots;
   - repetition metrics;
   - qualifier error count;
   - semantic diagnostic count;
   - gate readiness;
   - ZIP path and SHA-256;
4. combined comparison ZIP path and SHA-256;
5. proof of zero provider and web-search calls;
6. proof of deterministic second generation;
7. any remaining blocker.

Do not include a long narrative recap.

---

# Definition of done

This remediation is complete when all four V3.4 approval packs:

- preserve trusted-script authority;
- require no research;
- classify dates, quantities, entities, and geographic roles correctly;
- contain only semantically valid diagrams and timelines;
- distinguish quotations from narration;
- pass existing repetition thresholds without weakening them;
- contain evaluated ratio-specific plans;
- preserve real authority audit timestamps;
- expose complete diagnostics;
- are structurally, editorially, and content-ready for human approval;
- remain production-blocked only where genuine production prerequisites are missing.
