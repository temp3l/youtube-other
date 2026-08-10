# V3.6 Phase 2.15 — Policy-Response Relation Modality Contract Decision + Prototype

## Mission

Decide whether V3.6 should extend the existing `policy-response` relation contract so that it can represent per-premise assertion/modality **losslessly**, and prototype the chosen contract design without yet admitting the Phase 2.13/2.14 Black Death proof as a validated relation.

The central problem is:

```text
validated CrossClaimProofV36

condition premise:
  assertion = uncertain

response premise:
  assertion = attempted

target relation family:
  policy-response
```

The current `policy-response` relation contract has directed condition/response semantics but no per-premise modality fields.

Phase 2.14 therefore correctly concluded:

```text
compatibility:
REPRESENTABLE_ONLY_WITH_MODALITY_LOSS

admission:
BLOCKED_MODALITY_LOSS
```

Phase 2.15 must answer:

> What is the smallest semantically correct, backward-compatible way—if any—to represent this modality in the relation contract?

This is a **contract decision + prototype** phase.

Do NOT admit the Black Death proof as a final relation yet.

---

# Accepted baselines

Phase 2.14:

```text
COMMIT:
e1525f732ecd3776304c38b3bf18eb761e065714

TAG:
history-v3.6-policy-response-admission-contract-baseline-v2
```

Phase 2.13:

```text
COMMIT:
d540477cb865bb0dcb8e27c17ce9235ee8833c43

TAG:
history-v3.6-cross-claim-proof-contract-baseline-v2
```

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

Do not guess abbreviated SHAs.

---

# Phase 2.14 accepted state

The one proof-backed policy-response candidate preserves:

```text
conditionAssertionStatus = uncertain
responseAssertionStatus  = attempted
```

The existing relation contract cannot preserve those values.

Therefore:

```text
relation candidate emitted: no
validated relation emitted: no
admission = BLOCKED_MODALITY_LOSS
```

This blocked state is the accepted baseline.

Do not weaken it during Phase 2.15.

---

# Phase 0 — Mandatory preflight

Run:

```bash
git status --short
git branch --show-current
git rev-parse HEAD
git log --oneline --decorate -20

git rev-parse history-v3.6-policy-response-admission-contract-baseline-v2
git rev-parse 'history-v3.6-policy-response-admission-contract-baseline-v2^{}'

git rev-parse history-v3.6-cross-claim-proof-contract-baseline-v2
git rev-parse 'history-v3.6-cross-claim-proof-contract-baseline-v2^{}'

git rev-parse history-v3.5-frozen-before-v36
git rev-parse 'history-v3.5-frozen-before-v36^{}'
```

Record:

```text
CURRENT_HEAD
PHASE214_SHA
PHASE213_SHA
FROZEN_V35_PEELED_COMMIT_SHA
FROZEN_V35_TAG_OBJECT_SHA
```

Run focused preflight:

```text
History package typecheck
Phase 2.14 admission tests
Phase 2.13 cross-claim proof tests
45 golden semantic fixtures
```

Proceed only if green.

Create immutable checkpoint:

```text
history-v3.6-pre-policy-response-modality-contract
```

Use a versioned equivalent if occupied.

Do not overwrite tags.

No destructive Git operations.

Leave unrelated worktree changes untouched.

---

# Hard scope

Phase 2.15 may:

```text
inspect current ExplanatoryRelationV36 contract
compare contract design options
prototype the selected contract design
add/update schema/types
add focused validator compatibility logic if the prototype requires it
add backward-compatibility tests
add semantic-ID impact tests
add serialization/hash tests
add fixture/prototype validation
generate review artifact
```

Phase 2.15 must NOT:

```text
admit the Black Death proof as a final relation
enable proof-backed relation projection
run all 40 episodes
modify cross-claim proof discovery
add new proof patterns
add new relation kinds
modify unrelated relation variants
weaken validator semantics
change V3.5 behavior
use provider/LLM calls
implement maps/diagrams
```

---

# Phase 1 — Audit current relation contract

Inspect:

```text
packages/history/src/v36/explanatory-relation-v36.ts
```

and all directly related:

```text
runtime schema
JSON Schema generator
validator
semantic identity
evidence fingerprint
serialization
fixture generation
golden fixtures
candidate admission
```

Document the exact current `policy-response` shape.

At minimum determine:

```text
condition participant representation
response participant representation
direction semantics
assertion/modality fields: currently absent/present
required provenance/support fields
semantic-ID inputs
evidence fingerprint inputs
validator assumptions
serialization compatibility constraints
```

Do not redesign before this audit.

---

# Phase 2 — Compare three architecture options

Evaluate exactly these three designs.

Do not add a fourth unless all three are demonstrably invalid and the reason is documented.

---

## Option A — Policy-response-specific per-premise modality

Conceptually:

```ts
policy-response {
  condition
  conditionAssertionStatus

  response
  responseAssertionStatus
}
```

Evaluate:

```text
semantic clarity
minimality
backward compatibility
schema impact
validator impact
semantic-ID impact
serialization impact
future extensibility
risk of policy-response-specific duplication
```

---

## Option B — Generic directed-premise modality structure

Conceptually:

```ts
directed relation {
  sourcePremise {
    participant
    assertionStatus
  }

  targetPremise {
    participant
    assertionStatus
  }
}
```

or an equivalent reusable support structure.

Evaluate whether this should be:

```text
embedded in policy-response only for now
or
available generically to relation variants that semantically need premise-level modality
```

Do NOT generalize every relation type merely because reuse is possible.

Evaluate:

```text
semantic reuse
contract complexity
risk of premature abstraction
migration cost
semantic-ID impact
validator complexity
backward compatibility
```

---

## Option C — Keep ExplanatoryRelation unchanged

Keep:

```text
proof-backed policy-response candidate
```

as a valid non-admissible semantic object when modality cannot be represented.

Evaluate:

```text
semantic safety
loss of downstream relation availability
compiler implications
review implications
future migration cost
contract simplicity
```

This is a valid architectural outcome.

Do not treat relation admission as mandatory.

---

# Required decision matrix

Create:

```text
docs/history/v3.6/policy-response-modality-decision-matrix.json
```

and a concise Markdown companion.

For each option score/assess:

```text
semantic fidelity
backward compatibility
V3.5 isolation
V3.6 migration risk
validator impact
semantic-ID stability
evidence fingerprint stability
schema complexity
serialization compatibility
compiler impact
future extensibility
implementation scope
```

Use categorical values or bounded numeric scores consistently.

The recommendation must be evidence-backed.

---

# Selection rule

Choose exactly ONE:

```text
OPTION_A_POLICY_RESPONSE_SPECIFIC_MODALITY

OPTION_B_GENERIC_DIRECTED_PREMISE_MODALITY

OPTION_C_KEEP_RELATION_UNCHANGED
```

The winner must satisfy:

```text
no semantic loss
no silent modality strengthening
no V3.5 behavior change
bounded migration
deterministic validation
clear backward compatibility
```

If A and B both satisfy these:

prefer the smaller semantic surface unless repository evidence strongly supports generic reuse.

Avoid speculative abstraction.

---

# Phase 3 — Prototype only the winning design

Prototype only the selected option.

Do not fully implement future relation admission.

The prototype should answer:

```text
Can existing asserted policy-response relations still parse/validate identically?
Can the Black Death uncertain/attempted semantics be represented exactly?
Can semantic identity remain deterministic?
Can evidence provenance remain separate?
Can the validator distinguish absent legacy modality from explicit modality?
```

---

# Backward compatibility requirement

Existing V3.6 policy-response relations must remain valid.

The prototype must define explicit behavior for historical/current relations that have no modality fields.

Allowed strategies include:

```text
explicit legacy/default assertion semantics
optional fields with deterministic interpretation
versioned relation variant
```

Choose only the strategy justified by the selected design.

Do not silently reinterpret old relations.

---

# No ambiguous defaulting

If old policy-response relations historically implied:

```text
asserted / asserted
```

then that interpretation must be documented and tested.

Do not let:

```text
missing modality
```

mean different things in different code paths.

If the historical semantics cannot be proven from repository behavior:

do not assume.

Record the ambiguity and block the extension.

---

# Relation schema versioning

If the prototype changes runtime shape:

version the contract appropriately.

Possible:

```text
relation schema v1 -> v2
```

or a compatible versioned variant according to repository conventions.

Do not mutate machine schemas without version/provenance implications.

---

# Runtime schema authority

The TypeScript/runtime schema remains authoritative.

Regenerate machine schema mechanically.

Do not hand-edit:

```text
docs/history/v3.6/relation-schema.json
```

If supplemental contract docs exist, regenerate/update them consistently.

---

# Assertion status vocabulary

Reuse the existing canonical assertion vocabulary.

Do not create a separate modality enum if current V3.6 already has one.

Expected statuses include repository-authoritative equivalents of:

```text
asserted
uncertain
intended
attempted
counterfactual
reported
```

Use exact existing enum/types.

---

# Per-premise modality semantics

For the Black Death prototype, the relation representation must be capable of preserving:

```text
condition = uncertain
response = attempted
```

without translating either to:

```text
asserted
completed
```

This is the primary positive contract test.

---

# Directed semantics

The relation must retain:

```text
condition -> response
```

Premise modalities are attached to the correct side.

Swapping:

```text
uncertain condition
attempted response
```

to:

```text
attempted condition
uncertain response
```

must fail validation or produce a semantically distinct object.

No unordered canonicalization.

---

# Semantic identity analysis

Explicitly determine whether per-premise assertion statuses must participate in semantic relation identity.

Answer:

```text
Should:
policy-response(condition=A uncertain, response=B attempted)

and:
policy-response(condition=A asserted, response=B asserted)

have the same semanticRelationId?
```

Do not guess.

Make the decision from V3.6 identity principles.

Preferred semantic principle:

> If modality materially changes what the relation asserts, modality is semantic and should affect relation identity.

But verify against existing architecture.

Document decision and tests.

---

# Evidence fingerprint analysis

Keep support provenance separate.

Do not put:

```text
claim IDs
source spans
proof IDs
artifact timestamps
```

into semantic identity merely because the contract changes.

Evidence fingerprint remains provenance-oriented.

---

# Validator impact

The existing validator must not be weakened.

If prototype requires validator awareness of per-premise modality:

add only explicit validation that prevents semantic strengthening.

Examples:

```text
valid assertion enum
condition modality attached to condition
response modality attached to response
legacy missing-modality behavior deterministic
unsupported modality combinations rejected if necessary
```

Do not add permissive exceptions.

---

# Admission compatibility simulation

Reuse the Phase 2.14 proof-backed candidate.

Do NOT emit a final relation into the production/shadow relation set.

Instead simulate:

```text
proof-backed candidate
        ↓
selected prototype relation representation
        ↓
prototype validation
```

Report:

```text
representable losslessly?
prototype schema valid?
prototype validator valid?
semantic identity stable?
```

Stop there.

---

# No actual relation admission

Hard requirement:

```text
relation candidates before/after = unchanged
validated relations before/after = unchanged
```

Phase 2.15 must NOT cause the Black Death relation to enter the relation corpus.

If test/prototype code accidentally emits it:

scope failure.

---

# Golden compatibility set

Use existing V3.6 policy-response fixtures/relations as regression controls.

At minimum:

```text
all existing policy-response golden fixtures
the Phase 2.14 Black Death proof-backed candidate
```

If no policy-response golden fixture exists:

create the smallest regression fixture from an existing accepted relation.

Do not invent external historical facts.

---

# Legacy behavior test

For every existing policy-response relation in the same-eight representative set:

verify:

```text
parse result unchanged
semantic content unchanged
relation semantic ID unchanged
evidence fingerprint unchanged
validator outcome unchanged
serialization round-trip remains valid
```

unless the selected versioning strategy intentionally creates a new relation-version representation.

If IDs would change unexpectedly:

treat as a blocker.

---

# No relation-ID churn

Avoid changing existing semantic relation IDs merely because optional modality support was added.

If old asserted/asserted relations require a new ID under the chosen design:

document exact rationale and migration impact.

Prefer no churn for semantically unchanged relations.

---

# Candidate/admission contract compatibility

Phase 2.14 currently returns:

```text
BLOCKED_MODALITY_LOSS
```

Under the prototype, evaluate whether this would become:

```text
ADMISSIBLE_LOSSLESS
```

conceptually.

Do not actually change Phase 2.14 production admission result yet unless required solely for a prototype-only test harness.

Prefer a separate prototype assessor.

---

# Option C behavior

If Option C wins:

do not modify `ExplanatoryRelationV36`.

Instead strengthen/document the decision that:

```text
proof-backed candidate remains the highest-fidelity representation
policy-response admission remains blocked
```

Add only documentation/tests/decision artifacts needed to freeze that architecture.

This is a valid PASS.

---

# Same-eight scope

Use exactly the existing same-eight representative episodes for regression:

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

Do not discover new policy-response cases.

Do not run all 40.

---

# Remaining gap isolation

Before Phase 2.15:

```text
remaining gaps = 9
```

Only the existing proof-validated/contract-blocked Black Death case is relevant.

Other eight remain frozen:

```text
2 movement/native-structure
3 assertion/modality
1 taxonomy mismatch
2 intentionally non-relational
```

Do not alter their IDs/classifications.

---

# No cross-claim proof changes

Do not change:

```text
CrossClaimProofV36 pattern
proof validator
proof identity
proof evidence fingerprint
proof construction method
```

unless a genuine contract bug is discovered.

If bug found:

STOP and report instead of broadening.

---

# No provider / LLM

Hard requirement:

```text
provider calls = 0
LLM calls = 0
```

No external research.

Use repository semantics only.

---

# V3.5 isolation

V3.5 remains frozen.

Do not change V3.5 serialization, claims, planning, rendering, hashes, or approval packs.

If shared schema tooling is touched:

run focused compatibility regression.

---

# Required tests

Follow risk-based focused validation.

Run:

1. History package typecheck preflight;
2. Phase 2.14 admission regressions;
3. Phase 2.13 proof regressions;
4. existing relation schema/validator tests;
5. 45 golden fixtures;
6. decision-matrix schema test;
7. Option A prototype test;
8. Option B prototype test;
9. Option C compatibility test;
10. selected-design runtime schema tests;
11. generated JSON Schema tests;
12. Black Death uncertain/attempted lossless representation test;
13. modality-side attachment test;
14. directionality test;
15. invalid assertion enum test;
16. legacy missing-modality interpretation test;
17. existing policy-response parse regression;
18. existing policy-response semantic-ID regression;
19. existing policy-response evidence-fingerprint regression;
20. serialization round-trip regression;
21. prototype admission compatibility simulation;
22. no-final-relation-admission regression;
23. other-eight-gap freeze regression;
24. same-eight stability run;
25. affected History typecheck;
26. targeted ESLint;
27. deterministic repeat/hash;
28. artifact checksum/ZIP integrity.

Do not run unrelated repository-wide suites.

---

# Hard safety invariants

All must remain zero:

```text
condition modality loss
response modality loss
condition modality strengthening
response modality strengthening
asymmetric modality collapse
legacy relation semantic drift
unexpected existing relation-ID churn
unexpected evidence-fingerprint churn
direction reversal
modality attached to wrong premise
invalid assertion accepted
Black Death relation admitted during prototype phase
relation validator weakening
relation taxonomy expansion
cross-claim proof semantic change
V3.5 semantic change
```

If any non-zero:

```text
verdict = FAIL
```

---

# Decision outputs

Create:

```text
docs/history/v3.6/policy-response-modality-decision-matrix.json
docs/history/v3.6/policy-response-modality-decision.md
```

The decision report must state:

```text
selected option
rejected options
why
backward-compatibility impact
semantic-ID impact
validator impact
migration impact
whether Phase 2.14 candidate would become losslessly representable
```

---

# Artifact

Generate:

```text
history-v3.6-policy-response-modality-contract-review-YYYYMMDDTHHMMSSZ.zip
```

Include at least:

```text
README.md
architecture.md

policy-response-modality-decision-matrix.json
policy-response-modality-decision.md

existing-contract-audit.json
selected-prototype-summary.json
backward-compatibility-summary.json
semantic-id-impact.json
validator-impact.json
prototype-admission-simulation.json

positive-case-review.json
negative-controls.json
gap-stage-summary.json

test-summary.json
invariant-test-summary.json
provenance.json
checksums.sha256
```

If runtime relation schema is prototyped/changed, include:

```text
relation-schema.json
relation-contract-document.json
```

Keep artifact compact.

---

# Provenance

Include:

```text
v36ImplementationCommitSha

phase214BaselineCommitSha
phase214Tag

phase213BaselineCommitSha
phase213Tag

phase212BaselineCommitSha
phase212Tag

contractBaselineCommitSha

frozenV35ProductionCommitSha
frozenV35ProductionTag
frozenV35ProductionTagObjectSha

relationSchemaVersionBefore
relationSchemaVersionAfter
selectedModalityOption
prototypeOnly = true

artifactKind
episodeSet
generatedAt
gitBranch
liveProviderCalls
```

Artifact kind:

```text
history-v3.6-policy-response-modality-contract-review
```

All `CommitSha` fields must contain peeled commit SHAs.

---

# Commit/tag

If the selected design requires prototype code/schema:

```text
feat(history): prototype v3.6 policy-response modality contract
```

If Option C wins and only decision/docs/tests are needed:

```text
docs(history): decide v3.6 policy-response modality contract
```

Create immutable tag:

```text
history-v3.6-policy-response-modality-contract-baseline
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
3. Phase 2.14 baseline SHA/tag.
4. Phase 2.13 baseline SHA/tag.
5. Phase 2.12 baseline SHA/tag.
6. Frozen V3.5 commit/tag/tag-object SHA.
7. Existing policy-response contract path.
8. Existing policy-response shape.
9. Existing policy-response modality capabilities.
10. Option A assessment.
11. Option B assessment.
12. Option C assessment.
13. Selected option.
14. Exact reason selected.
15. Rejected option reasons.
16. Prototype module/schema paths.
17. Relation schema version before/after.
18. Assertion-status representation.
19. Legacy missing-modality semantics.
20. Black Death condition modality representation.
21. Black Death response modality representation.
22. Direction rule.
23. Semantic-ID modality decision.
24. Existing relation-ID compatibility result.
25. Evidence-fingerprint compatibility result.
26. Validator impact.
27. Serialization/backward-compatibility result.
28. Existing policy-response fixture regression result.
29. Prototype Black Death representation result.
30. Would Phase 2.14 become losslessly representable? yes/no.
31. Prototype admission classification.
32. Relation candidates before/after.
33. Validated relations before/after.
34. Confirmation Black Death relation was NOT admitted.
35. Remaining gap/stage count before/after.
36. Confirmation other eight gaps unchanged.
37. Negative-control count/results.
38. Hard safety invariant counts.
39. Golden fixture result.
40. Determinism result.
41. Final History typecheck.
42. Targeted ESLint result.
43. Provider/LLM calls = 0.
44. CrossClaimProofV36 unchanged confirmation.
45. V3.5 unchanged confirmation.
46. Final commit SHA.
47. Immutable tag.
48. Review artifact path.
49. Artifact SHA-256/checksum result.
50. Recommend exactly ONE next architectural task; do not execute it.

---

# Acceptance criteria

Complete only when all are true.

## Decision quality

- [ ] Existing policy-response contract audited directly.
- [ ] Options A/B/C evaluated.
- [ ] Exactly one option selected.
- [ ] Selection is evidence-backed.
- [ ] No relation-admission pressure biases the decision.
- [ ] Semantic fidelity is prioritized over relation count.

## Modality semantics

- [ ] `uncertain` condition can be represented exactly if extension selected.
- [ ] `attempted` response can be represented exactly if extension selected.
- [ ] Modalities remain attached to correct premise.
- [ ] Direction remains condition -> response.
- [ ] No modality strengthening.
- [ ] No asymmetric collapse.

## Backward compatibility

- [ ] Existing policy-response relations remain valid.
- [ ] Legacy missing-modality behavior is explicit.
- [ ] Existing semantic IDs remain stable unless intentionally versioned with documented rationale.
- [ ] Existing evidence fingerprints remain stable.
- [ ] Existing serialization round-trips.
- [ ] Existing validator outcomes remain unchanged for legacy relations.
- [ ] V3.5 behavior remains unchanged.

## Prototype boundary

- [ ] Selected design is prototyped sufficiently to prove/refute feasibility.
- [ ] Black Death proof-backed candidate is tested against prototype representation.
- [ ] No final relation candidate is emitted into the corpus.
- [ ] No validated Black Death policy-response relation is added.
- [ ] Phase 2.14 production admission behavior is not silently changed.

## Validator/taxonomy

- [ ] Existing relation taxonomy unchanged.
- [ ] No new relation kind added.
- [ ] Validator is not weakened.
- [ ] Any validator change is only explicit support for the selected modality contract and preserves stricter semantics.
- [ ] CrossClaimProofV36 semantics unchanged.

## Frozen scope

- [ ] Same-eight only.
- [ ] No all-40 run.
- [ ] Other eight unresolved gaps unchanged.
- [ ] No new proof patterns.
- [ ] No proof discovery.
- [ ] No LLM/provider calls.
- [ ] No maps/diagrams.
- [ ] No unrelated relation redesign.

## Safety

- [ ] Condition modality loss = 0.
- [ ] Response modality loss = 0.
- [ ] Condition modality strengthening = 0.
- [ ] Response modality strengthening = 0.
- [ ] Asymmetric modality collapse = 0.
- [ ] Legacy relation semantic drift = 0.
- [ ] Unexpected relation-ID churn = 0.
- [ ] Unexpected evidence-fingerprint churn = 0.
- [ ] Direction reversal = 0.
- [ ] Wrong-premise modality attachment = 0.
- [ ] Invalid assertion admission = 0.
- [ ] Black Death relation admission during prototype = 0.
- [ ] Validator weakening = 0.
- [ ] V3.5 semantic changes = 0.

## Completion

- [ ] Focused tests pass.
- [ ] 45 golden fixtures pass.
- [ ] Final History typecheck passes.
- [ ] Targeted ESLint passes.
- [ ] Deterministic repeat passes.
- [ ] Successful state committed.
- [ ] Immutable Phase 2.15 tag created.
- [ ] Timestamped review artifact generated.
- [ ] Checksums pass.
- [ ] ZIP integrity passes.

Stop after Phase 2.15.

Do not automatically execute the recommended next task.
