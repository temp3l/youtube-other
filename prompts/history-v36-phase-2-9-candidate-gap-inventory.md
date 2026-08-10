# V3.6 Phase 2.9 — Candidate-Projection Gap Inventory and Eligibility Decision

## Mission

Perform a **bounded semantic inventory** of the remaining V3.6 candidate-projection gaps after Phase 2.8.

Do **not** implement any new candidate projection rules in this task.

The objective is:

> Enumerate every remaining candidate-projection gap individually, classify why it exists, determine whether it is safely eligible for a future direct atomic→relation projector, and produce an evidence-backed Phase 2.10 implementation recommendation.

This is an analysis/decision phase.

Do not remediate the gaps during the inventory.

---

# Accepted baselines

Phase 2.8 implementation/report:

```text
IMPLEMENTATION_SHA:
83b352380fb913a1792a174cc5925936bab55ea2

REPORT_SHA:
d42edd0dbe6ffd1af902e7b4f686ce70c9288fde

TAG:
history-v3.6-process-temporal-candidate-baseline
```

Phase 2.7:

```text
history-v3.6-native-process-temporal-baseline
```

Phase 2.6:

```text
history-v3.6-native-structured-claims-baseline
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

Resolve all full SHAs from Git/tag history.

Do not guess abbreviated SHAs.

---

# Phase 2.8 accepted state

Same-eight representative result:

```text
candidates:                45 -> 49
validated:                 23 -> 27

process relations:          0 -> 2
temporal-sequence:          0 -> 2

candidate-projection gaps: 16 -> 12
```

Phase 2.8 added exactly:

```text
atomic-process-sequence-candidate.v1
atomic-precedes-temporal-candidate.v1
```

Those projectors are accepted and frozen.

All hard safety invariants were zero.

Do not modify them in this task.

---

# Phase 0 — Mandatory checkpoint

Before analysis:

```bash
git status --short
git branch --show-current
git rev-parse HEAD
git log --oneline --decorate -20

git rev-parse history-v3.6-process-temporal-candidate-baseline
git rev-parse 'history-v3.6-process-temporal-candidate-baseline^{}'

git rev-parse history-v3.5-frozen-before-v36
git rev-parse 'history-v3.5-frozen-before-v36^{}'
```

Record:

```text
CURRENT_HEAD
PHASE28_TAG
PHASE28_PEELED_COMMIT_SHA
CONTRACT_BASELINE_SHA
FROZEN_V35_PEELED_COMMIT_SHA
```

Create an immutable checkpoint if absent:

```text
history-v3.6-pre-candidate-gap-inventory
```

Use a versioned equivalent if occupied.

Do not move existing tags.

No destructive Git operations.

Leave unrelated worktree changes untouched.

---

# Hard scope rule

This task is INVENTORY + CLASSIFICATION ONLY.

Do NOT:

```text
add a candidate projector
change candidate extraction
change atomic grounding
change structured claims
change native generator
change relation validator
change relation taxonomy
change semantic IDs
change evidence fingerprints
change V3.5
run all 40
call an LLM/provider
implement maps/diagrams
add cross-claim proof
```

If an obvious one-line projector appears:

```text
document it
DO NOT implement it
```

The purpose of Phase 2.9 is to prevent another heuristic iteration cycle.

---

# Representative corpus — unchanged

Use exactly the same eight episodes:

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

Resolve exact episode IDs from Phase 2.8 artifacts.

Do not add episodes.

Do not process all 40.

---

# Source of truth for the 12 gaps

Identify the exact 12 remaining items currently classified:

```text
atomic grounding present
/
candidate projection gap
```

Do not infer the list from aggregate counts.

Locate them from:

```text
Phase 2.8 persisted representative metrics
miss-classification output
atomic grounding artifacts
structured propositions
candidate extraction diagnostics
source claims
```

There must be exactly:

```text
12 inventoried gaps
```

If the repository data does not reconcile to 12:

STOP and report the mismatch.

Do not silently adjust the count.

---

# Required gap inventory record

For each of the 12 gaps produce one machine-readable record containing at least:

```text
gapId
episodeId
episodeTitle
claimId

structuredPropositionId
atomicGroundingId

structuredPredicate
atomicPredicate

semantic participants
semantic roles
assertion status

source span
source text hash

current candidate source
current projection state

expected relation family if any
classification
reason
proposed future projector rule if eligible

manual review required
```

Use actual current field names/types where possible.

Do not include huge claim dumps.

Include only bounded source excerpts/spans required for review.

---

# Gap classification taxonomy

Classify every gap into exactly ONE primary category.

Use this small taxonomy:

```text
DIRECT_PROJECTION_ELIGIBLE

NEEDS_ADDITIONAL_NATIVE_STRUCTURE

NEEDS_CROSS_CLAIM_PROOF

PARTICIPANT_RESOLUTION_GAP

ASSERTION_OR_MODALITY_BLOCK

TAXONOMY_MISMATCH

INTENTIONALLY_NON_RELATIONAL

VALIDATOR_CONTRACT_MISMATCH
```

A secondary note may mention another contributing factor, but the primary classification must be one value.

Do not invent extra categories unless a genuinely irreducible case exists.

If an extra category seems necessary:

report it explicitly rather than silently expanding the enum.

---

# Definition — DIRECT_PROJECTION_ELIGIBLE

Use only when ALL are true:

1. the atomic proposition already contains the complete semantic relation;
2. all required participants are canonical and resolved;
3. direction/order/cardinality are explicit;
4. assertion/modality is compatible with the existing relation kind;
5. an existing accepted V3.6 relation kind can represent it exactly;
6. no adjacent/cross-claim inference is needed;
7. no prose parsing is needed;
8. projection can be one-to-one/direct, like Phase 2.8;
9. the existing validator can decide admission without modification.

Example pattern:

```text
atomic predicate X
+
complete typed participants
        ↓
existing relation kind Y
```

No hidden semantic completion.

---

# Definition — NEEDS_ADDITIONAL_NATIVE_STRUCTURE

Use when the source claim expresses useful semantics, but the current structured/atomic representation lacks a role, participant, predicate, order, direction, qualifier, or assertion detail needed for safe relation projection.

Do not classify as direct just because a human can infer the missing meaning.

---

# Definition — NEEDS_CROSS_CLAIM_PROOF

Use when no single structured/atomic proposition contains enough evidence, but a bounded combination of multiple claims may support the relation.

Known architectural example:

```text
Black Death:
claim A supplies condition
claim B supplies response
```

Do not implement composition.

---

# Definition — PARTICIPANT_RESOLUTION_GAP

Use when semantics are otherwise explicit but a required relation participant lacks a canonical binding.

Do not invent IDs.

Do not modify entity/place resolution.

---

# Definition — ASSERTION_OR_MODALITY_BLOCK

Use when the atom is:

```text
intended
attempted
uncertain
```

or otherwise not semantically compatible with an asserted relation representation.

Do not promote non-completed semantics.

---

# Definition — TAXONOMY_MISMATCH

Use only when the atomic proposition is semantically complete but none of the existing accepted relation kinds can express it without distortion.

Existing relation kinds:

```text
movement
spatial-comparison
spatial-area
causal
dependency
process
temporal-sequence
policy-response
evidence-set
```

Do not expand taxonomy in this task.

---

# Definition — INTENTIONALLY_NON_RELATIONAL

Use when the atomic proposition is useful evidence/description but should not create an explanatory relation at all.

Examples may include:

```text
isolated locator fact
search objective
single action
descriptive state
```

depending on exact semantics.

Do not force every atom into a relation.

---

# Definition — VALIDATOR_CONTRACT_MISMATCH

Use only when:

```text
atomic semantics are complete
existing relation kind is appropriate
direct candidate can be constructed
but the existing relation contract/validator cannot represent or validate the semantics safely
```

This should be rare.

Do not use it for ordinary rejected candidates.

If found:

record the exact contract mismatch.

Do NOT modify the validator.

---

# Direct projector eligibility matrix

For every gap classified:

```text
DIRECT_PROJECTION_ELIGIBLE
```

produce:

```text
atomic predicate / shape
target relation kind
required participant mapping
direction/order rule
assertion-status rule
cardinality rule
semantic-ID expectation
evidence lineage expectation
negative controls
```

Do not write production code.

The output should be detailed enough that a later Phase 2.10 prompt can implement the rule mechanically.

---

# Rule consolidation

Multiple gaps may be instances of the same projector rule.

Group eligible gaps by proposed future projection rule.

Example:

```text
3 gaps
same atomic predicate
same participant mapping
same target relation kind
=> 1 proposed projector rule
```

Report:

```text
eligible gap count
unique proposed projector rule count
```

Do not propose one rule per episode unless semantics genuinely differ.

---

# Required safety analysis per proposed projector

For each proposed rule document likely false-positive risks.

At minimum evaluate:

```text
co-occurrence mistaken as relation
purpose mistaken as destination
chronology mistaken as causality
dependency mistaken as causality
comparison mistaken as movement
synthetic grouping metadata mistaken as historical fact
assertion/intention promoted to completion
proper-name fragmentation
insufficient participant cardinality
direction reversal
```

Only mark projector recommendation:

```text
SAFE_FOR_PHASE_2_10
```

when these controls can be expressed deterministically.

Otherwise:

```text
NOT_READY
```

---

# Existing semantic controls

Preserve and use known controls.

## Franklin

```text
search objective != movement destination
```

## Spanish Armada

```text
intended route != completed movement
```

## D-Day

```text
comparison != movement
```

## 1066

```text
Europe -> England -> King Edward
```

remains unsupported.

## Titanic/Chernobyl

Temporal sequence != causality.

## Process controls

Ordered process != causality.

Synthetic grouping labels remain non-authoritative.

---

# Candidate rejection analysis

Do not analyze only missing candidates.

Also inspect current candidate rejections relevant to the same semantic families.

For each candidate-gap family answer:

```text
would a new direct projector likely create a candidate that passes?
or
would it merely move the gap to validator rejection?
```

If the latter:

classify accurately.

Do not recommend useless projectors that only increase rejected candidate count.

---

# Current validator contract inspection

Read the existing relation schemas/validator only enough to determine representability.

Do not edit them.

For each direct-eligible mapping, verify:

```text
target relation variant fields
required cardinality
participant types
direction semantics
assertion expectations
proposition-support requirements
```

Reference exact module/schema paths in the report.

---

# No aggregate-only conclusions

Do not finish with:

```text
12 gaps -> add more projectors
```

The required output is semantic case-level evidence.

---

# Expected decision outcomes

At the end, recommend exactly ONE of:

```text
A. Implement N direct projector rules for M eligible gaps in Phase 2.10

B. Do not add projectors; improve native structured semantics first

C. Do not add projectors; implement bounded cross-claim proof next

D. Fix participant resolution before candidate projection

E. A mixed architectural sequencing decision justified by exact counts
```

If recommending E, it must still name ONE next task only.

Do not execute it.

---

# Manual review file

Create:

```text
candidate-gap-inventory.json
```

containing all 12.

Also create a concise human-review file:

```text
candidate-gap-review.md
```

For each gap show:

```text
episode
source claim excerpt
structured proposition
atomic proposition
why no candidate exists
classification
future eligibility
```

Keep excerpts bounded.

---

# Decision artifact

Generate a compact timestamped review artifact:

```text
history-v3.6-candidate-gap-inventory-review-YYYYMMDDTHHMMSSZ.zip
```

Include at least:

```text
README.md

candidate-gap-inventory.json
candidate-gap-review.md

eligibility-summary.json
projector-rule-proposals.json
validator-compatibility-summary.json
risk-control-summary.json

representative-summary.json
decision-report.md

test-summary.json
provenance.json
checksums.sha256
```

Do not include unrelated large artifacts.

---

# Required summary metrics

Report:

```text
remaining gaps = 12

DIRECT_PROJECTION_ELIGIBLE = N
NEEDS_ADDITIONAL_NATIVE_STRUCTURE = N
NEEDS_CROSS_CLAIM_PROOF = N
PARTICIPANT_RESOLUTION_GAP = N
ASSERTION_OR_MODALITY_BLOCK = N
TAXONOMY_MISMATCH = N
INTENTIONALLY_NON_RELATIONAL = N
VALIDATOR_CONTRACT_MISMATCH = N
```

Counts must sum to 12.

Also report:

```text
unique safe projector rules proposed
eligible gaps covered by each rule
projectors marked SAFE_FOR_PHASE_2_10
projectors marked NOT_READY
```

---

# Tests / validation

Because this is analysis-only, do not add semantic implementation tests unless required for the inventory tooling itself.

Run focused:

1. affected History typecheck preflight;
2. existing Phase 2.8 focused tests;
3. existing 45 golden fixtures;
4. inventory extractor tests;
5. classification schema tests;
6. count-reconciliation test: exactly 12 gaps;
7. eligibility-summary aggregation tests;
8. artifact JSON/schema tests;
9. affected History typecheck;
10. targeted ESLint;
11. deterministic inventory repeat/hash;
12. checksum/ZIP integrity.

Do not run unrelated full-repository suites.

---

# Determinism

The same Phase 2.8 frozen input must produce:

```text
same 12 gap IDs
same classifications
same projector grouping
same counts
same decision recommendation inputs
```

Manual prose may differ only if generated mechanically from the same inventory.

No LLM is allowed for classification.

---

# No LLM/provider

Hard requirement:

```text
live provider calls = 0
LLM calls = 0
```

Do not use an LLM to classify the gaps.

Do not use external historical research.

Use repository semantics only.

---

# V3.5 isolation

Do not touch V3.5 code or regenerate V3.5 artifacts.

This is a V3.6 shadow-analysis task only.

---

# No all-40 run

Do not process all 40 episodes.

The inventory is based on the frozen same-eight Phase 2.8 representative state.

---

# Safe parallelism

Use ONE primary writer for inventory/report tooling.

Read-only/disjoint subagents may:

### Agent A
inspect movement/spatial/causal/dependency gap cases;

### Agent B
inspect evidence/policy/process/temporal gap cases;

### Agent C
audit validator compatibility and risk controls.

Subagents must not implement candidate projectors.

---

# Token discipline

Keep context small:

```text
12 gaps only
same 8 episodes
bounded claim excerpts
no full episode dumps
no all-40 scan
no web
no provider
no images/audio
focused tests
```

---

# Provenance

Use correct annotated-tag semantics.

Include:

```text
v36ImplementationCommitSha

phase28ImplementationCommitSha
phase28ReportCommitSha
phase28Tag

contractBaselineCommitSha

frozenV35ProductionCommitSha
frozenV35ProductionTag
frozenV35ProductionTagObjectSha

artifactKind
episodeSet
generatedAt
gitBranch
liveProviderCalls
```

Artifact kind:

```text
history-v3.6-candidate-gap-inventory-review
```

Commit fields must be peeled commits.

---

# Commit/tag

After inventory tooling, validation, and artifact generation pass:

Commit:

```text
docs(history): inventory v3.6 candidate projection gaps
```

If code was needed for deterministic inventory tooling, use:

```text
feat(history): add v3.6 candidate gap inventory tooling
```

Choose the accurate one.

Create immutable tag:

```text
history-v3.6-candidate-gap-inventory-baseline
```

Use versioned equivalent if occupied.

Do not overwrite tags.

Generate the artifact from the exact committed state.

Do not push unless repository policy permits it.

---

# Required completion report

Return:

1. Starting SHA/tag.
2. Phase 2.8 implementation/report SHAs.
3. Phase 2.8 tag.
4. Contract baseline SHA/tag.
5. Frozen V3.5 peeled commit/tag/tag-object SHA.
6. Typecheck preflight result.
7. Inventory tooling paths.
8. Exact 8 episode IDs.
9. Exact gap count reconciliation.
10. The 12 gap IDs.
11. Classification count by category.
12. DIRECT_PROJECTION_ELIGIBLE gap count.
13. Unique proposed projector rule count.
14. Each proposed projector rule name.
15. Target relation kind for each rule.
16. Eligible gaps covered by each rule.
17. Negative controls for each rule.
18. SAFE_FOR_PHASE_2_10 projector count.
19. NOT_READY projector count.
20. Additional-native-structure gap count.
21. Cross-claim-proof gap count.
22. Participant-resolution gap count.
23. Assertion/modality block count.
24. Taxonomy mismatch count.
25. Intentionally non-relational count.
26. Validator-contract mismatch count.
27. Whether any projector would only create validator rejects.
28. Manual-review artifact path.
29. Determinism result.
30. Existing golden/test result.
31. Final History typecheck.
32. Targeted ESLint result.
33. Live provider/LLM calls = 0.
34. V3.5 unchanged confirmation.
35. Final commit SHA.
36. Immutable tag.
37. Review artifact path.
38. Artifact SHA-256/checksum result.
39. Recommend exactly ONE next task; do not execute it.

---

# Acceptance criteria

Complete only when all are true.

## Inventory integrity

- [ ] Exactly 12 remaining candidate-projection gaps are located.
- [ ] Every gap has a deterministic stable gap ID.
- [ ] Every gap links to exact episode/claim/structured/atomic provenance.
- [ ] Every gap receives exactly one primary classification.
- [ ] Classification counts sum to 12.
- [ ] No gap is silently omitted.

## Direct eligibility

- [ ] A gap is direct-eligible only when the atomic proposition already contains the complete relation semantics.
- [ ] No direct-eligible case requires prose parsing.
- [ ] No direct-eligible case requires adjacent/cross-claim composition.
- [ ] No direct-eligible case requires invented participants.
- [ ] No direct-eligible case requires validator weakening.
- [ ] No direct-eligible case requires relation-taxonomy expansion.
- [ ] Direction/order/cardinality are explicit.
- [ ] Assertion/modality is compatible.

## Projector proposals

- [ ] Eligible gaps are grouped into minimal reusable projector rules.
- [ ] Every projector has an explicit target relation kind.
- [ ] Every projector has deterministic participant mapping.
- [ ] Every projector has negative controls.
- [ ] Every projector is marked SAFE_FOR_PHASE_2_10 or NOT_READY.
- [ ] No projector is implemented.

## Architecture honesty

- [ ] Additional-structure cases are not mislabeled as projector gaps.
- [ ] Cross-claim cases are not mislabeled as direct projection.
- [ ] Participant-resolution cases are explicit.
- [ ] Assertion/modality blocks are explicit.
- [ ] Intentionally non-relational atoms are allowed to remain non-relational.
- [ ] Validator-contract mismatches are not patched.
- [ ] Taxonomy mismatches are not coerced into existing kinds.

## Scope

- [ ] No candidate projector implementation.
- [ ] No changes to atomic grounding semantics.
- [ ] No structured-claim changes.
- [ ] No relation-validator changes.
- [ ] No taxonomy changes.
- [ ] No cross-claim proof engine.
- [ ] No all-40 run.
- [ ] No LLM/provider calls.
- [ ] No maps/diagrams.
- [ ] No V3.5 changes.

## Completion

- [ ] Inventory tooling/tests pass.
- [ ] Existing focused tests remain green.
- [ ] 45 golden fixtures remain green.
- [ ] Final History typecheck passes.
- [ ] Targeted ESLint passes.
- [ ] Deterministic repeat passes.
- [ ] Successful state committed.
- [ ] Immutable inventory tag created.
- [ ] Timestamped review artifact generated.
- [ ] Checksums pass.
- [ ] ZIP integrity passes.

Stop after Phase 2.9.

Do not automatically implement Phase 2.10.
