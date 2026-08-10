# V3.6 Phase 2.10 — Single `transforms → causal` Candidate Projector

## Mission

Implement exactly ONE previously approved direct candidate-projection rule from the Phase 2.9 inventory:

```text
atomic-transforms-causal-candidate.v1
```

Mapping:

```text
atomic:
transforms(subject, object)

→

candidate:
causal(
  cause = subject,
  effect = object
)
```

This is a bounded micro-pass.

Do not implement any other projector.

Do not remediate the remaining 11 candidate gaps.

Do not change structured claims, atomic grounding, relation taxonomy, relation validation, V3.5, cross-claim proof, maps, diagrams, or provider behavior.

---

# Accepted baseline

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

Do not guess.

---

# Phase 2.9 inventory decision

Exactly 12 gaps were classified:

```text
DIRECT_PROJECTION_ELIGIBLE       1
NEEDS_ADDITIONAL_NATIVE_STRUCTURE 4
NEEDS_CROSS_CLAIM_PROOF           1
ASSERTION_OR_MODALITY_BLOCK       3
TAXONOMY_MISMATCH                 1
INTENTIONALLY_NON_RELATIONAL      2
PARTICIPANT_RESOLUTION_GAP        0
VALIDATOR_CONTRACT_MISMATCH       0
```

Only ONE projector is approved:

```text
atomic-transforms-causal-candidate.v1
```

Target:

```text
causal
```

Required mapping:

```text
subject -> cause
object  -> effect
```

Required assertion:

```text
asserted only
```

Do not reinterpret the other 11 gaps.

---

# Phase 0 — Preflight

Run:

```bash
git status --short
git branch --show-current
git rev-parse HEAD
git log --oneline --decorate -20

git rev-parse history-v3.6-candidate-gap-inventory-baseline
git rev-parse 'history-v3.6-candidate-gap-inventory-baseline^{}'

git rev-parse history-v3.5-frozen-before-v36
git rev-parse 'history-v3.5-frozen-before-v36^{}'
```

Verify current HEAD is at or descends cleanly from the Phase 2.9 accepted baseline.

Run focused History typecheck and the directly affected V3.6 candidate-projector tests before editing.

If preflight is not green:

fix only a directly related regression or stop and report the blocker.

Do not broaden scope.

Create immutable checkpoint:

```text
history-v3.6-pre-transforms-causal-projector
```

Use a versioned equivalent if occupied.

Do not move existing tags.

No destructive Git operations.

---

# Target case

The approved inventory case is the Black Death atomic proposition whose semantics are:

```text
predicate: transforms
assertion: asserted

subject:
the silence left by the dead

object:
labor value
```

The exact IDs, claim span, participant IDs, and provenance MUST be loaded from the Phase 2.9 inventory artifact/repository state.

Do not hard-code display strings as identity.

Do not rely on this prompt's paraphrase as source evidence.

Repository artifacts are authoritative.

---

# Architecture

Implement:

```text
existing atomic grounding
        ↓
NEW direct projector:
atomic-transforms-causal-candidate.v1
        ↓
existing candidate pipeline
        ↓
UNCHANGED ExplanatoryRelation validator
```

No prose parsing.

No adjacent-claim lookup.

No historical inference.

No secondary semantic enrichment.

---

# Projector eligibility

Emit a causal candidate ONLY when ALL conditions are true:

```text
atomic predicate == transforms
assertionStatus == asserted
subject exists
object exists
subject != object
both participants are canonical/resolved
source lineage is valid
```

If any requirement fails:

```text
no candidate
diagnostic if current architecture expects one
```

Fail closed.

---

# Exact semantic mapping

The direct semantic mapping is:

```text
subject -> cause
object  -> effect
```

Preserve direction exactly.

Never emit:

```text
object -> cause
subject -> effect
```

Do not add bidirectional candidates.

---

# Critical semantic guard

`transforms(A, B)` is eligible for this direct projector ONLY because Phase 2.9 explicitly classified this atomic predicate shape as containing complete causal semantics for this approved rule.

Do NOT generalize from:

```text
changes
affects
contains
compares
moves
depends
precedes
process-sequence
```

or any other predicate.

No generic "verb implies causal" machinery.

---

# Assertion/modality guard

Allowed:

```text
asserted
```

Blocked:

```text
uncertain
intended
attempted
counterfactual
reported
```

or any non-asserted status unless current schema represents an exact accepted causal assertion semantics and Phase 2.9 explicitly approved it.

For Phase 2.10:

```text
asserted only
```

Add negative tests.

---

# Participant guard

Require:

```text
cause != effect
```

Participants must use canonical bound IDs from the atomic proposition.

Do not invent concepts.

Do not derive participants from source prose.

Do not use unresolved strings.

---

# Evidence/provenance

Candidate lineage must retain:

```text
episodeId
claimId / support claim IDs
structured proposition ID
atomic grounding ID
projection rule ID
source span/hash lineage
```

Projection rule ID:

```text
atomic-transforms-causal-candidate.v1
```

Reuse existing Phase 2.8 candidate source/provenance conventions.

Do not create a parallel provenance model.

---

# Semantic ID

Use the existing V3.6 semantic relation identity implementation unchanged.

For causal semantics:

```text
cause/effect direction is identity-bearing
evidence IDs are not semantic identity
```

Equivalent semantic candidate output must deduplicate.

Do not change semantic-ID logic.

---

# Evidence fingerprint

Use existing evidence fingerprint logic unchanged.

Same semantic relation with different valid support:

```text
same semantic relation ID
merged/deterministic evidence provenance
```

Do not change fingerprint semantics.

---

# Validator

The existing deterministic `ExplanatoryRelation` validator is frozen.

Do NOT:

```text
relax causality rules
add transforms-specific validator exception
change participant cardinality
change proposition support
change directionality
change evidence requirements
```

If the newly projected candidate is rejected:

record exact rejection and stop remediation.

A validator rejection is an acceptable experimental outcome.

---

# Expected metric hypothesis

Phase 2.9 / Phase 2.8 accepted representative baseline:

```text
candidates:              49
validated relations:     27
candidate gaps:          12
```

Hypothesis if the approved case passes unchanged validation:

```text
candidates:              50
validated relations:     28
candidate gaps:          11
causal relations:        +1
```

These are NOT acceptance quotas.

Do not force these numbers.

If the candidate fails validation:

report actual:

```text
candidate proposed / validator reject
```

and do not weaken anything.

---

# Representative corpus

Use the SAME eight episodes only:

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

Do not run all 40.

Do not add fixtures for unrelated episodes.

---

# Other 11 gaps — frozen

Do not modify or reclassify:

```text
4 needs additional native structure
1 needs cross-claim proof
3 assertion/modality blocks
1 taxonomy mismatch
2 intentionally non-relational
```

Phase 2.10 must not alter their semantic behavior.

After implementation, verify they remain unchanged.

---

# Negative controls

Add focused tests proving NO candidate for:

```text
transforms with uncertain assertion
transforms with intended assertion
transforms with attempted assertion
transforms with same subject/object
transforms with unresolved participant
non-transforms predicate with same subject/object shape
reversed cause/effect mapping
```

Use real schema statuses and repository fixture conventions.

---

# Regression controls

Keep green:

```text
Franklin purpose != destination
Spanish intent != completed movement
D-Day comparison != movement
1066 unsupported bad chain stays unsupported
Titanic temporal != causal
Chernobyl temporal != causal
process sequence != causal
synthetic process grouping labels remain non-authoritative
```

---

# No semantic family expansion

Do NOT add projectors for:

```text
moves-from
located-in
depends-on
demands
restricts
search-object
contains-evidence-of
compares-with
precedes
process-sequence
```

Existing Phase 2.8 projectors remain untouched.

---

# Implementation location

Prefer extending the current authoritative V3.6 atomic candidate projector used in Phase 2.8.

Do not create a second candidate-projection engine.

Reuse:

```text
candidate source type conventions
projection rule registration
diagnostics
dedup
provenance
```

Keep code minimal.

---

# Tests

Follow focused risk-based validation.

Run:

1. History typecheck preflight;
2. existing Phase 2.8 candidate-projector tests;
3. Phase 2.9 inventory tests;
4. 45 golden fixtures;
5. new `transforms -> causal` positive test;
6. assertion/modality negative tests;
7. same-participant negative test;
8. unresolved-participant negative test;
9. non-transforms negative test;
10. directionality test;
11. directness/provenance-lineage test;
12. semantic-ID/dedup regression;
13. same-eight representative run;
14. remaining-11-gaps unchanged assertion;
15. affected History typecheck;
16. targeted ESLint;
17. deterministic repeat/hash;
18. artifact checksum/ZIP integrity.

Do not run unrelated repository-wide suites.

---

# Hard safety invariants

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
chronology-to-causality errors
process-to-causality errors
non-asserted transforms promoted to asserted causality
reversed transforms causality
invented/unresolved participant admission
```

If any is non-zero:

```text
verdict = FAIL
```

Do not weaken safeguards.

---

# No live provider / LLM

Hard requirement:

```text
provider calls = 0
LLM calls = 0
```

No web research.

No external historical facts.

---

# V3.5 isolation

V3.5 behavior remains unchanged.

Do not regenerate V3.5 approval packs.

If shared code is unexpectedly touched:

run focused V3.5 regression/hash checks.

Avoid shared code changes if possible.

---

# Artifact

Generate:

```text
history-v3.6-transforms-causal-candidate-review-YYYYMMDDTHHMMSSZ.zip
```

Include at least:

```text
README.md
architecture.md

transforms-causal-candidate-summary.json
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

Keep artifact compact.

---

# Manual review

Include:

```text
the one approved positive Black Death case
all newly generated transforms candidates
all transforms candidate rejections
all negative controls
```

For the positive case include:

```text
episodeId
claimId
structured proposition ID
atomic grounding ID
subject/cause participant
object/effect participant
assertion status
projection rule
candidate result
validator result
semantic relation ID if accepted
evidence lineage
```

---

# Provenance

Include:

```text
v36ImplementationCommitSha

phase29BaselineCommitSha
phase29Tag

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
history-v3.6-transforms-causal-candidate-review
```

Commit fields must contain peeled commit SHAs.

---

# Commit/tag

After successful focused implementation and validation:

```text
feat(history): add v3.6 transforms causal candidate projection
```

Create immutable tag:

```text
history-v3.6-transforms-causal-candidate-baseline
```

Use a versioned equivalent if occupied.

Do not overwrite tags.

Generate final artifact from exact committed state.

Do not push unless repository policy explicitly permits it.

---

# Required completion report

Return:

1. Starting SHA/tag.
2. Preflight result.
3. Phase 2.9 baseline SHA/tag.
4. Phase 2.8 implementation/report SHAs/tag.
5. Frozen V3.5 commit/tag/tag-object SHA.
6. Projector implementation path.
7. Projection rule ID.
8. Candidate source type.
9. Exact eligibility predicate.
10. Assertion/modality rule.
11. Participant mapping.
12. Provenance lineage fields.
13. Tests added.
14. Golden fixture result.
15. Same-eight episode IDs.
16. Eligible transforms atoms evaluated.
17. Transforms candidates proposed.
18. Validator accepts/rejects.
19. Candidate count before/after.
20. Validated relation count before/after.
21. Causal relation count before/after.
22. Candidate gaps before/after.
23. Remaining 11 gap categories/counts.
24. Confirmation remaining 11 behavior unchanged.
25. Newly validated relation exact lineage, if any.
26. Hard safety invariant counts.
27. Determinism result.
28. Final History typecheck.
29. Targeted ESLint result.
30. Provider/LLM calls = 0.
31. V3.5 unchanged confirmation.
32. Final commit SHA.
33. Immutable tag.
34. Review artifact path.
35. Artifact SHA-256/checksum result.
36. Recommend exactly ONE next architectural task; do not execute it.

---

# Acceptance criteria

Complete only when all are true.

## Projection

- [ ] Exactly one new projector rule is added.
- [ ] Rule ID is `atomic-transforms-causal-candidate.v1`.
- [ ] Only `transforms` atoms are eligible.
- [ ] Only asserted atoms are eligible.
- [ ] Subject maps directly to cause.
- [ ] Object maps directly to effect.
- [ ] Cause/effect are distinct.
- [ ] Participants are canonical/resolved.
- [ ] No prose parsing occurs.
- [ ] No cross-claim composition occurs.
- [ ] No generic verb-to-causality inference is introduced.

## Validator/taxonomy

- [ ] Existing relation validator unchanged.
- [ ] Existing causal relation schema unchanged.
- [ ] Relation taxonomy unchanged.
- [ ] Semantic-ID logic unchanged.
- [ ] Evidence-fingerprint logic unchanged.
- [ ] Validator rejection, if any, is reported rather than bypassed.

## Scope

- [ ] Same eight episodes only.
- [ ] Remaining 11 inventory gaps are not remediated.
- [ ] Remaining 11 gap classifications remain unchanged unless measurement mechanically moves the one approved gap out of the set.
- [ ] No structured-claim changes.
- [ ] No atomic-grounding changes.
- [ ] No native-generator changes.
- [ ] No cross-claim proof.
- [ ] No all-40 run.
- [ ] No live provider/LLM.
- [ ] No maps/diagrams.
- [ ] No V3.5 semantic changes.

## Safety

- [ ] Unsupported validated relations = 0.
- [ ] Duplicate semantic IDs = 0.
- [ ] Cross-episode support violations = 0.
- [ ] Directionality violations = 0.
- [ ] Cardinality violations = 0.
- [ ] Proper-name fragmentation = 0.
- [ ] Purpose-as-destination errors = 0.
- [ ] Chronology-to-causality errors = 0.
- [ ] Process-to-causality errors = 0.
- [ ] Non-asserted transforms-to-causal admissions = 0.
- [ ] Reversed transforms causality = 0.
- [ ] Invented/unresolved participant admissions = 0.

## Completion

- [ ] Focused tests pass.
- [ ] 45 golden fixtures pass.
- [ ] Final History typecheck passes.
- [ ] Targeted ESLint passes.
- [ ] Same-eight deterministic repeat passes.
- [ ] Successful state committed.
- [ ] Immutable Phase 2.10 tag created.
- [ ] Timestamped review artifact generated.
- [ ] Checksums pass.
- [ ] ZIP integrity passes.

Stop after Phase 2.10.

Do not automatically execute the recommended next task.
