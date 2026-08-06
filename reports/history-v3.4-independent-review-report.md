# History V3.4 Approval Packs — Independent Review

## Executive verdict

**Reject all four packs for editorial, content, and production approval.**

V3.4 is materially safer and more honest than V3.3:

- `trusted-script` is explicit;
- no research calls or fake citations are present;
- claim namespaces are consolidated;
- malformed V3.3 map proposals no longer survive;
- modality references are complete;
- repetition thresholds now fail correctly;
- beat grouping and multi-shot planning improved;
- the Franklin survivor-march map is coherent.

However, V3.4 remains blocked by:

1. severe shot and asset-treatment repetition;
2. typed qualifier errors;
3. semantically invalid Napoleon diagrams marked valid;
4. one-event and truncated timelines;
5. narration paraphrases exported as `quotationText`;
6. generic ratio plans with no real conflict analysis;
7. audit timestamps replaced by the deterministic 1980 build epoch;
8. final timing still estimated rather than measured.

## Gate readiness

| Episode | Structural | Editorial | Content | Production |
|---|---|---|---|---|
| Napoleon | Not ready for approval | Blocked | Blocked | Blocked |
| Fall of Rome | Not ready for approval | Blocked | Blocked | Blocked |
| Black Death | Not ready for approval | Blocked | Blocked | Blocked |
| Franklin Expedition | Not ready for approval | Blocked | Blocked | Blocked |

The exported `validation.json.structurallyValid = true` is credible for schema/reference integrity, but not for semantic structural correctness. Qualifier typing and modality-state semantics still violate the intended contracts.

---

# 1. Integrity and authority

## Passed

Across all four episode directories:

- all JSON files parse;
- every checksum entry in `checksums.sha256` verifies;
- expanded episode files match their nested ZIP contents;
- no unsafe archive paths or symlinks were found;
- narration spans align with canonical normalized text;
- beat and shot timing is contiguous;
- non-null references resolve.

## Authority mode is honest

For every episode:

- `authoring-mode.json.sourceAuthorityMode = "trusted-script"`
- `authoring-mode.json.research.researchMode = "skipped-trusted-script"`
- `authoring-mode.json.research.providerCalls = 0`
- `authoring-mode.json.research.webSearchCalls = 0`
- `trusted-narration-attestation.json.assertion = "accepted-without-independent-verification"`
- claims use `trusted_input` or `not_required`
- `independentlyVerified = false`

No fake sources, evidence fragments, or research provider runs are presented.

## Audit timestamp defect

For every episode:

- `trusted-narration-attestation.json.assertedAt = "1980-01-01T00:00:00.000Z"`
- `source-authority.json.updatedAt = "1980-01-01T00:00:00.000Z"`

The deterministic archive epoch has been reused as an audit-event timestamp. This destroys the real chronology of the trust decision.

**Correction:** keep real attestation and authority-transition timestamps in immutable audit records. Exclude those records from byte-identical packaging comparisons, or package a hash-bound canonical audit snapshot while preserving the actual event time.

---

# 2. Claims and typed qualifiers

## Improvements

The parallel `claim-*` and `trusted-claim-*` namespaces are gone. `claims.json` is now canonical and contains:

- narration spans;
- attestation IDs;
- authority mode;
- trusted provenance status.

Some rhetorical claims are now correctly marked `not_required`.

## Blocking qualifier errors

### Fall of Rome

`temporal-qualifiers.json` is empty despite numerous dated claims.

`quantitative-qualifiers.json` incorrectly contains:

- `quantity-39197697ac1011e59d7c6f31`
  - `normalizedValue = "235"`
  - `kind = "count"`
  - claim text: “Between 235 and 284...”
- `quantity-80f7bd82f53ca9e05f508063`
  - `normalizedValue = "476"`
  - `kind = "count"`
  - claim text: “The date 476 is useful...”

These are years/periods, not counts.

### Franklin Expedition

`quantitative-qualifiers.json` incorrectly contains:

- `quantity-1e6fb50ed8664632d3946819`
  - `normalizedValue = "11"`
  - claim text: “Franklin died on June 11...”
- `quantity-95544cc38e50a1c604e0a75f`
  - `normalizedValue = "22"`
  - claim text: “...abandoned the ships on April 22...”

These are day components of dates, not quantities.

`geographic-qualifiers.json` also assigns Britain the role `destination`, while the referenced entity in `entities.json` has `semanticRole = "origin"`.

### Incomplete extraction elsewhere

- Napoleon has no quantitative qualifiers despite numerical/estimate-oriented narration.
- Black Death has only one temporal qualifier despite many dated periods and years.
- Rome timeline events often derive `dateSortKey` values while `temporalQualifierIds = []`, showing that timeline parsing and claim qualifier extraction use inconsistent date logic.

**Correction:** use one canonical date/quantity parser. Parse full date expressions before standalone numbers. A token consumed by a date span must not also become a quantity. Validate geographic qualifier roles against the referenced entity role.

---

# 3. Entity quality

V3.4 correctly rejects obvious stopwords and exports rejected proposals in `rejected-entities.json`.

However, canonical `entities.json` remains noisy:

- Napoleon includes `Exact` as an entity.
- Fall of Rome includes ordinary nouns such as `Taxes`, `People`, `Trade`, and `Disease`.
- Black Death includes `Exact`, `Fleas`, `People`, and `Survivors`.
- Many recognized institutions/states remain typed as `other`, including:
  - `The Roman Senate`
  - `The Roman Empire`
  - `The Eastern Roman Empire`
  - `The Grande Armée`
  - `The Church`

This noise directly contributes to weak diagram semantics and limits map generation.

**Correction:** distinguish entity mentions from visual concepts. Ordinary nouns should become concepts or diagram terms, not canonical entities. Normalize leading articles and type known organizations, states, armies, institutions, diseases, and groups correctly.

---

# 4. Maps

## Franklin survivor-march map passes

`map-states.json.map-state-0028` is coherent:

- `movingActor = "surviving expedition members"`
- origin: King William Island
- destination: Back River
- route type: `overland`
- period: `April 1848`
- leaders: Francis Crozier and James Fitzjames
- labels and coordinates are present
- `semanticStatus = "valid"`

This fixes the V3.3 malformed route.

## Map coverage is overly conservative

Map counts:

- Napoleon: 0
- Fall of Rome: 0
- Black Death: 0
- Franklin: 1

Zero maps are not automatically wrong, but the absence is suspicious for stories whose narration contains routes, migrations, territorial scope, and geographic spread. The planner appears to avoid maps rather than reliably produce them.

**Correction:** add safe, narration-bound orientation-map modes that require only validated places and no speculative route geometry. Examples include named-place orientation, broad affected-region maps, and explicitly narrated movement only.

---

# 5. Diagrams

Napoleon contains two diagrams, both marked `semanticStatus = "valid"` in `diagram-states.json`, but neither is semantically adequate.

## `diagram-state-0037`

Question:

> “Exact numbers vary because the Grande Armée included reinforcements, detached units, deserters, prisoners, and men who returned by different routes.”

Nodes:

- `node-0037-1.label = "Exact"`
- `node-0037-2.label = "Grande Armée"`

Edge:

- `"Exact" leads-to "Grande Armée"`

This graph does not represent the stated reason estimates vary. `Exact` is not a valid concept node, and the edge direction is meaningless.

## `diagram-state-0048`

Question:

> “Kutuzov’s decision to abandon Moscow ... preserved the force that could continue the war.”

Nodes:

- `Moscow`
- `Kutuzov`

Edge:

- `Moscow associated-with Kutuzov`

This does not express the decision, abandonment, army preservation, or continuation of war.

**Correction:** require graph coverage tests:

- every essential clause in `exactQuestion` maps to a node or edge;
- nodes cannot be sentence-start fragments;
- edge semantics must answer the question;
- causal claims require explicit causal/process structure;
- rejected diagrams fall back to archival visuals, text, or timelines.

---

# 6. Timelines

Timeline artifacts are now exported and all beat references resolve. However:

- most timeline states contain only one event;
- labels are truncated at a fixed character count, frequently ending mid-word;
- Rome dates are used in `dateSortKey` while `temporalQualifierIds` remain empty;
- Franklin `timeline-state-0025.orderingStatus = "ambiguous"` because the same claim becomes both `April 1848` and `1848`;
- Black Death’s only timeline is a one-event card for 1351.

Examples from `timeline-events.json`:

- Napoleon: label ends with `“...defeated Rus”`
- Rome: label ends with `“...teenage emperor ca”`
- Rome: label ends with `“...military revo”`

A one-event artifact is generally a date card, not a timeline.

**Correction:**

- separate `date-card` from `timeline`;
- require at least two meaningfully related events for a timeline;
- truncate at word boundaries or generate concise editorial labels;
- deduplicate nested temporal qualifiers (`April 1848` plus `1848`);
- use the canonical temporal qualifier layer.

---

# 7. Document and quotation states

`document-states.json` frequently stores narration paraphrases in the field `quotationText`.

Examples:

## Napoleon

`document-state-0025.quotationText`:

> “Napoleon waited for a political message that did not come.”

This is not a quotation or document excerpt.

## Black Death

`document-state-0020.quotationText`:

> “Chroniclers wrote of abandoned relatives...”

This is a narration summary, not a quotation from a chronicler.

## Franklin

`document-state-0006.quotationText`:

> “Searchers found graves, abandoned equipment...”

This is narration, not document text.

This can visually imply primary-source quotation where none exists.

**Correction:** split modality/state types:

- `quotation-card`: exact quotation only;
- `document-card`: actual document title/metadata and verified excerpt;
- `narration-emphasis-card`: narration text clearly labelled as narration;
- `summary-card`: editorial summary.

Do not name paraphrases `quotationText`.

---

# 8. Beats and shots

## Improvements

Beat grouping is no longer mechanically one unit per beat:

| Episode | Claims | Beats | Shots |
|---|---:|---:|---:|
| Napoleon | 94 | 50 | 74 |
| Fall of Rome | 106 | 55 | 86 |
| Black Death | 96 | 48 | 70 |
| Franklin | 92 | 68 | 81 |

Long beats receive multiple shots; `quality-metrics.json.oneShotPerLongBeatRate = 0`.

## Blocking repetition

Every pack correctly reports `quality-metrics.json.passes = false`.

| Episode | Asset treatment duplicate | Dominant camera | Shot structure duplicate | Two-instruction alternation |
|---|---:|---:|---:|---:|
| Napoleon | 95.95% | 67.57% | 86.49% | 100% |
| Fall of Rome | 96.51% | 63.95% | 93.02% | 100% |
| Black Death | 95.71% | 68.57% | 90.00% | 100% |
| Franklin | 96.30% | 83.95% | 88.89% | 100% |

Thresholds in `quality-metrics.json.thresholds` are now present and correctly exceeded.

The repeated signatures remain dominated by:

- `wide contextual frame`
- `locked evidence frame`
- `direct evidence cut`
- `medium evidence frame`
- `slow lateral reveal`
- `brief neutral dissolve`

**Correction:** generate shot grammar from beat purpose, asset type, subject motion, information density, and continuity. Add a deterministic diversification pass that cannot alter factual content.

---

# 9. 16:9 and 9:16 plans

Every beat has both ratio records. Franklin’s map correctly exports:

- `retainedRouteIds`
- `retainedLabels`
- `labelPriority`

However, the wider ratio system remains mostly generic:

- `conflictDiagnostics = []` for every reviewed ratio record;
- `textDensityResult = "pass"` everywhere;
- many `protectedSubject` fields are mechanically truncated mid-word;
- timelines retain truncated display strings rather than event IDs;
- archival-image adaptations contain little beyond generic crop/layout text;
- `independentPortraitRenderingMandatory` is usually false without evidence of actual composition analysis.

**Correction:**

- validate actual bounding boxes and label collisions;
- retain artifact IDs, not truncated display strings;
- generate concise, word-safe labels;
- require non-empty diagnostics when a decision was evaluated, even if the result is `none`;
- derive portrait composition from subject geometry and text footprint.

---

# 10. Timing

All estimates are inside the accepted 8–20 minute range:

| Episode | Estimated duration | Preferred delta |
|---|---:|---:|
| Napoleon | 10:17 | +2.83% |
| Fall of Rome | 10:58 | +9.70% |
| Black Death | 10:30 | +4.99% |
| Franklin | 11:10 | +11.69% |

Relevant fields:

- `plan.json.timing.timingSource = "provisional-text-estimate"`
- `plan.json.timing.withinAllowedRange = true`
- `validation.json` includes `TIMING_MEASUREMENT_REQUIRED`

The Franklin preferred-duration warning is reasonable.

**Correction:** generate or reconcile measured TTS/final-audio duration before production approval.

---

# 11. Diagnostics and gate states

The packs now correctly block:

- editorial approval through `EDITORIAL_REPETITION_THRESHOLD`;
- production approval through `TIMING_MEASUREMENT_REQUIRED`;
- Franklin editorial review also warns on `TIMING_PREFERRED_DEVIATION`.

However, `validation.json` does not diagnose:

- temporal/quantitative misclassification;
- geographic role mismatch;
- semantically invalid diagrams;
- misleading document/quotation states;
- truncated timeline and ratio labels;
- one-event timelines;
- synthetic attestation timestamps.

Because content approval depends on valid trusted visual semantics, these must become explicit content/structural diagnostics.

---

# 12. Determinism

`determinism-report.json` now records the correct episode-specific commands and matching first/second-run content and plan hashes.

However:

- `stableArchiveTimestamp = "1980-01-01T00:00:00.000Z"`
- actual ZIP directory metadata displays `1980-01-01 01:00:00`

The report states files were forced to midnight UTC, but ZIP/DOS timestamps are timezone-naive. The representation still does not match observed archive metadata.

**Correction:** report both:

- canonical UTC build epoch;
- exact DOS timestamp tuple written to the archive;
- timezone conversion rule.

Do not use the build epoch for authority audit events.

---

# Concrete remediation priority

## P0

1. Fix date/quantity parsing and geographic qualifier roles.
2. Reject or rebuild both Napoleon diagrams.
3. Split document/quotation/narration-emphasis modalities.
4. Resolve editorial repetition failures.
5. Preserve real trust-attestation timestamps.
6. Add missing semantic diagnostics.

## P1

7. Replace one-event timelines with date cards.
8. Fix truncated labels and nested date duplication.
9. Improve entity typing and concept separation.
10. Add more safe narration-bound maps where appropriate.
11. Implement actual 9:16 collision/text-density checks.

## P2

12. Correct ZIP/DOS timestamp reporting.
13. Enrich approval summaries with semantic defect counts.

---

# Final decision

## Structural gate

**Not ready for final human approval.**

Archive/schema/reference integrity passes, but typed qualifier and semantic artifact validation remains incomplete.

## Editorial gate

**Not ready.**

Every episode fails repetition thresholds, and shot language remains highly templated.

## Content gate

**Not ready.**

Trusted narration is validly attested, but diagrams, qualifier metadata, document/quotation semantics, and some timeline structures can misrepresent factual content.

## Production gate

**Not ready.**

Upstream gates fail, and timing remains provisional rather than measured.
