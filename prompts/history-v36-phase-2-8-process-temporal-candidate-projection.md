# V3.6 Phase 2.8 — Deterministic Process + Temporal Candidate Projection

## Mission

Implement the next V3.6 step:

> Convert already-grounded native `process-sequence` and `precedes` atomic semantics into deterministic V3.6 relation candidates, then validate them with the UNCHANGED `ExplanatoryRelation` validator on the SAME eight representative episodes.

This task must also resolve the Phase 2.7 provenance ambiguity between:

```text
history-v3.5-frozen-before-v36
```

its annotated tag-object SHA, and the peeled commit SHA.

Do not redesign the structured-claim contract.

Do not change atomic-grounding semantics.

Do not add cross-claim proof.

Do not add live LLM calls.

Do not implement maps or diagrams.

Do not modify V3.5 production semantics.

Do not run all 40 episodes.

---

# Accepted baselines

Phase 2.7 implementation/report:

```text
IMPLEMENTATION_SHA:
8e40dda

REPORT_SHA:
c71189e

TAG:
history-v3.6-native-process-temporal-baseline
```

Resolve full SHAs from Git.

Phase 2.6:

```text
history-v3.6-native-structured-claims-baseline
```

Contract baseline:

```text
022f2177cc0e66f47cb5d652d6d456ce12a5a7be
history-v3.6-contract-preflight-baseline
```

Frozen V3.5 tag:

```text
history-v3.5-frozen-before-v36
```

Accepted V3.5 semantic baseline:

```text
82b4192f6e832523ce00675e39593e3f98a96403
history-v3.5-semantic-baseline
```

Do not guess any missing SHA.

Use Git as authority.

---

# Phase 0 — Mandatory checkpoint and provenance reconciliation

Before edits:

```bash
git status --short
git branch --show-current
git rev-parse HEAD
git log --oneline --decorate -20

git rev-parse history-v3.5-frozen-before-v36
git rev-parse 'history-v3.5-frozen-before-v36^{}'
git cat-file -t history-v3.5-frozen-before-v36

git rev-parse history-v3.6-native-process-temporal-baseline
git rev-parse 'history-v3.6-native-process-temporal-baseline^{}'
```

Record:

```text
CURRENT_HEAD

V35_FROZEN_TAG_OBJECT_SHA
V35_FROZEN_PEELED_COMMIT_SHA
V35_FROZEN_TAG_TYPE

PHASE27_TAG_OBJECT_SHA
PHASE27_PEELED_COMMIT_SHA
```

Create an immutable pre-task checkpoint:

```text
history-v3.6-pre-process-temporal-candidate-projection
```

Use a versioned equivalent if occupied.

Do not move or overwrite existing tags.

No destructive Git.

Leave unrelated worktree changes untouched.

---

# P0 — Fix provenance semantics if required

Phase 2.6 review previously recorded:

```text
frozenV35ProductionCommitSha:
f04262c16bfd1a89d1b404b1ac291a89dc699a0d
```

Phase 2.7 artifact reported:

```text
frozenV35ProductionCommitSha:
149a2d160b140d13a97f66155a4b8705f6adf652
```

for the same tag:

```text
history-v3.5-frozen-before-v36
```

Determine exact Git meaning.

If:

```text
149a2d1... = annotated tag object
f04262c... = peeled commit
```

then correct provenance so:

```text
frozenV35ProductionCommitSha = peeled commit SHA
```

A field named `CommitSha` must NEVER contain an annotated tag-object SHA.

Optionally add:

```text
frozenV35ProductionTagObjectSha
```

as a separate field if useful.

Do not change the tag.

Do not rewrite historical Git.

---

# Provenance contract rules

Use explicit semantics:

```text
...CommitSha
=> peeled commit object

...TagObjectSha
=> annotated tag object if present

...Tag
=> human-readable tag name
```

Apply this consistently to the Phase 2.8 review artifact.

If a provenance schema/version change is required:

version it correctly and update focused schema tests.

Do not reintroduce ambiguous legacy aliases.

---

# Phase 0.1 — Green preflight

Run focused:

```text
History package typecheck
Phase 2.7 structured-claim/process-temporal tests
V3.6 relation/schema tests
```

Do not proceed until green.

If a failure is unrelated to Phase 2.8 scope:

record it and do not broaden the task.

---

# Phase 2.7 evidence

Current representative result:

```text
native claims:                21
native propositions:          22

process propositions:          2
temporal propositions:         2

insufficient structure:       60
atomic propositions:           41

atomic process:                2
atomic temporal:               2

candidate count:              45
validated relations:          23

process relations:             0
temporal-sequence relations:   0
```

Miss classification:

```text
native structure absent:                 60
native structure / atomic gap:            0
atomic grounding / candidate gap:        16
candidate proposed / validator reject:    0
cross-claim proof gap:                    1
taxonomy gap:                             0
unresolved participant:                   0
```

This Phase 2.8 task should address ONLY the candidate projection for the four already-existing process/temporal atoms.

Do not attempt to solve the other candidate-projection gaps broadly.

---

# Representative corpus — EXACTLY unchanged

Use only:

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

Resolve exact IDs from Phase 2.7 artifacts.

Do not add episodes.

Do not run all 40.

---

# Architecture boundary

Required flow:

```text
native structured proposition
        ↓
atomic grounding
        ↓
NEW direct candidate projection
        ↓
UNCHANGED ExplanatoryRelation validator
        ↓
validated shadow relation
```

Allowed new projection:

```text
atomic process-sequence
    -> process candidate
```

```text
atomic precedes
    -> temporal-sequence candidate
```

Forbidden:

```text
claim prose parsing
adjacent claim composition
implicit historical inference
cross-claim proof
new relation kinds
validator weakening
```

---

# Process candidate projection

Project ONLY from an atomic proposition that already explicitly encodes a valid ordered process sequence.

Required atomic evidence:

```text
process identity/grouping metadata
ordered steps
>= 2 steps
contiguous order
assertion/modality
exact source lineage
```

The candidate must preserve:

```text
step order
step participant IDs
support claim IDs
atomic grounding IDs
assertion semantics
```

Do not infer additional steps.

Do not reorder steps.

---

# Critical process-container guard

Phase 2.7 introduced semantic grouping labels such as:

```text
Franklin expedition southward progression
Norman combined attack
```

These may be useful internal grouping metadata.

They must NOT become independent historical evidence or semantic participants unless the source claim explicitly contains/resolves them.

For process relation identity and support:

prefer:

```text
ordered supported steps
```

as the semantic authority.

The synthetic process-container label must not:

```text
create a new concept fact
satisfy missing evidence
appear as a historical claim participant
be used to pass validation independently
```

If the existing `ProcessRelation` contract requires a process concept:

use only a deterministic non-authoritative grouping ID/metadata field if allowed by the contract.

If the contract instead requires a canonical concept participant that cannot be sourced safely:

STOP and report a contract mismatch.

Do not fabricate a concept ID.

---

# Process semantic identity

The existing V3.6 semantic identity rules remain authoritative.

Expected semantics conceptually:

```text
episodeId
kind = process
ordered steps[]
```

Order is identity-bearing.

Evidence IDs are NOT semantic identity.

Reversing steps must yield a different semantic relation ID.

Equivalent ordered steps must deduplicate.

---

# Process assertion status

Do not admit a completed/asserted process relation if one or more steps are only:

```text
intended
attempted
uncertain
```

unless the existing relation contract/validator explicitly supports that semantics.

Preserve fail-closed behavior.

Do not convert intent into completion.

---

# Temporal-sequence candidate projection

Project ONLY from explicit atomic temporal ordering.

Required:

```text
before event
after event
direction
assertion/modality
exact source lineage
```

Conceptually:

```text
A precedes B
```

may project to:

```text
temporal-sequence:
[A, B]
```

Do not infer:

```text
A causes B
```

---

# Temporal identity

Order is semantic.

```text
[A, B]
```

must differ from:

```text
[B, A]
```

for temporal sequence.

Same ordered event sequence must deduplicate.

Support/evidence identity remains separate.

---

# Temporal assertion status

If the temporal proposition is:

```text
uncertain
intended
attempted
```

do not silently promote it to asserted chronology.

Use the current validator semantics.

If no safe relation representation exists:

reject/fail closed.

---

# Explicit Phase 2.7 controls

Evaluate these four cases.

## Franklin process

Source-supported steps:

```text
wintered there
→ sailed south through Peel Sound
```

Expected:

```text
process candidate
```

ONLY if the existing ProcessRelation contract can represent the supported ordered steps without treating the synthetic process-container label as historical evidence.

---

## 1066 process

Source-supported steps:

```text
infantry advanced
→ cavalry advanced
```

Expected:

```text
process candidate
```

subject to the same grouping/evidence guard.

Do not infer causal relationship.

---

## Titanic temporal

Atomic:

```text
collision
precedes
Thomas Andrews inspecting the damage
```

Expected candidate:

```text
temporal-sequence:
collision
→ inspection
```

No causality implied.

---

## Chernobyl temporal

Atomic:

```text
explosion
precedes
evacuation beginning
```

Expected candidate:

```text
temporal-sequence:
explosion
→ evacuation beginning
```

No causality implied.

---

# Candidate source type

Use an existing typed source if a generic structured/atomic source exists.

If a new source discriminator is required, add the smallest explicit variants, conceptually:

```text
atomic-process-projection
atomic-temporal-projection
```

Do not proliferate categories.

Source type is provenance, not semantic identity.

---

# Candidate provenance

Every projected candidate must include:

```text
episodeId
support claim IDs
atomic grounding IDs
structured proposition IDs
projection rule ID
candidate source type
```

Projection rule IDs should be stable/versioned.

Example:

```text
atomic-process-sequence-candidate.v1
atomic-precedes-temporal-candidate.v1
```

Use repository naming conventions.

---

# Projection rule IDs

Add only these two rules unless repository architecture already has generic equivalents:

```text
process-sequence atom -> process relation candidate
precedes atom -> temporal-sequence relation candidate
```

Do NOT add:

```text
movement
policy-response
causal
dependency
evidence-set
```

projection changes in this task.

---

# No broad candidate-gap remediation

Phase 2.7 reported:

```text
candidate-projection gaps = 16
```

Four are newly exposed process/temporal atoms.

This task is NOT permission to solve all 16.

Only address gaps directly attributable to:

```text
the 2 process atoms
the 2 temporal atoms
```

After Phase 2.8, report the remaining candidate-projection gap count honestly.

---

# Validator remains unchanged

Hard requirement:

```text
ExplanatoryRelation validator source code unchanged
```

Do not:

```text
add exceptions
relax proposition support
relax directionality
relax cardinality
relax proper-name atomicity
```

If a candidate is rejected:

record why.

Do not patch the validator to make the candidate pass.

---

# Relation taxonomy unchanged

Use existing:

```text
process
temporal-sequence
```

relation kinds.

Do not add new relation kinds.

Do not change their schema.

---

# Directness invariant

Every new process/temporal candidate must be directly reconstructible from the atomic proposition that created it.

Add a test asserting:

```text
candidate semantic participants/order
==
atomic semantic participants/order
```

No hidden prose-derived participant may appear.

---

# No cross-claim composition

One atomic proposition may carry source evidence from its canonical claim.

Do not combine:

```text
claim A + claim B
```

to form a process or temporal candidate in this task.

Cross-claim proof remains a future phase.

---

# Duplicate handling

If two atoms produce the same semantic process/temporal relation:

```text
same semanticRelationId
```

and evidence must merge deterministically.

Do not emit duplicate validated relations.

Add dedup tests.

---

# Negative controls

Add focused negative tests.

## Process

Reject/no candidate when:

```text
<2 steps
non-contiguous order
duplicate step index
unordered list only
synthetic grouping label without supported steps
intended steps treated as completed process
```

## Temporal

Reject/no candidate when:

```text
before == after
direction missing
claim array order is the only evidence
chronology inferred from sentence order alone
uncertain/intended semantics cannot be represented safely
```

---

# Chronology != causality

Hard regression:

A temporal candidate may ONLY become:

```text
temporal-sequence
```

Never:

```text
causal
```

unless a separate explicit causal atomic proposition independently exists.

Add test.

---

# Process != causality

An ordered process:

```text
step A
→ step B
```

must not automatically emit:

```text
A causes B
```

Add test.

---

# Representative before/after metrics

Compare Phase 2.7 to Phase 2.8.

Baseline:

```text
candidates:             45
validated:              23
process relations:       0
temporal relations:      0
candidate gaps:         16
```

Report:

```text
new process candidates
new temporal candidates

process candidate validator accepts
process candidate validator rejects

temporal candidate validator accepts
temporal candidate validator rejects

combined candidates before/after
validated relations before/after

process relations before/after
temporal-sequence before/after

candidate-projection gaps before/after
```

Do not require all four to validate.

---

# Main acceptance hypothesis

Phase 2.8 succeeds if:

> explicit atomic process/temporal semantics can be lowered into deterministic relation candidates without introducing new semantic inference or safety violations.

It is acceptable if some/all candidates fail validation due to a genuine contract/support mismatch.

Do not force a positive count.

---

# Manual review set

Include all four target cases plus every new candidate/rejection.

For each:

```text
episode
claimId
structured proposition ID
atomic grounding ID
candidate source/rule
candidate semantic content
validator result
diagnostics
semantic relation ID if valid
```

Also show whether the process grouping label was:

```text
source-backed participant
or
non-authoritative grouping metadata
```

This field is mandatory for process review items.

---

# Miss classification after Phase 2.8

Update:

```text
native structure absent
native structure present / atomic gap
atomic grounding present / candidate gap
candidate proposed / validator reject
cross-claim proof gap
taxonomy gap
unresolved participant
```

Expected:

```text
atomic gap remains 0
```

If process/temporal projection works, candidate-gap count should decrease by up to four.

Any validator rejection moves into:

```text
candidate proposed / validator reject
```

Do not hide it.

---

# No all-40 run

Same eight episodes only.

Do NOT:

```text
run all 40
regenerate all corpus review artifacts
expand process/temporal fixtures to unrelated episodes
```

The next all-40 measurement will be a separate decision.

---

# No live provider / LLM

Hard requirement:

```text
provider calls = 0
live relation LLM calls = 0
```

Do not enable:

```text
HISTORY_V36_LLM_SHADOW_PROPOSER
```

No web research.

No external historical facts.

---

# V3.5 isolation

V3.5 production code/behavior remains unchanged.

If only V3.6 candidate projection/provenance code changes:

no V3.5 regeneration is required.

If shared code changes unexpectedly:

run focused V3.5 regression/hash checks.

Do not regenerate full V3.5 approval packs unless semantic behavior actually changes.

---

# Tests

Follow focused risk-based validation.

Run:

1. affected History typecheck preflight;
2. provenance tag-object/peeled-commit tests;
3. existing V3.6 schema/IR tests;
4. 45 golden fixtures;
5. Phase 2.7 structured/atomic regression tests;
6. process candidate projection unit tests;
7. temporal candidate projection unit tests;
8. directness invariant tests;
9. process grouping-label guard tests;
10. chronology-not-causality tests;
11. process-not-causality tests;
12. duplicate semantic-ID/evidence-merge tests;
13. assertion/modality candidate tests;
14. representative same-eight extraction tests;
15. miss-classification tests;
16. affected History typecheck;
17. targeted ESLint;
18. same-eight representative run;
19. deterministic repeat/hash check;
20. artifact schema/checksum/ZIP validation.

Do not run unrelated repository-wide suites.

---

# Hard safety gates

All must remain zero among validated relations:

```text
unsupported validated relations
duplicate semantic relation IDs
cross-episode support violations
directionality violations
cardinality violations
proper-name fragmentation
purpose-as-destination errors
schema-invalid relations
fabricated process order
fabricated temporal order
chronology-to-causality errors
process-to-causality errors
synthetic process-container treated as unsupported historical fact
```

If any is non-zero:

```text
verdict = FAIL
```

Do not weaken validation.

---

# Provenance review artifact fix

The final artifact must clearly distinguish:

```text
frozenV35ProductionCommitSha
frozenV35ProductionTag
frozenV35ProductionTagObjectSha
```

if the tag is annotated.

Do the same for Phase 2.8's own annotated tag if useful.

Commit fields must always contain peeled commits.

Add focused provenance-schema tests.

---

# Artifact

Generate:

```text
history-v3.6-process-temporal-candidate-review-YYYYMMDDTHHMMSSZ.zip
```

Include at least:

```text
README.md
architecture.md

provenance-reconciliation.json

process-temporal-candidate-summary.json
representative-summary.json
relation-comparison.json
miss-classification.json

manual-review.json
diagnostic-summary.json
decision-report.md

test-summary.json
invariant-test-summary.json
provenance.json
checksums.sha256
```

Reuse schema artifacts by reference/path unless changed.

Keep ZIP compact.

---

# Artifact provenance

Include:

```text
v36ImplementationCommitSha

phase27ImplementationCommitSha
phase27ReportCommitSha
phase27Tag

contractBaselineCommitSha

frozenV35ProductionCommitSha
frozenV35ProductionTag
frozenV35ProductionTagObjectSha

acceptedV35SemanticBaselineCommitSha

artifactKind
episodeSet
generatedAt
gitBranch
liveProviderCalls
```

Artifact kind:

```text
history-v3.6-process-temporal-candidate-review
```

Version provenance schema if required.

---

# Commit/tag

After all acceptance criteria pass:

Commit:

```text
feat(history): add v3.6 process and temporal candidate projection
```

Tag:

```text
history-v3.6-process-temporal-candidate-baseline
```

Use a versioned equivalent if occupied.

Do not overwrite existing tags.

Generate the final review artifact from the exact committed state.

Do not push unless repository policy permits it.

---

# Required completion report

Return:

1. Starting SHA/tag.
2. Typecheck preflight result.
3. V3.5 frozen tag type.
4. V3.5 frozen tag-object SHA.
5. V3.5 frozen peeled commit SHA.
6. Provenance correction made.
7. Phase 2.7 implementation/report SHAs.
8. Phase 2.7 tag.
9. Contract baseline SHA/tag.
10. Candidate projection module paths.
11. Process projection rule ID.
12. Temporal projection rule ID.
13. Candidate source types.
14. Process grouping-container treatment.
15. Process semantic identity inputs.
16. Temporal semantic identity inputs.
17. Evidence/provenance lineage model.
18. Tests added.
19. Golden fixture result.
20. Same-eight episode IDs.
21. Process atoms evaluated.
22. Temporal atoms evaluated.
23. Process candidates proposed.
24. Temporal candidates proposed.
25. Process validator accepts/rejects.
26. Temporal validator accepts/rejects.
27. Candidate count before/after.
28. Valid relation count before/after.
29. Process relation count before/after.
30. Temporal relation count before/after.
31. Candidate-projection gaps before/after.
32. Candidate-proposed-validator-reject gaps before/after.
33. Cross-claim proof gap count.
34. Taxonomy gap count.
35. Unresolved participant count.
36. Newly validated relations with exact lineage.
37. Hard safety invariant counts.
38. Determinism result.
39. Final History typecheck.
40. Targeted ESLint result.
41. Live provider calls = 0.
42. V3.5 unchanged confirmation.
43. Final commit SHA.
44. Immutable tag.
45. Review artifact path.
46. Artifact SHA-256/checksum result.
47. Recommend exactly ONE next task; do not execute it.

---

# Acceptance criteria

Complete only when all are true.

## Provenance

- [ ] Annotated tag object vs peeled commit is explicitly resolved.
- [ ] `frozenV35ProductionCommitSha` contains the peeled commit.
- [ ] Tag-object SHA is stored separately if needed.
- [ ] Existing tags are not moved.
- [ ] Provenance tests pass.

## Process projection

- [ ] Only explicit process atomic semantics can create process candidates.
- [ ] Ordered steps are preserved exactly.
- [ ] No steps are inferred from prose.
- [ ] No process order is inferred from claim/list order.
- [ ] Synthetic process-container labels are not treated as independent historical facts.
- [ ] Process candidate evidence comes from supported ordered steps.
- [ ] Process does not imply causality.

## Temporal projection

- [ ] Only explicit `precedes`/temporal atomic semantics create temporal candidates.
- [ ] Direction is preserved exactly.
- [ ] Temporal sequence does not imply causality.
- [ ] Claim array order is not temporal evidence.
- [ ] Same-event before/after cannot validate.
- [ ] Assertion/modality is preserved.

## Downstream safety

- [ ] Existing `ExplanatoryRelation` validator is unchanged.
- [ ] Relation taxonomy is unchanged.
- [ ] Semantic-ID rules are unchanged.
- [ ] Evidence-fingerprint rules are unchanged.
- [ ] Duplicate semantic relations converge.
- [ ] Rejected candidates are recorded, not patched around.

## Representative scope

- [ ] Same eight episodes only.
- [ ] The 2 process atoms are explicitly evaluated.
- [ ] The 2 temporal atoms are explicitly evaluated.
- [ ] No unrelated candidate-projection gaps are remediated.
- [ ] Miss classification is updated honestly.

## Hard invariants

- [ ] Unsupported validated relations = 0.
- [ ] Duplicate semantic IDs = 0.
- [ ] Cross-episode support violations = 0.
- [ ] Directionality violations = 0.
- [ ] Cardinality violations = 0.
- [ ] Proper-name fragmentation = 0.
- [ ] Purpose-as-destination errors = 0.
- [ ] Invalid relations = 0.
- [ ] Fabricated process order = 0.
- [ ] Fabricated temporal order = 0.
- [ ] Chronology-to-causality errors = 0.
- [ ] Process-to-causality errors = 0.
- [ ] Synthetic grouping labels used as unsupported historical facts = 0.

## Scope

- [ ] No all-40 run.
- [ ] No live LLM.
- [ ] No provider calls.
- [ ] No maps.
- [ ] No diagrams.
- [ ] No V3.5 semantic changes.
- [ ] No cross-claim proof engine.
- [ ] No candidate-extractor redesign beyond the two direct projection rules.
- [ ] No narration/TTS/localization/rendering changes.

## Completion

- [ ] Focused tests pass.
- [ ] Final History typecheck passes.
- [ ] Targeted ESLint passes.
- [ ] Determinism passes.
- [ ] Successful state committed.
- [ ] Immutable Phase 2.8 tag created.
- [ ] Timestamped review artifact generated.
- [ ] Checksums pass.
- [ ] ZIP integrity passes.

Stop after Phase 2.8.

Do not automatically execute the recommended next task.
