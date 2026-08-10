# V3.6 Phase 2.11 — Enrich the Four Additional-Native-Structure Gaps

## Mission

Resolve only the four Phase 2.9 inventory items classified:

```text
NEEDS_ADDITIONAL_NATIVE_STRUCTURE
```

by improving **native V3.6 structured semantics at the canonical claim-generation boundary** and, where needed, their direct atomic-grounding projection.

The objective is:

> Determine exactly what semantic information is missing in each of the four cases, encode only source-supported native structure, project it deterministically into atomic grounding, and measure whether the four cases become safe candidate-projection-ready inputs.

This is NOT a candidate-projector implementation task.

Do not implement any new relation candidate rule in Phase 2.11.

Do not touch the other seven unresolved gaps.

Do not add cross-claim proof.

Do not modify the relation validator.

Do not expand relation taxonomy.

Do not run all 40 episodes.

Do not use live LLM/provider calls.

Do not modify V3.5 production semantics.

---

# Accepted baselines

Phase 2.10:

```text
COMMIT:
a63de8f5a30db4ede6e82ece0f8f87ba45032145

TAG:
history-v3.6-transforms-causal-candidate-baseline
```

Phase 2.9:

```text
COMMIT:
abad7c25286b82b738933702bd1b3a1f69fa39bb

TAG:
history-v3.6-candidate-gap-inventory-baseline
```

Phase 2.8:

```text
IMPLEMENTATION:
83b352380fb913a1792a174cc5925936bab55ea2

REPORT:
d42edd0dbe6ffd1af902e7b4f686ce70c9288fde

TAG:
history-v3.6-process-temporal-candidate-baseline
```

V3.6 contract baseline:

```text
022f2177cc0e66f47cb5d652d6d456ce12a5a7be
history-v3.6-contract-preflight-baseline
```

Frozen V3.5:

```text
history-v3.5-frozen-before-v36
```

Resolve full peeled commit/tag-object SHAs from Git.

Do not guess abbreviated SHAs.

---

# Phase 2.10 accepted representative state

Same-eight metrics:

```text
candidates:            50
validated relations:   28
causal relations:      16
candidate gaps:        11
```

Remaining gap categories:

```text
NEEDS_ADDITIONAL_NATIVE_STRUCTURE  4
NEEDS_CROSS_CLAIM_PROOF            1
ASSERTION_OR_MODALITY_BLOCK        3
TAXONOMY_MISMATCH                  1
INTENTIONALLY_NON_RELATIONAL       2
```

Only the first category is in scope.

The other seven gaps are frozen.

---

# Phase 0 — Mandatory preflight

Run:

```bash
git status --short
git branch --show-current
git rev-parse HEAD
git log --oneline --decorate -20

git rev-parse history-v3.6-transforms-causal-candidate-baseline
git rev-parse 'history-v3.6-transforms-causal-candidate-baseline^{}'

git rev-parse history-v3.6-candidate-gap-inventory-baseline
git rev-parse 'history-v3.6-candidate-gap-inventory-baseline^{}'

git rev-parse history-v3.5-frozen-before-v36
git rev-parse 'history-v3.5-frozen-before-v36^{}'
```

Record:

```text
CURRENT_HEAD
PHASE210_SHA
PHASE29_SHA
FROZEN_V35_PEELED_COMMIT_SHA
FROZEN_V35_TAG_OBJECT_SHA
```

Verify Phase 2.10 accepted state is present.

Run focused:

```text
History package typecheck
Phase 2.10 projector tests
Phase 2.9 inventory tests
45 golden semantic fixtures
```

Proceed only if green.

Create immutable checkpoint:

```text
history-v3.6-pre-native-structure-gap-enrichment
```

Use a versioned equivalent if occupied.

Do not overwrite tags.

No destructive Git.

Leave unrelated worktree changes untouched.

---

# Phase 1 — Load the exact four gaps

Use the Phase 2.9 persisted inventory as the semantic source of truth.

Locate exactly the four records whose primary classification is:

```text
NEEDS_ADDITIONAL_NATIVE_STRUCTURE
```

Do NOT rediscover or reclassify the full 11-gap set.

Build a small working matrix:

```text
gapId
episodeId
claimId
claim source span
current structured proposition
current atomic grounding
current missing semantic information
why candidate projection is currently unsafe
```

There must be exactly:

```text
4 in-scope gaps
```

If the repository/artifact does not reconcile to four:

STOP and report the discrepancy.

Do not silently substitute different cases.

---

# Hard scope rule

Phase 2.11 may modify only the layers needed to represent missing semantics for those four claims:

```text
native structured claim generation
structured-claim contract, only if genuinely required
direct atomic grounding projection
native fixture/snapshot data for the same four cases
focused reports/tests
```

Do NOT modify:

```text
candidate projection rules
relation validator
relation taxonomy
semantic relation ID logic
evidence fingerprint logic
cross-claim proof
entity/place resolver globally
the 3 modality-blocked cases
the taxonomy-mismatch case
the 2 intentionally non-relational cases
the 1 cross-claim-proof case
V3.5 production semantics
```

If one of the four cannot be resolved without one of those forbidden changes:

classify it as not safely resolvable in Phase 2.11 and leave it unchanged.

---

# Phase 2 — Semantic gap diagnosis

For each of the four gaps identify the minimal missing information.

Allowed diagnosis categories:

```text
MISSING_PREDICATE
MISSING_ROLE
MISSING_PARTICIPANT
MISSING_DIRECTION
MISSING_ORDER
MISSING_LOCATION_ROLE
MISSING_OBJECTIVE_ROLE
MISSING_QUALIFIER
MISSING_ASSERTION_DETAIL
MISSING_GROUPING_STRUCTURE
```

Use the smallest accurate category set per case.

Do not create broad new abstractions unless multiple cases genuinely require the same one.

For each gap record:

```text
what source text explicitly states
what native structure currently contains
what exact semantic element is missing
what minimum schema/generator change would encode it
```

A human inference is NOT sufficient evidence.

---

# Native-first architecture

Any enrichment must occur at/adjacent to the canonical claim-generation boundary:

```text
canonical narration
        ↓
canonical claim generation
        ↓
native StructuredClaimEnvelopeV36
        ↓
atomic grounding
```

Forbidden:

```text
persisted claim prose
        ↓
new regex heuristic
        ↓
invent missing semantic role
```

Do not regress to post-hoc inference.

---

# Reuse existing native generator

Use the existing authoritative generator:

```text
packages/history/src/v36/native-structured-claim-generator-v36.ts
```

or the exact current authoritative path.

Do not create a parallel semantic generator.

If native generator version changes:

increment/version it explicitly.

Cache invalidation must include the new generator/schema version.

---

# StructuredClaim contract

Reuse the existing `StructuredClaimV36` contract.

Only extend it if one of the four exact cases requires a semantic field/predicate/role that cannot be represented today.

Do not redesign unrelated variants.

Any extension must be:

```text
minimal
typed
versioned
backward-compatible
runtime-schema-backed
mechanically reflected in generated JSON Schema
```

Do not hand-edit generated schema.

---

# Current accepted semantic controls

Preserve all prior invariants.

## Franklin

```text
search objective != movement destination
```

Do not add a destination merely because a search target exists.

## Spanish Armada

```text
intended route != completed movement
```

Intent/plan is not historical movement completion.

## D-Day

```text
spatial comparison != movement
```

## 1066

Known unsupported bad chain remains unsupported.

## Titanic / Chernobyl

```text
temporal sequence != causality
```

## Process

```text
ordered steps != causality
```

## Black Death

Do not fabricate cross-claim policy/causal proof.

---

# Movement/location enrichment controls

If one or more of the four gaps involve movement/location semantics, require explicit role distinctions:

```text
actor
origin
destination
via
location
objective
```

Hard rule:

```text
objective != destination
```

For a movement relation to become projection-ready, the native/atomic semantics must contain the exact participants required by the existing movement relation contract.

Do not infer a destination from:

```text
search objective
mission purpose
target concept
later location
adjacent sentence
```

---

# Causal/dependency enrichment controls

If a gap involves causal or dependency semantics:

encode only what the claim explicitly states.

Do not infer:

```text
A causes B
```

from:

```text
A precedes B
A co-occurs with B
A is associated with B
A transforms context around B
```

unless the native claim semantics directly establish the required predicate/roles.

Dependency remains distinct from causality.

---

# Comparison/spatial controls

If a gap involves spatial comparison:

encode:

```text
compared participants
comparison direction/qualifier
location context if explicit
```

Do not turn comparison into movement.

Do not derive geographic endpoints from comparison roles.

---

# Evidence/grouping controls

If a gap needs grouping/evidence structure:

preserve nested evidence/group semantics.

Do not split a grouped concept merely because multiple proper names occur.

Synthetic grouping labels may be internal metadata only.

They may not become historical evidence unless source-backed.

---

# Assertion/modality

Do not solve the three Phase 2.9 modality-blocked gaps in this task.

For the four in-scope cases:

preserve exact statuses:

```text
asserted
uncertain
intended
attempted
counterfactual
reported
```

Do not promote non-asserted semantics to asserted.

If an in-scope gap turns out to be primarily a modality problem:

record that Phase 2.9 classification was wrong or incomplete and do NOT force enrichment.

---

# Canonical participants

All participants must use canonical/resolved IDs.

Do not invent new IDs from raw text.

If a needed participant cannot be resolved using existing claim-generation bindings:

do NOT globally redesign entity resolution.

Record:

```text
PARTICIPANT_RESOLUTION_REQUIRED
```

for that gap and stop enrichment of that case.

---

# Source spans

Every enriched native proposition must preserve exact:

```text
episodeId
claimId
UTF-16 start
UTF-16 end
source text/hash
```

No synthetic spans.

Schema validation must verify:

```text
0 <= start < end <= claimText.length
```

and span hash consistency.

---

# Native vs compatibility provenance

Do not relabel compatibility backfill as native.

Any newly enriched proposition must be demonstrably emitted through the native claim-generation path.

Record:

```text
native
```

only when produced at the canonical native boundary.

Historical/backfill structure remains:

```text
compatibility-backfill
```

---

# Atomic grounding

After native structure is complete:

add only the direct deterministic atomic projection necessary to preserve the newly explicit semantics.

Atomic grounding must NOT parse prose.

It must be reconstructible from the structured proposition alone.

For each enriched gap:

```text
structured semantic content
==
atomic semantic content
```

modulo typed normalization.

No hidden participant, direction, or qualifier may appear at atomic grounding.

---

# No candidate projector implementation

Hard stop at:

```text
candidate-projection readiness
```

Do NOT add a projector even if an enriched atom is now obviously eligible.

Instead record:

```text
candidateProjectionReady = true
proposedTargetRelationKind
proposedDirectMapping
```

for Phase 2.12.

The current candidate count/validated relation count should therefore remain unchanged unless existing generic projection already consumes the enriched atom automatically without code changes.

If an existing generic path does change output mechanically:

report it.

Do not add new projection logic.

---

# Readiness decision per gap

At the end classify each of the four as exactly ONE:

```text
DIRECT_PROJECTION_READY

STILL_NEEDS_NATIVE_STRUCTURE

PARTICIPANT_RESOLUTION_REQUIRED

ASSERTION_OR_MODALITY_BLOCK

CROSS_CLAIM_PROOF_REQUIRED

TAXONOMY_CHANGE_REQUIRED

INTENTIONALLY_NON_RELATIONAL
```

This is the post-enrichment outcome.

Counts must sum to four.

---

# Candidate readiness record

For every:

```text
DIRECT_PROJECTION_READY
```

case produce:

```text
gapId
atomic predicate/shape
target existing relation kind
participant mapping
direction/order rule
assertion rule
cardinality rule
source lineage
negative controls
proposed future projector rule name
```

Do not implement it.

---

# Projector proposal naming

If a future direct projector is justified, propose a stable versioned name such as:

```text
atomic-<predicate>-<relation>-candidate.v1
```

Use repository conventions.

Do not register/execute it in Phase 2.11.

---

# Same-eight representative gate

Use the exact same eight representative episodes:

```text
Bronze Age Collapse
Black Death
Franklin Expedition
Spanish Armada
D-Day
1066
Titanic
Chernobyl
```

Do not add episodes.

Do not run all 40.

---

# Metrics

Baseline Phase 2.10:

```text
candidate gaps:          11
candidates:              50
validated relations:     28
```

For Phase 2.11 report:

```text
in-scope gaps: 4

native structured claims before/after
native structured propositions before/after
atomic propositions before/after

the four gap outcomes:
DIRECT_PROJECTION_READY
STILL_NEEDS_NATIVE_STRUCTURE
PARTICIPANT_RESOLUTION_REQUIRED
ASSERTION_OR_MODALITY_BLOCK
CROSS_CLAIM_PROOF_REQUIRED
TAXONOMY_CHANGE_REQUIRED
INTENTIONALLY_NON_RELATIONAL

candidate count before/after
validated relation count before/after
candidate-gap count before/after
```

Do not expect candidate gaps to decrease merely because structure improves.

If the four become atomic-grounding-present/candidate-projection gaps, that is a successful upstream result.

---

# Miss classification update

Update the representative miss taxonomy after enrichment:

```text
native structure absent
native structure present / atomic grounding gap
atomic grounding present / candidate projection gap
candidate proposed / validator reject
cross-claim proof gap
taxonomy gap
participant resolution gap
assertion/modality block
intentionally non-relational
```

The exact four Phase 2.9 structure gaps should move to their new truthful categories.

Do not alter unrelated gap classifications.

---

# Existing seven unresolved gaps frozen

Verify no behavioral change for:

```text
3 assertion/modality-blocked
1 cross-claim proof
1 taxonomy mismatch
2 intentionally non-relational
```

Their IDs and classifications should remain stable.

If implementation accidentally changes them:

treat as scope regression.

---

# Cache/invalidation

If structured schema/generator changes:

update cache fingerprints.

Semantic invalidation inputs may include:

```text
claim ID
claim content hash
structured schema version
native generator version
canonical participant binding fingerprint
provider/model identity if applicable
```

Media changes must not invalidate:

```text
images
audio
render format
approval timestamp
```

No live provider is used.

---

# Provider behavior

Hard requirement:

```text
live provider calls = 0
LLM calls = 0
```

Do not regenerate historical claims through paid providers.

Use existing deterministic/local generation and fixtures.

If native structure cannot be generated from deterministic canonical inputs:

report the limitation.

Do not fake native output.

---

# No regex expansion

Do not create a new regex family to recover the four semantics post hoc.

If a tiny lexical handling change is required at canonical claim generation:

it must be claim-boundary-local, typed, explicitly tested, and not become a generic semantic inference engine.

Prefer structured fixture/canonical semantics over textual heuristics.

---

# Tests

Follow focused risk-based validation.

Run:

1. History typecheck preflight;
2. Phase 2.10 projector regressions;
3. Phase 2.9 inventory regressions;
4. existing structured-claim schema tests;
5. existing atomic-grounding tests;
6. 45 golden fixtures;
7. four-gap inventory reconciliation test;
8. per-gap native-enrichment positive tests;
9. source-span/hash tests;
10. native-vs-backfill provenance tests;
11. assertion/modality preservation tests;
12. participant-binding tests;
13. Franklin objective/destination regression;
14. Armada intent/movement regression;
15. D-Day comparison/movement regression;
16. chronology/process-not-causality regressions;
17. direct structured→atomic equivalence tests;
18. frozen-seven-gap regression test;
19. same-eight representative run;
20. affected History typecheck;
21. targeted ESLint;
22. deterministic repeat/hash;
23. artifact checksum/ZIP integrity.

Do not run unrelated full-repository suites.

---

# Hard safety invariants

All must remain zero:

```text
unsupported validated relations
duplicate semantic IDs
cross-episode support violations
directionality violations
cardinality violations
proper-name fragmentation
purpose-as-destination errors
schema-invalid structured propositions
schema-invalid atomic grounding
chronology-to-causality errors
process-to-causality errors
intended/attempted promoted to asserted
compatibility backfill mislabeled native
synthetic grouping metadata used as historical evidence
invented participant bindings
```

If any non-zero:

```text
verdict = FAIL
```

Do not weaken safeguards.

---

# Manual review

Include all four in-scope cases.

For each:

```text
gapId
episodeId
claimId
bounded source excerpt/span

before:
structured proposition
atomic grounding
missing semantics

after:
native structured proposition
atomic grounding
exact new roles/predicate/participants

post-enrichment classification
candidateProjectionReady
proposed future mapping if ready
```

Also include negative-control evidence for every semantic family touched.

---

# Artifact

Generate:

```text
history-v3.6-native-structure-gap-enrichment-review-YYYYMMDDTHHMMSSZ.zip
```

Include at least:

```text
README.md
architecture.md

four-gap-baseline.json
native-enrichment-summary.json
atomic-grounding-comparison.json
candidate-readiness-summary.json
miss-classification.json

manual-review.json
diagnostic-summary.json
decision-report.md

test-summary.json
invariant-test-summary.json
provenance.json
checksums.sha256
```

If schema changes, also include updated:

```text
structured-claim-schema.json
structured-claim-contract-document.json
```

If atomic schema changes, include its generated schema/contract documents.

Keep artifact compact.

---

# Provenance

Include:

```text
v36ImplementationCommitSha

phase210BaselineCommitSha
phase210Tag

phase29BaselineCommitSha
phase29Tag

contractBaselineCommitSha

frozenV35ProductionCommitSha
frozenV35ProductionTag
frozenV35ProductionTagObjectSha

structuredClaimSchemaVersion
nativeGeneratorVersion
atomicGroundingSchemaVersion
relationSchemaVersion

artifactKind
episodeSet
generatedAt
gitBranch
liveProviderCalls
```

Artifact kind:

```text
history-v3.6-native-structure-gap-enrichment-review
```

All `CommitSha` fields must contain peeled commit objects.

---

# Commit/tag

After focused validation passes:

```text
feat(history): enrich v3.6 native semantics for remaining structure gaps
```

If fewer than four are safely enrichable, the commit message may still use the bounded phase name, but the report must state exact outcomes.

Create immutable tag:

```text
history-v3.6-native-structure-gap-enrichment-baseline
```

Use a versioned equivalent if occupied.

Do not overwrite existing tags.

Generate final artifact from the exact committed state.

Do not push unless repository policy explicitly permits it.

---

# Required completion report

Return:

1. Starting SHA/tag.
2. Preflight result.
3. Phase 2.10 baseline SHA/tag.
4. Phase 2.9 baseline SHA/tag.
5. Frozen V3.5 commit/tag/tag-object SHA.
6. Exact four gap IDs.
7. Exact four episode/claim IDs.
8. Per-gap missing semantic diagnosis.
9. Structured schema before/after version.
10. Native generator before/after version.
11. Atomic schema before/after version.
12. New predicates added, if any.
13. New roles/qualifiers added, if any.
14. Native generator changes.
15. Atomic grounding changes.
16. Source-span/provenance handling.
17. Cache/invalidation changes.
18. Tests added.
19. Golden fixture result.
20. Native structured claims before/after.
21. Native structured propositions before/after.
22. Atomic propositions before/after.
23. Per-gap post-enrichment classification.
24. DIRECT_PROJECTION_READY count.
25. STILL_NEEDS_NATIVE_STRUCTURE count.
26. PARTICIPANT_RESOLUTION_REQUIRED count.
27. ASSERTION_OR_MODALITY_BLOCK count.
28. CROSS_CLAIM_PROOF_REQUIRED count.
29. TAXONOMY_CHANGE_REQUIRED count.
30. INTENTIONALLY_NON_RELATIONAL count.
31. Proposed future projector rules, if any.
32. Candidate count before/after.
33. Validated relation count before/after.
34. Candidate-gap count before/after.
35. Confirmation other seven unresolved gaps unchanged.
36. Hard safety invariant counts.
37. Determinism result.
38. Final History typecheck.
39. Targeted ESLint result.
40. Provider/LLM calls = 0.
41. V3.5 unchanged confirmation.
42. Final commit SHA.
43. Immutable tag.
44. Review artifact path.
45. Artifact SHA-256/checksum result.
46. Recommend exactly ONE next task; do not execute it.

---

# Acceptance criteria

Complete only when all are true.

## Scope integrity

- [ ] Exactly the four `NEEDS_ADDITIONAL_NATIVE_STRUCTURE` gaps are in scope.
- [ ] Other seven unresolved gaps are frozen.
- [ ] No candidate projector is added.
- [ ] No validator change occurs.
- [ ] No taxonomy change occurs.
- [ ] No cross-claim proof is implemented.
- [ ] No all-40 run occurs.
- [ ] No live provider/LLM calls occur.
- [ ] V3.5 semantics remain unchanged.

## Native enrichment

- [ ] Each in-scope gap has an explicit before/after semantic diagnosis.
- [ ] New semantics are source-supported.
- [ ] Native enrichment occurs at the canonical/native claim boundary.
- [ ] No post-hoc prose heuristic substitutes for native semantics.
- [ ] Native vs compatibility provenance remains accurate.
- [ ] Exact source spans/hashes remain valid.
- [ ] Canonical participant bindings are preserved.
- [ ] Any schema extension is minimal and versioned.
- [ ] Generated JSON schema is updated mechanically.

## Atomic grounding

- [ ] Every enriched structured proposition projects directly/deterministically.
- [ ] Atomic grounding adds no hidden semantics.
- [ ] Direction/order/roles are preserved.
- [ ] Assertion/modality is preserved.
- [ ] Native-structure-present atomic-grounding gaps are zero for supported enriched variants.

## Semantic controls

- [ ] Franklin objective != destination remains true.
- [ ] Armada intent != completed movement remains true.
- [ ] D-Day comparison != movement remains true.
- [ ] 1066 unsupported bad chain remains unsupported.
- [ ] Titanic/Chernobyl chronology != causality remains true.
- [ ] Process sequence != causality remains true.
- [ ] Proper names remain atomic.
- [ ] Synthetic grouping metadata remains non-authoritative.

## Readiness decisions

- [ ] Each of the four receives exactly one post-enrichment classification.
- [ ] Readiness counts sum to four.
- [ ] Direct-projector-ready cases already contain complete atomic semantics.
- [ ] No ready case needs prose parsing.
- [ ] No ready case needs cross-claim composition.
- [ ] No ready case needs validator weakening.
- [ ] No ready case needs taxonomy expansion.
- [ ] Proposed future projector mappings are documented but not implemented.

## Safety

- [ ] Unsupported validated relations = 0.
- [ ] Duplicate semantic IDs = 0.
- [ ] Cross-episode support violations = 0.
- [ ] Directionality violations = 0.
- [ ] Cardinality violations = 0.
- [ ] Proper-name fragmentation = 0.
- [ ] Purpose-as-destination errors = 0.
- [ ] Invalid structured propositions = 0.
- [ ] Invalid atomic grounding objects = 0.
- [ ] Chronology-to-causality errors = 0.
- [ ] Process-to-causality errors = 0.
- [ ] Non-asserted promotion errors = 0.
- [ ] Backfill-as-native provenance errors = 0.
- [ ] Invented participant bindings = 0.

## Completion

- [ ] Focused tests pass.
- [ ] 45 golden fixtures pass.
- [ ] Same-eight deterministic run passes.
- [ ] Final History typecheck passes.
- [ ] Targeted ESLint passes.
- [ ] Successful state committed.
- [ ] Immutable Phase 2.11 tag created.
- [ ] Timestamped review artifact generated.
- [ ] Checksums pass.
- [ ] ZIP integrity passes.

Stop after Phase 2.11.

Do not automatically execute the recommended next task.
