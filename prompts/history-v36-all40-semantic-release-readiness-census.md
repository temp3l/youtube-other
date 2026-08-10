# History V3.6 — Autonomous All-40 Semantic Census + Release-Readiness Audit

## Goal

Run a **read-only all-40 V3.6 semantic census and release-readiness audit** from the latest accepted semantic baseline.

The representative semantic backlog is considered drained.

The purpose of this run is NOT to fix more semantic gaps.

The purpose is:

> Determine whether the accepted V3.6 semantic architecture remains safe, deterministic, useful, and internally consistent across all 40 history episodes before moving into compiler/map/diagram integration.

This is a census/audit phase.

Do not mutate semantic behavior during the census.

Do not add new relation kinds.

Do not add new candidate projectors.

Do not change structured-claim semantics.

Do not change atomic grounding.

Do not change relation validation.

Do not change V3.5.

---

# Starting baseline

Latest accepted autonomous event-location close:

```text
HEAD:
72b4ee8010f22f6ea3c663edc8c3e90dbeb7aa67

TAG:
history-v3.6-autonomous-event-location-drain-baseline
```

Latest accepted relation admission baseline:

```text
history-v3.6-event-location-admission-baseline
```

Earlier accepted semantic baselines include:

```text
history-v3.6-modal-causal-admission-baseline
history-v3.6-proof-aware-policy-response-admission-baseline
history-v3.6-evidence-set-candidate-baseline
history-v3.6-transforms-causal-candidate-baseline
history-v3.6-process-temporal-candidate-baseline
history-v3.6-native-structure-gap-enrichment-baseline-v2
history-v3.6-native-process-temporal-baseline
history-v3.6-native-structured-claims-baseline
```

Frozen V3.5:

```text
commit:
f04262c16bfd1a89d1b404b1ac291a89dc699a0d

tag:
history-v3.5-frozen-before-v36

annotated tag object:
149a2d160b140d13a97f66155a4b8705f6adf652
```

Use Git as authority.

Resolve all full SHAs from tags before execution.

Never move accepted tags.

---

# Accepted Gate A decision

The remaining movement/source-incomplete cases are intentionally left unrepresented.

Do NOT reopen them during this census.

Known terminal/non-actionable cases include:

```text
Franklin:
Northwest Passage remains objective, not destination

Spanish Armada:
origin-only / intended-route semantics remain insufficient
for accepted movement relation shape

intentionally non-relational locator/descriptive cases:
remain non-relational
```

These are not census failures.

Treat them as expected terminal states.

---

# Current representative architecture

Accepted V3.6 relation kinds include:

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
event-location
```

Do not add more.

Accepted semantic mechanisms include:

```text
native StructuredClaimV36
atomic grounding
deterministic candidate projection
per-kind modality where accepted
CrossClaimProofV36
proof-aware multi-claim evidence
deterministic ExplanatoryRelation validation
semantic relation IDs
separate evidence fingerprints
```

---

# Current representative-state outcome

From the latest same-eight autonomous run:

```text
candidates:           56
validated relations:  34

approved actionable gaps: 0

remaining terminal/unrepresented:
2 source-incomplete movement
1 architecture-blocked movement
2 intentionally non-relational
```

Use repository artifacts as authority if counts differ.

Do not hard-code the above as expected all-40 values.

---

# Core rule — READ ONLY SEMANTICALLY

The census may:

```text
run existing V3.6 extraction
run existing native structured generation
run existing atomic grounding
run existing candidate projection
run existing proof construction where already authorized
run existing validators
aggregate metrics
generate reports
generate diagnostics
compare determinism
compare V3.5 isolation
```

The census must NOT:

```text
change relation semantics
change relation taxonomy
change validator behavior
change candidate rules
change structured claim rules
change atomic grounding rules
change proof rules
add fixtures to make failures pass
repair individual episodes
reclassify source-incomplete semantics as valid relations
```

If a new systemic defect appears:

REPORT IT.

Do not fix it in this run.

---

# Phase 0 — Mandatory preflight

Run:

```bash
git status --short
git branch --show-current
git rev-parse HEAD
git log --oneline --decorate -30

git rev-parse history-v3.6-autonomous-event-location-drain-baseline
git rev-parse 'history-v3.6-autonomous-event-location-drain-baseline^{}'

git rev-parse history-v3.6-event-location-admission-baseline
git rev-parse 'history-v3.6-event-location-admission-baseline^{}'

git rev-parse history-v3.5-frozen-before-v36
git rev-parse 'history-v3.5-frozen-before-v36^{}'
```

Verify HEAD is at or cleanly descends from the accepted baseline.

Run focused preflight:

```text
History package typecheck
targeted ESLint
latest relation/validator tests
latest proof-aware tests
latest modality tests
46 golden semantic fixtures
same-eight deterministic regression
```

Proceed only if green.

Create immutable audit checkpoint:

```text
history-v3.6-pre-all40-semantic-census
```

Use a versioned equivalent if occupied.

No destructive Git operations.

Leave unrelated worktree changes untouched.

---

# Corpus scope

Run exactly the full accepted:

```text
40 history episodes
```

Use the canonical production/shadow episode set already used by earlier all-40 V3.6 census work.

Do not silently substitute fixture-only episodes.

Record exact:

```text
episode IDs
episode titles
source revision/baseline
claim count
```

If the corpus does not reconcile to 40:

STOP and report.

---

# Census objectives

Measure at minimum:

## Claims / structure

```text
canonical claim count

native structured claim count
compatibility-backfill structured claim count

native structured proposition count
compatibility proposition count

claims with insufficient structure
unresolved participants
diagnostics by code
```

---

## Atomic grounding

```text
atomic proposition total

atomic counts by predicate
atomic assertion-status distribution

native-origin atoms
compatibility-origin atoms

atomic grounding diagnostics
```

---

## Relation candidates

```text
candidate total
candidate counts by source rule
candidate counts by relation kind
candidate rejection count
candidate rejection diagnostics
```

---

## Validated relations

```text
validated total
validated count by relation kind

assertion/modality distribution
relation support cardinality
single-claim vs proof-backed support

semantic duplicate collapse count
evidence merge count
```

---

## Cross-claim proofs

```text
proof proposals
proof accepts
proof rejects

proof patterns
proof-backed relation count

proof assertion-status combinations
proof join types
```

Only existing authorized proof patterns may run.

Do not discover new proof patterns.

---

# Relation-kind distribution

Produce all-40 counts for:

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
event-location
```

Explicitly report zero-count kinds.

Do not treat zero as failure by itself.

---

# Modality distribution

Report exact assertion/modality distribution across:

```text
causal
policy-response
event-location
movement if supported
other relation kinds with accepted modality fields
```

Distinguish:

```text
asserted
uncertain
intended
attempted
counterfactual
reported
```

Use authoritative enum values.

Do not flatten.

---

# Native vs compatibility coverage

This is a key release-readiness metric.

Report:

```text
episodes with any native structured semantics
episodes with only compatibility semantics
claims with native structure
claims with compatibility-only structure
relations supported by native semantics
relations supported only by compatibility semantics
```

Do not call compatibility-derived semantics native.

---

# Terminal/unrepresented cases

Track explicitly:

```text
source-incomplete movement
architecture-blocked movement
intentionally non-relational
assertion/modality-blocked
taxonomy mismatch
participant resolution
cross-claim proof pending
```

The accepted representative terminal cases should remain terminal unless repository semantics differ.

Do not force these counts to zero.

---

# New systemic-failure detection

The main purpose of the all-40 census is to discover whether failures appear outside the representative eight.

Create a system-level finding only when:

```text
same defect occurs across multiple episodes
or
a hard safety invariant is violated
or
a new relation family behaves inconsistently
or
semantic-ID/evidence behavior is unstable
or
native/compatibility provenance is incorrect
```

Do not create a high-level finding for a single expected source-incomplete claim.

---

# Hard semantic safety invariants

Measure all applicable invariants across all 40.

All MUST remain zero:

```text
unsupported validated relations
duplicate semantic relation IDs after dedup
cross-episode relation support
cross-episode proof support

directionality violations
cardinality violations

proper-name fragmentation
purpose-as-destination errors
intent-as-completed-movement errors

chronology-to-causality errors
process-to-causality errors
comparison-to-movement errors

generic locator -> event-location overgeneration
non-event entity locator admitted as event-location

modality loss
modality strengthening
wrong-premise modality attachment

unresolved participant admission
synthetic grouping metadata treated as historical fact

proof from proximity alone
proof without explicit join
invalid proof admitted

compatibility backfill mislabeled native

legacy relation semantic drift
unexpected semantic-ID churn
unexpected evidence-fingerprint churn

schema-invalid structured claims
schema-invalid atomic grounding
schema-invalid proofs
schema-invalid relations
```

If any hard invariant is non-zero:

```text
RELEASE_READINESS = BLOCKED
```

Do not remediate it during this census.

---

# Determinism

Run the full semantic census twice from identical frozen inputs.

Require deterministic equality for at least:

```text
episode inventory
claim IDs
structured proposition IDs
atomic grounding IDs
candidate semantic content
validated relation IDs
proof IDs
relation-kind counts
diagnostic counts
terminal-gap classifications
```

Record one aggregate deterministic census hash.

If repeat differs:

```text
RELEASE_READINESS = BLOCKED
```

Do not patch in this run.

---

# Semantic ID stability

Compare accepted representative relations against their frozen baselines.

Require:

```text
same semantic relation IDs
same semantic content
same modality
same proof linkage
```

unless a later accepted baseline intentionally superseded them.

No unexplained ID churn.

---

# Evidence fingerprint stability

For unchanged evidence:

```text
same evidence fingerprint
```

Require no unexpected churn.

If evidence aggregation order changes but canonical evidence set is same:

fingerprint must remain deterministic according to accepted architecture.

---

# V3.5 isolation audit

Verify all-40 census work does NOT change V3.5 production behavior.

At minimum check:

```text
frozen V3.5 commit/tag unchanged
no V3.5 source modifications
no V3.5 plan hash changes
no V3.5 approval artifact regeneration
no shared schema change altering V3.5 serialization
```

If shared infrastructure is exercised:

run only focused isolation/hash checks.

---

# No live provider / LLM

Hard requirement:

```text
provider calls = 0
LLM semantic calls = 0
```

Use frozen deterministic/native/fixture paths only.

If all-40 native semantics cannot run without paid/provider generation:

record exactly what is unavailable.

Do not execute live generation.

---

# Performance / operational census

Also record lightweight operational metrics:

```text
wall-clock duration by stage
peak candidate count per episode
peak proof count per episode
largest relation count per episode
cache-hit metrics where available
deterministic rerun reuse
```

Do not optimize performance during this run.

Only report significant pathological behavior.

---

# Episode-level summary

For every episode produce one compact machine-readable record:

```text
episodeId
title
claimCount

nativeStructuredClaims
compatibilityStructuredClaims

atomicCount
candidateCount
validatedRelationCount

relationCountsByKind
proofCount

diagnosticsByCategory
terminalGapCount
hardInvariantViolations

determinismStatus
```

Do not dump full narration.

---

# Cross-episode aggregate summary

Produce aggregate:

```text
total claims
total native structured claims
total native propositions
total atoms
total candidates
total validated relations
total proofs

relation distribution
modality distribution
diagnostic distribution

episodes with zero relations
episodes with unusually high/low relation density

terminal/unrepresented category counts

hard invariant totals
```

---

# Density analysis

Compute bounded relation density:

```text
relations per 100 claims
candidates per 100 claims
native propositions per 100 claims
```

Identify outliers.

Do NOT automatically classify an outlier as defective.

Review only if paired with semantic diagnostics.

---

# Existing earlier all-40 comparison

Compare against the earlier pre-native V3.6 all-40 census where available:

Earlier known baseline:

```text
claims:              3,774
atomic propositions: 111
candidates:           236
validated relations: 103
```

and relation-kind distribution from that census.

Use actual repository artifact if available.

Report changes attributable to accepted V3.6 architecture evolution.

Do not claim exact longitudinal comparison where corpus/revision differs.

---

# V3.5/V3.6 differential honesty

Do not fabricate exact relation-level pairing with V3.5 if no authoritative pairing exists.

Keep distinctions explicit:

```text
episode-level presence comparison
aggregate relation-signal comparison
paired relation comparison only where exact deterministic pairing exists
```

No fake one-to-one alignment.

---

# Release-readiness decision

Classify final result exactly:

```text
READY_FOR_V36_COMPILER_SHADOW_INTEGRATION

READY_WITH_NONBLOCKING_TERMINAL_CASES

BLOCKED_BY_SYSTEMIC_SEMANTIC_DEFECT

BLOCKED_BY_DETERMINISM

BLOCKED_BY_PROVENANCE_OR_IDENTITY

BLOCKED_BY_CORPUS_EXECUTION
```

Prefer:

```text
READY_WITH_NONBLOCKING_TERMINAL_CASES
```

if the only remaining issues are already accepted source-incomplete/non-relational terminal items and all hard invariants are zero.

---

# Human gate after census

If:

```text
all hard invariants = 0
determinism = PASS
V3.5 isolation = PASS
no new systemic semantic failure class
```

then recommend:

```text
V3.6 compiler shadow integration
```

as the next major stage.

Do NOT implement maps/diagrams in this census.

If blocked:

return one bounded blocker packet with:

```text
systemic defect
affected episodes
affected relations
root layer
why it is systemic
recommended next architecture task
```

Do not fix it automatically.

---

# Compiler readiness checklist

Before recommending compiler integration, verify:

```text
relation contracts frozen/versioned
relation IDs deterministic
proof IDs deterministic
modality semantics explicit
event-location stable
policy-response proof path stable
evidence-set aggregation stable
candidate/validator pipeline deterministic
terminal movement cases intentionally excluded
V3.5 isolated
```

---

# Artifact

Generate:

```text
history-v3.6-all40-semantic-release-readiness-<timestamp>.zip
```

Include at least:

```text
README.md
decision-report.md

episode-census.json
aggregate-census.json
relation-kind-distribution.json
modality-distribution.json
native-compatibility-coverage.json

candidate-summary.json
validator-summary.json
proof-summary.json
terminal-gap-summary.json

determinism-summary.json
semantic-id-stability.json
evidence-fingerprint-stability.json
v35-isolation-summary.json

systemic-findings.json
compiler-readiness.json

test-summary.json
invariant-summary.json
performance-summary.json
provenance.json
checksums.sha256
```

Keep it compact.

Do not embed old ZIPs.

Reference prior artifacts/SHAs where needed.

---

# Journal/report

Create:

```text
docs/reports/codex-runs/
2026-08-09-history-v36-all40-semantic-release-readiness.md
```

Keep concise:

```text
baseline
corpus
aggregate metrics
relation distribution
terminal cases
invariants
determinism
V3.5 isolation
release-readiness verdict
next recommendation
```

No huge logs.

---

# Git policy

This run should not modify semantic production code.

Allowed modifications are limited to:

```text
read-only census tooling
report generators
tests needed for census integrity
docs/reports
artifacts
```

If semantic source code would need modification:

STOP.

Do not make the fix in this run.

Commit only audit/report tooling and outputs.

Suggested commit:

```text
chore(history): audit v3.6 all-40 semantic release readiness
```

Create immutable tag:

```text
history-v3.6-all40-semantic-release-readiness-baseline
```

Use a versioned equivalent if occupied.

Do not overwrite tags.

---

# Validation

Follow focused risk-based validation.

Run:

1. History typecheck preflight;
2. targeted ESLint;
3. current V3.6 semantic/validator/proof test suites;
4. 46 golden fixtures;
5. same-eight deterministic regression;
6. all-40 census run #1;
7. all-40 census run #2;
8. deterministic census comparison;
9. semantic-ID stability checks;
10. evidence-fingerprint stability checks;
11. V3.5 isolation checks;
12. artifact schema validation;
13. checksums;
14. ZIP integrity.

Do not run unrelated repository-wide suites.

---

# Safe parallelism

Use one primary writer.

Read-only/disjoint subagents may separately inspect:

```text
all-40 relation distribution
determinism/identity
proof/modality behavior
V3.5 isolation
terminal gap classification
```

Do not let multiple agents edit census aggregation logic concurrently.

---

# Token discipline

Keep context bounded:

```text
machine-readable episode summaries
aggregate metrics
exact diagnostics
no full narration dumps
no repeated architecture restatements
reuse frozen artifacts
```

Avoid broad repo rereads.

---

# Required final response

Return one compact report:

```text
ALL-40 V3.6 SEMANTIC CENSUS:
PASS / BLOCKED

baseline:
...

corpus:
40/40

claims:
...

native structured:
...

atomic propositions:
...

candidates:
...

validated relations:
...

relation distribution:
movement ...
spatial-comparison ...
spatial-area ...
causal ...
dependency ...
process ...
temporal-sequence ...
policy-response ...
evidence-set ...
event-location ...

proofs:
...

terminal/unrepresented:
...

hard invariants:
all zero / exact failures

determinism:
PASS / FAIL
hash: ...

V3.5 isolation:
PASS / FAIL

new systemic failure classes:
none / list

release-readiness:
READY_FOR_V36_COMPILER_SHADOW_INTEGRATION
READY_WITH_NONBLOCKING_TERMINAL_CASES
or exact blocker

final commit:
...

tag:
...

artifact:
...

artifact SHA-256:
...

next recommendation:
exactly one task
```

Do not perform the next task.

---

# Acceptance criteria

Complete only when all are true.

## Corpus

- [ ] Exact accepted 40-episode corpus used.
- [ ] Episode IDs/titles recorded.
- [ ] 40/40 executed successfully or exact execution blocker reported.

## Semantic census

- [ ] Claims counted.
- [ ] Native/compatibility structure counted separately.
- [ ] Atomic grounding counted.
- [ ] Candidates counted.
- [ ] Validated relations counted.
- [ ] Relation kinds fully distributed.
- [ ] Modality distribution reported.
- [ ] Proof distribution reported.
- [ ] Terminal/unrepresented cases reported.

## Safety

- [ ] Unsupported validated relations = 0.
- [ ] Duplicate semantic relation IDs = 0.
- [ ] Cross-episode support violations = 0.
- [ ] Directionality violations = 0.
- [ ] Cardinality violations = 0.
- [ ] Proper-name fragmentation = 0.
- [ ] Purpose-as-destination = 0.
- [ ] Intent-as-completed-movement = 0.
- [ ] Chronology-to-causality = 0.
- [ ] Process-to-causality = 0.
- [ ] Comparison-to-movement = 0.
- [ ] Generic locator event-location overgeneration = 0.
- [ ] Modality loss = 0.
- [ ] Modality strengthening = 0.
- [ ] Wrong-premise modality = 0.
- [ ] Unresolved participant admission = 0.
- [ ] Synthetic grouping as historical fact = 0.
- [ ] Proof-from-proximity = 0.
- [ ] Invalid proof admission = 0.
- [ ] Backfill-as-native provenance error = 0.
- [ ] Schema-invalid persisted semantics = 0.

## Determinism

- [ ] All-40 run repeated from identical inputs.
- [ ] Stable aggregate hash.
- [ ] Stable relation IDs.
- [ ] Stable proof IDs.
- [ ] Stable counts.
- [ ] Stable terminal classifications.

## Compatibility

- [ ] Accepted representative relations stable.
- [ ] Legacy semantic IDs stable.
- [ ] Evidence fingerprints stable.
- [ ] V3.5 frozen commit/tag unchanged.
- [ ] No V3.5 semantic behavior changed.

## Scope

- [ ] No semantic remediation performed.
- [ ] No new projector.
- [ ] No new relation kind.
- [ ] No validator change.
- [ ] No structured-claim semantic change.
- [ ] No atomic-grounding semantic change.
- [ ] No proof-pattern change.
- [ ] No all-40 mutation/admission experiment outside existing accepted rules.
- [ ] No live provider/LLM calls.
- [ ] No compiler/map/diagram implementation.

## Completion

- [ ] Focused tests pass.
- [ ] 46 golden fixtures pass.
- [ ] Same-eight regression passes.
- [ ] Final History typecheck passes.
- [ ] Targeted ESLint passes.
- [ ] Audit/report state committed.
- [ ] Immutable all-40 census tag created.
- [ ] Timestamped review artifact generated.
- [ ] Checksums pass.
- [ ] ZIP integrity passes.
- [ ] Exactly one next task recommended.

Stop after the all-40 semantic release-readiness audit.
