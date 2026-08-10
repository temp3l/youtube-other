# V3.6 Phase 2.13 — Assertion-Preserving Cross-Claim Proof Contract

## Mission

Design and implement a bounded V3.6 **cross-claim proof intermediate representation and deterministic proof validator** for cases where no single claim/atomic proposition contains enough evidence for an explanatory relation, but a small explicitly supported combination of claims may.

Introduce:

```text
CrossClaimProofV36
```

and its deterministic validation/provenance machinery.

Use the single already-classified Phase 2.9/2.12 cross-claim gap as the primary positive design case.

This phase is:

```text
contract
+ deterministic proof construction prototype
+ proof validator
+ fixtures/tests
+ representative shadow measurement
```

This phase is NOT:

```text
generalized cross-claim inference
relation candidate admission
relation validator changes
new relation kinds
all-40 rollout
LLM reasoning
```

Stop before any cross-claim proof becomes a relation candidate.

---

# Accepted baseline

Phase 2.12:

```text
COMMIT:
9535fabc47a50331d2b8412b34c594055e1f61c3

TAG:
history-v3.6-evidence-set-candidate-baseline
```

Phase 2.11:

```text
COMMIT:
ce6cc44f476d3ab650703f23af5b7ee4a68c7695

TAG:
history-v3.6-native-structure-gap-enrichment-baseline-v2
```

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

V3.6 contract baseline:

```text
022f2177cc0e66f47cb5d652d6d456ce12a5a7be
history-v3.6-contract-preflight-baseline
```

Frozen V3.5:

```text
history-v3.5-frozen-before-v36
```

Resolve all full peeled commit/tag-object SHAs from Git.

Do not guess.

---

# Phase 2.12 accepted state

Same-eight metrics:

```text
candidates:            52
validated relations:   30
evidence-set relations: 4
remaining gaps:         9
```

Remaining categories:

```text
STILL_NEEDS_NATIVE_STRUCTURE / movement-location  2
NEEDS_CROSS_CLAIM_PROOF                           1
ASSERTION_OR_MODALITY_BLOCK                       3
TAXONOMY_MISMATCH                                 1
INTENTIONALLY_NON_RELATIONAL                      2
```

Only the ONE existing:

```text
NEEDS_CROSS_CLAIM_PROOF
```

case is the positive Phase 2.13 design target.

The other eight unresolved gaps are frozen.

---

# Phase 0 — Mandatory preflight

Run:

```bash
git status --short
git branch --show-current
git rev-parse HEAD
git log --oneline --decorate -20

git rev-parse history-v3.6-evidence-set-candidate-baseline
git rev-parse 'history-v3.6-evidence-set-candidate-baseline^{}'

git rev-parse history-v3.6-candidate-gap-inventory-baseline
git rev-parse 'history-v3.6-candidate-gap-inventory-baseline^{}'

git rev-parse history-v3.5-frozen-before-v36
git rev-parse 'history-v3.5-frozen-before-v36^{}'
```

Record:

```text
CURRENT_HEAD
PHASE212_SHA
PHASE29_SHA
FROZEN_V35_PEELED_COMMIT_SHA
FROZEN_V35_TAG_OBJECT_SHA
```

Run focused preflight:

```text
History package typecheck
Phase 2.12 candidate-projector tests
Phase 2.9 inventory tests
45 golden semantic fixtures
```

Proceed only if green.

Create immutable checkpoint:

```text
history-v3.6-pre-cross-claim-proof-contract
```

Use a versioned equivalent if occupied.

Do not overwrite existing tags.

No destructive Git.

Leave unrelated worktree changes untouched.

---

# Hard scope rule

Phase 2.13 may implement only:

```text
CrossClaimProofV36 runtime contract
generated JSON schema / contract document
deterministic proof identity
proof evidence fingerprint if needed
bounded deterministic proof construction for approved fixture(s)
proof validator
proof diagnostics
fixtures/tests
shadow review artifact
```

Do NOT implement:

```text
CrossClaimProofV36 -> ExplanatoryRelation candidate projection
changes to existing relation candidate projector
changes to ExplanatoryRelation validator
changes to relation taxonomy
changes to structured-claim semantics
changes to atomic-grounding semantics
general claim-neighborhood heuristics
all-40 discovery
LLM/provider proof generation
maps/diagrams
V3.5 changes
```

If candidate admission appears trivial:

document the future mapping
DO NOT implement it.

---

# Phase 1 — Resolve the exact cross-claim gap

Load the exact Phase 2.9 inventory record currently classified:

```text
NEEDS_CROSS_CLAIM_PROOF
```

Do not infer the case from memory.

Resolve exact:

```text
gapId
episodeId
claim IDs
structured proposition IDs
atomic grounding IDs
source spans/hashes
participants
assertion statuses
current expected relation family
inventory rationale
```

There must be exactly:

```text
1 positive cross-claim gap
```

If repository state does not reconcile to one:

STOP and report mismatch.

Do not substitute another case.

---

# Known architectural example

The existing inventory has treated Black Death as the canonical cross-claim-proof example.

Conceptually the missing proof is of the form:

```text
claim/atom A:
condition / transformation / state

claim/atom B:
response / action / consequence

A + B
  ↓
potential explanatory relation
```

Use the repository's actual claim/atom semantics as authority.

Do not use the conceptual wording above as source evidence.

---

# Architectural objective

Introduce a new explicit proof layer:

```text
canonical claims
      ↓
native structured propositions
      ↓
atomic grounding
      ↓
CrossClaimProofV36
      ↓
deterministic proof validator
      ↓
FUTURE candidate projection
```

The proof object is NOT itself an `ExplanatoryRelation`.

The proof object records why a bounded combination of already-grounded propositions is sufficient to propose a relation later.

---

# Core principle

Cross-claim semantics must be explicit and auditable.

Forbidden architecture:

```text
claims are nearby
therefore they are related
```

Required architecture:

```text
premise A has typed semantic role X
premise B has typed semantic role Y
shared participant/join condition Z is explicit
proof pattern P explicitly allows X + Y -> target relation family R
assertion/modality requirements hold
all source lineage is retained
```

No hidden inference.

---

# CrossClaimProofV36 contract

Create one authoritative runtime schema.

Preferred location:

```text
packages/history/src/v36/cross-claim-proof-v36.ts
```

or repository-equivalent authoritative V3.6 contract path.

Generate machine-readable JSON Schema from the runtime schema.

Do not hand-maintain a divergent schema.

---

# Minimum contract fields

The exact naming may follow repository conventions, but the proof object must represent at least:

```text
proofId
schemaVersion
proofPattern

episodeId

premises[]
  premiseId
  claimId
  structuredPropositionId
  atomicGroundingId
  semanticRoleInProof
  assertionStatus
  sourceSpan
  sourceHash

participantJoins[]
  leftPremise
  leftParticipant
  rightPremise
  rightParticipant
  joinType

targetRelationKind

direction / ordered premise semantics where applicable

proofScope
constructionMethod

provenance
diagnostics
```

Do not include timestamps in semantic identity.

---

# Premise cardinality

Initial V3.6 contract should be bounded.

For Phase 2.13:

```text
minimum premises = 2
maximum premises = 2
```

unless the exact known positive case demonstrably requires more.

Prefer exactly two.

Do not build N-claim proof graphs.

This is a bounded prototype.

---

# Same-episode requirement

All premises must belong to:

```text
same episodeId
```

Cross-episode proof is invalid.

Hard reject.

---

# Claim distinctness

Cross-claim proof requires:

```text
at least two distinct claimIds
```

If all evidence comes from one claim, use existing structured/atomic/candidate machinery instead.

Do not abuse the proof layer for same-claim grouping.

---

# Proof scope

Do not use unrestricted episode-wide search.

Define explicit bounded proof scope.

Preferred Phase 2.13 rule:

```text
proof inputs are explicitly supplied by the approved fixture/inventory record
```

not dynamically discovered by claim proximity.

If a scope field is required, represent conceptually:

```text
inventory-approved
explicit-premise-set
```

Do NOT introduce:

```text
within N claims
within N seconds
same paragraph
same scene
nearest matching claim
```

as semantic proof.

Proximity may be metadata later, never sufficient proof.

---

# Proof patterns

Use a small typed enum.

For Phase 2.13, implement ONLY the proof pattern required by the known positive case.

Do not invent a general proof algebra.

Possible conceptual pattern:

```text
condition-response
```

or:

```text
cause-consequence
```

but derive the actual pattern from the exact Black Death atoms.

The pattern must state:

```text
required premise semantic shapes
required premise roles
required joins
allowed target relation kind
assertion requirements
direction rule
```

---

# Target relation kind

Use an existing accepted V3.6 relation kind only.

Do not expand taxonomy.

The proof object's:

```text
targetRelationKind
```

represents the relation family the proof may support in a future phase.

It does NOT admit the relation.

---

# Assertion preservation

This is a hard Phase 2.13 requirement.

Every premise retains its own assertion status.

Never collapse:

```text
asserted + attempted
```

into:

```text
asserted proof
```

unless the explicit proof pattern defines a safe target semantics compatible with both.

For the initial proof pattern:

prefer requiring:

```text
all required premises = asserted
```

unless the actual approved cross-claim case requires an allowed non-asserted combination.

Fail closed.

---

# Modality rules

Proof validation must explicitly reject incompatible modalities.

Add negative fixtures for:

```text
asserted + uncertain
asserted + intended
asserted + attempted
counterfactual premise
reported premise where unsupported
```

Do not promote intention or attempt into historical completion.

---

# Participant joins

A cross-claim proof must have explicit semantic linkage.

Examples of allowed join concepts:

```text
SAME_CANONICAL_PARTICIPANT
SAME_CANONICAL_CONCEPT
EXPLICIT_TYPED_DEPENDENCY
```

Implement only joins needed by the positive fixture.

Do not join on:

```text
string similarity
substring overlap
same proper noun token
same geographic area without semantic role
embedding similarity
claim proximity
```

Participant joins must use canonical IDs/bindings.

---

# Join cardinality

Require every proof pattern to specify:

```text
minimum required joins
which premise roles are connected
```

A pair of semantically unrelated claims cannot validate merely because both are asserted.

---

# Directionality

Proof direction must be explicit.

If premise A is the condition/cause-side premise and B the response/effect-side premise:

```text
A -> B
```

is identity-bearing.

Swapping them must:

```text
fail validation
or produce a distinct proof ID
```

according to pattern semantics.

Never canonicalize directed proof premises as unordered.

---

# Proof identity

Create deterministic `proofId`.

Identity should include only semantic proof content, such as:

```text
episodeId
proofPattern
ordered premise semantic identities/roles
participant joins
targetRelationKind
direction
schema/proof-pattern version where semantically required
```

Do NOT include:

```text
generatedAt
filesystem path
artifact timestamp
review metadata
```

Support/evidence windows should not accidentally redefine semantic proof identity.

---

# Proof evidence fingerprint

If useful/consistent with V3.6 architecture, maintain a separate deterministic evidence fingerprint covering:

```text
claim IDs
structured proposition IDs
atomic grounding IDs
source spans/hashes
```

Same semantic proof with different equivalent evidence provenance should preserve proof identity while evidence fingerprint changes/merges.

Follow existing semantic-ID vs evidence-fingerprint architecture.

Do not duplicate relation identity code unnecessarily.

---

# Provenance

Every proof must retain exact lineage to all premises:

```text
claimId
structured proposition ID
atomic grounding ID
source span
source hash
assertion status
canonical participants
```

Do not store only concatenated prose.

Do not drop one premise's lineage.

---

# Construction method

Phase 2.13 proof construction must be explicit/deterministic.

Allowed source:

```text
approved-cross-claim-fixture
```

or repository-equivalent explicit fixture/inventory-driven construction.

Do not scan arbitrary claim pairs.

Do not add a combinatorial pair search.

Do not infer proof candidates from adjacent claims.

---

# Validator authority

Create a deterministic:

```text
validateCrossClaimProofV36(...)
```

or equivalent.

The validator is the authority for whether a proof object is structurally/semantically admissible.

The proof constructor may propose.

The validator must fail closed.

---

# Required validator checks

At minimum:

```text
schema valid
same episode
distinct claims
exact allowed premise cardinality
known proof pattern
allowed target relation kind
required premise semantic shapes
required premise roles
assertion/modality requirements
canonical participant bindings
required participant joins
join compatibility
direction/order
source span/hash validity
no duplicate premise
no cross-episode support
no unresolved required participant
```

---

# Diagnostics

Use a compact deterministic catalog.

Potential codes:

```text
CROSS_CLAIM_PROOF_SCHEMA_INVALID
CROSS_CLAIM_PROOF_CROSS_EPISODE
CROSS_CLAIM_PROOF_SAME_CLAIM
CROSS_CLAIM_PROOF_CARDINALITY_INVALID
CROSS_CLAIM_PROOF_PATTERN_UNSUPPORTED
CROSS_CLAIM_PROOF_PREMISE_SHAPE_INVALID
CROSS_CLAIM_PROOF_ASSERTION_INCOMPATIBLE
CROSS_CLAIM_PROOF_JOIN_MISSING
CROSS_CLAIM_PROOF_JOIN_INVALID
CROSS_CLAIM_PROOF_DIRECTION_INVALID
CROSS_CLAIM_PROOF_PARTICIPANT_UNRESOLVED
CROSS_CLAIM_PROOF_SOURCE_INVALID
```

Reuse generic diagnostics where architecture already provides equivalents.

Do not create overlapping codes gratuitously.

---

# Positive fixture

Create exactly the minimum positive fixture needed for the known Phase 2.9 cross-claim gap.

It must use real repository claim/atomic IDs and exact source spans.

Record:

```text
gapId
premise A
premise B
semantic roles
participant joins
proof pattern
target relation kind
expected proof ID
```

Do not add unrelated positive proof examples from historical knowledge.

---

# Negative fixtures

Add focused negative controls.

At minimum:

```text
same claim twice
cross-episode premise pair
missing required join
wrong participant join
reversed direction
unsupported proof pattern
wrong target relation kind
one unresolved participant
asserted + uncertain
asserted + intended
asserted + attempted
duplicate premise
invalid source span/hash
two nearby but semantically unrelated claims
```

The final case is essential:

```text
proximity alone must never validate proof
```

---

# Nearby-claim heuristic prohibition

Add a hard architectural regression test showing that:

```text
claim N
claim N+1
```

do NOT form a proof merely because they are adjacent.

No proof object may be created from:

```text
array index adjacency
timeline proximity
scene proximity
paragraph proximity
```

without explicit typed premise semantics + required joins.

---

# Existing relation validator remains frozen

Do not touch:

```text
ExplanatoryRelationV36 validator
relation schema
relation semantic-ID rules
candidate projector
```

Phase 2.13 proof validation is a separate upstream layer.

---

# No candidate admission

Do NOT implement:

```text
CrossClaimProofV36
  -> relation candidate
```

Even if the positive fixture validates.

Instead produce a future-readiness record:

```text
candidateProjectionReady
targetRelationKind
proposed projector rule
participant mapping
direction rule
assertion requirements
negative controls
```

Stop there.

---

# Proposed future projector

If the proof validates and exact relation mapping is straightforward, document a proposed future rule such as:

```text
cross-claim-<pattern>-<relation>-candidate.v1
```

Use actual pattern/relation names.

Do not register or execute it.

---

# Same-eight representative scope

Use exactly the same eight representative episodes:

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

But only the known cross-claim gap should produce a proof fixture/proposal.

Do not search the other episodes for new cross-claim relationships.

They are negative stability controls only.

---

# Remaining eight gaps frozen

Do not alter:

```text
2 movement/native-structure gaps
3 assertion/modality blocks
1 taxonomy mismatch
2 intentionally non-relational gaps
```

Their IDs/classifications must remain unchanged.

If Phase 2.13 affects them:

scope regression.

---

# Metrics

Baseline after Phase 2.12:

```text
remaining gaps:         9
candidates:             52
validated relations:    30
```

Phase 2.13 should report:

```text
cross-claim gaps inspected:              1
proof proposals:                         N
proof validator accepts:                 N
proof validator rejects:                 N
candidateProjectionReady proofs:         N

relation candidates before/after
validated relations before/after
remaining gap count before/after
```

Expected:

```text
relation candidates unchanged
validated relations unchanged
```

because no candidate projector is added.

The cross-claim inventory gap may be reclassified conceptually as:

```text
proof-ready / candidate-projection gap
```

but do not remove it from unresolved count unless your reporting taxonomy explicitly distinguishes this stage.

Be explicit.

---

# Proof-stage miss classification

Add a bounded proof-layer classification, conceptually:

```text
CROSS_CLAIM_PROOF_NOT_CONSTRUCTIBLE
CROSS_CLAIM_PROOF_VALIDATOR_REJECT
CROSS_CLAIM_PROOF_VALIDATED_CANDIDATE_PROJECTION_PENDING
```

Use repository naming conventions.

Do not disturb the established broader gap taxonomy unnecessarily.

---

# Runtime schema / generated schema

Generate:

```text
docs/history/v3.6/cross-claim-proof-schema.json
```

and a supplemental contract document if current V3.6 convention uses one:

```text
docs/history/v3.6/cross-claim-proof-contract-document.json
```

Runtime TypeScript schema remains authoritative.

No hand-divergent schema.

---

# Architecture document

Create/update:

```text
docs/history/v3.6/cross-claim-proof-architecture.md
```

Document:

```text
why proof IR exists
why proximity is insufficient
premise cardinality
assertion preservation
join semantics
direction
identity vs evidence fingerprint
validator authority
why candidate admission is deferred
```

Keep it concise.

---

# Tests

Follow focused risk-based validation.

Run:

1. History package typecheck preflight;
2. Phase 2.12 candidate regressions;
3. Phase 2.9 inventory regression;
4. 45 golden semantic fixtures;
5. CrossClaimProofV36 runtime-schema tests;
6. generated-schema rejection tests;
7. deterministic proof-ID tests;
8. evidence-fingerprint tests if implemented;
9. positive known cross-claim fixture;
10. same-claim rejection;
11. cross-episode rejection;
12. missing-join rejection;
13. wrong-join rejection;
14. reversed-direction rejection;
15. unsupported-pattern rejection;
16. target-kind rejection;
17. unresolved-participant rejection;
18. assertion/modality rejection matrix;
19. duplicate-premise rejection;
20. invalid-source-span/hash rejection;
21. adjacent-claims-alone-do-not-prove regression;
22. frozen-eight-gap classification regression;
23. same-eight shadow proof run;
24. affected History typecheck;
25. targeted ESLint;
26. deterministic repeat/hash;
27. artifact checksum/ZIP integrity.

Do not run unrelated full-repository suites.

---

# Hard safety invariants

All must remain zero:

```text
unsupported validated relations
duplicate semantic relation IDs
cross-episode relation support
cross-episode proof support
same-claim object mislabeled cross-claim proof
proof without required semantic join
proof from proximity alone
proof with unresolved required participant
proof with incompatible assertion/modality
proof direction reversal
proof source-span/hash mismatch
proof duplicate premise admission
cross-claim proof automatically admitted as relation
V3.5 semantic changes
```

If any non-zero:

```text
verdict = FAIL
```

Do not weaken safeguards.

---

# No live LLM/provider

Hard requirement:

```text
provider calls = 0
LLM calls = 0
```

Do not use an LLM to construct, classify, or validate proofs.

No web research.

Use repository semantics only.

---

# No general pair enumeration

Do not implement:

```text
for every claim A:
  for every claim B:
    try proof
```

No O(N²) claim-pair scan.

Phase 2.13 uses an explicit approved premise set only.

Future discovery is a separate architecture decision.

---

# V3.5 isolation

V3.5 remains frozen.

Do not modify V3.5 claim/plan/render behavior.

Do not regenerate V3.5 approval packs.

If shared utilities are touched:

run focused compatibility/hash regression only.

---

# Artifact

Generate:

```text
history-v3.6-cross-claim-proof-contract-review-YYYYMMDDTHHMMSSZ.zip
```

Include at least:

```text
README.md
architecture.md

cross-claim-proof-schema.json
cross-claim-proof-contract-document.json

cross-claim-gap-baseline.json
proof-construction-summary.json
proof-validation-summary.json
candidate-readiness-summary.json

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
the one known positive cross-claim gap
all proof proposals
all proof validation results
all negative fixtures
```

For the positive case show:

```text
gapId
episodeId

premise A:
claimId
structured proposition ID
atomic grounding ID
semantic role
assertion
participants
source span/hash

premise B:
same fields

participant joins
proof pattern
target relation kind
proof direction
proofId
validator result
candidateProjectionReady
proposed future projector mapping
```

Do not include excessive episode prose.

---

# Provenance

Include:

```text
v36ImplementationCommitSha

phase212BaselineCommitSha
phase212Tag

phase211BaselineCommitSha
phase211Tag

phase29BaselineCommitSha
phase29Tag

contractBaselineCommitSha

frozenV35ProductionCommitSha
frozenV35ProductionTag
frozenV35ProductionTagObjectSha

crossClaimProofSchemaVersion
crossClaimProofValidatorVersion

artifactKind
episodeSet
generatedAt
gitBranch
liveProviderCalls
```

Artifact kind:

```text
history-v3.6-cross-claim-proof-contract-review
```

All `CommitSha` values must be peeled commit SHAs.

---

# Commit/tag

After contract, fixtures, focused validation, and artifact generation pass:

```text
feat(history): add v3.6 cross-claim proof contract
```

Create immutable tag:

```text
history-v3.6-cross-claim-proof-contract-baseline
```

Use a versioned equivalent if occupied.

Do not overwrite tags.

Generate the final review artifact from the exact committed state.

Do not push unless repository policy explicitly permits it.

---

# Required completion report

Return:

1. Starting SHA/tag.
2. Preflight result.
3. Phase 2.12 baseline SHA/tag.
4. Phase 2.11 baseline SHA/tag.
5. Phase 2.9 baseline SHA/tag.
6. Frozen V3.5 commit/tag/tag-object SHA.
7. Exact cross-claim gap ID.
8. Exact episode/claim IDs.
9. CrossClaimProofV36 module path.
10. Runtime schema version.
11. Generated schema path.
12. Proof validator module/path.
13. Proof validator version.
14. Proof pattern(s) added.
15. Target relation kind(s).
16. Premise cardinality.
17. Assertion/modality rule.
18. Participant join types.
19. Directionality rule.
20. Proof identity fields.
21. Evidence-fingerprint fields, if used.
22. Construction method.
23. Confirmation no claim-pair scan exists.
24. Positive fixture result.
25. Negative fixture count/results.
26. Proof proposals count.
27. Proof accepts/rejects.
28. CandidateProjectionReady proof count.
29. Proposed future projector rule, if any.
30. Candidate count before/after.
31. Validated relation count before/after.
32. Remaining gap count/stage classification before/after.
33. Confirmation other eight gaps unchanged.
34. Adjacent-claims-alone negative test result.
35. Hard safety invariant counts.
36. Golden fixture result.
37. Determinism result.
38. Final History typecheck.
39. Targeted ESLint result.
40. Provider/LLM calls = 0.
41. V3.5 unchanged confirmation.
42. Final commit SHA.
43. Immutable tag.
44. Review artifact path.
45. Artifact SHA-256/checksum result.
46. Recommend exactly ONE next architectural task; do not execute it.

---

# Acceptance criteria

Complete only when all are true.

## Contract

- [ ] One authoritative `CrossClaimProofV36` runtime contract exists.
- [ ] Machine JSON Schema is generated from runtime schema.
- [ ] Proof is distinct from `ExplanatoryRelation`.
- [ ] Proof is distinct from relation candidate.
- [ ] Premise cardinality is tightly bounded.
- [ ] Same episode is required.
- [ ] Distinct claims are required.
- [ ] Exact premise lineage is preserved.
- [ ] Participant joins are explicit and canonical.
- [ ] Assertion/modality is preserved per premise.
- [ ] Direction/order is explicit where semantic.
- [ ] Proof ID is deterministic.
- [ ] Evidence provenance is separate from semantic identity where appropriate.

## Construction

- [ ] Only the known approved cross-claim gap is positively constructed.
- [ ] No general pair enumeration exists.
- [ ] No claim-neighborhood heuristic exists.
- [ ] Proximity alone cannot produce proof.
- [ ] No prose parsing is introduced at proof stage.
- [ ] No external historical knowledge is used.

## Validation

- [ ] Cross-episode proof rejected.
- [ ] Same-claim proof rejected.
- [ ] Missing join rejected.
- [ ] Invalid join rejected.
- [ ] Direction reversal rejected where semantic.
- [ ] Unsupported proof pattern rejected.
- [ ] Wrong target relation kind rejected.
- [ ] Unresolved participant rejected.
- [ ] Incompatible assertion/modality rejected.
- [ ] Duplicate premise rejected.
- [ ] Invalid source span/hash rejected.
- [ ] Positive fixture validates only when all requirements are met.

## Downstream isolation

- [ ] No new relation candidate projector.
- [ ] No cross-claim proof is admitted as a relation.
- [ ] Existing candidate projector unchanged.
- [ ] Existing ExplanatoryRelation validator unchanged.
- [ ] Relation taxonomy unchanged.
- [ ] Semantic relation ID logic unchanged.
- [ ] Evidence fingerprint logic unchanged.

## Frozen gaps

- [ ] Two movement/native-structure gaps unchanged.
- [ ] Three modality gaps unchanged.
- [ ] One taxonomy mismatch unchanged.
- [ ] Two intentionally non-relational gaps unchanged.
- [ ] Only the known cross-claim gap changes proof-stage readiness.

## Safety

- [ ] Cross-episode proof support = 0.
- [ ] Same-claim misuse = 0.
- [ ] Proof without required join = 0.
- [ ] Proximity-only proof = 0.
- [ ] Unresolved-participant proof = 0.
- [ ] Assertion/modality promotion = 0.
- [ ] Direction reversal = 0.
- [ ] Invalid source provenance = 0.
- [ ] Duplicate premise admission = 0.
- [ ] Automatic proof-to-relation admission = 0.
- [ ] Existing relation hard invariants remain zero.
- [ ] V3.5 behavior unchanged.

## Scope

- [ ] Same eight representative episodes only.
- [ ] No all-40 run.
- [ ] No LLM/provider calls.
- [ ] No maps/diagrams.
- [ ] No structured-claim redesign.
- [ ] No atomic-grounding redesign.
- [ ] No relation taxonomy changes.
- [ ] No relation validator changes.
- [ ] No generalized compositional proof engine.

## Completion

- [ ] Focused tests pass.
- [ ] 45 golden fixtures pass.
- [ ] Final History typecheck passes.
- [ ] Targeted ESLint passes.
- [ ] Deterministic repeat passes.
- [ ] Successful state committed.
- [ ] Immutable Phase 2.13 tag created.
- [ ] Timestamped review artifact generated.
- [ ] Checksums pass.
- [ ] ZIP integrity passes.

Stop after Phase 2.13.

Do not automatically execute the recommended next task.
