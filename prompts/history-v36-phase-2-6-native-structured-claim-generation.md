# V3.6 Phase 2.6 — Native Structured Proposition Generation

Work in **strict upstream semantic-enrichment mode**.

This task has one architecture objective:

> Produce **native V3.6 structured propositions at the canonical history claim-generation boundary**, persist/cache them with exact provenance, and measure whether they reduce the corpus-wide `insufficient-structure` bottleneck without changing V3.5 semantics or weakening any V3.6 downstream safety gate.

Do not implement another post-hoc grounding heuristic layer.

Do not change the accepted V3.6 `ExplanatoryRelation` validator.

Do not add relation kinds.

Do not run live LLM relation proposal.

Do not implement V3.6 maps or diagrams.

Do not modify V3.5 production semantics.

---

# Accepted baselines

Phase 2.5:

```text
PHASE_25_SHA:
d2c40db0dcd231a3606fe758d31e4fa42df19b03

PHASE_25_TAG:
history-v3.6-structured-claim-review-baseline
```

All-40 census baseline:

```text
8d41d0c
history-v3.6-all40-shadow-census-baseline
```

Grounding census baseline:

```text
650b510
history-v3.6-grounding-census-baseline
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

Resolve its full SHA from Git; do not guess.

Accepted V3.5 semantic baseline:

```text
82b4192f6e832523ce00675e39593e3f98a96403
history-v3.5-semantic-baseline
```

---

# Phase 0 — Mandatory preflight and typecheck closure

Before any implementation:

```bash
git status --short
git branch --show-current
git rev-parse HEAD
git log --oneline --decorate -20
git tag --list 'history-v3.5*'
git tag --list 'history-v3.6*'
```

Verify Phase 2.5 baseline is present.

Then rerun the exact affected History package typecheck used in Phase 2.5.

If necessary discover the package name from `package.json` / workspace configuration, but do not run a full-repository typecheck.

Expected conceptually:

```bash
pnpm --filter <history-package> typecheck
```

## Hard gate

If typecheck PASSES:

```text
record result
make no changes for this preflight
continue to Phase 2.6
```

If typecheck FAILS:

```text
fix only the remaining Phase 2.5 TypeScript errors
run focused typecheck again
run directly affected structured-claim/grounding tests
commit the micro-fix
record the new baseline SHA
continue only after green
```

Do not broaden scope because of unrelated type errors.

Create an immutable pre-Phase-2.6 checkpoint after the typecheck baseline is green:

```text
history-v3.6-pre-native-structured-claims
```

Use a versioned equivalent if occupied.

Do not overwrite existing tags.

No destructive Git.

Leave unrelated worktree changes untouched.

---

# Phase 2.5 evidence

Current all-40 Phase 2.5 result:

```text
canonical claims:             3,774
structured claims:              106
structured propositions:        111

native propositions:              0
compatibility backfill:          111

atomic propositions:        111 -> 111
insufficient structure:     309 -> 309
validated relations:        103 -> 103
```

This proves the compatibility structure is safe but does not enrich semantics.

The Phase 2.6 hypothesis is:

> Native structured output created when canonical claims are produced should encode explicit semantics that post-hoc compatibility backfill cannot recover reliably.

Test this hypothesis.

Do not assume it is true.

---

# First task — map the canonical claim-generation boundary

Inspect the repository and identify the exact authoritative path that creates canonical history claims.

Find:

```text
claim generation function/service
claim schema/type
claim persistence/cache
claim IDs
source-span/provenance handling
claim-kind assignment
entity/place bindings
trusted-script path
fixture/offline path
provider-backed path if any
```

Reuse the current Phase 2.5 architecture note where possible.

Do not perform a broad repository architecture rewrite.

Document the exact integration seam before implementing.

---

# Architecture requirement

Future V3.6 claim production should conceptually become:

```text
source/narration
      ↓
canonical claim-generation boundary
      ├── existing HistoryClaim / V3.5-compatible claim
      └── native StructuredClaimEnvelopeV36
                  ↓
             persisted/cacheable
                  ↓
          atomic grounding V3.6
                  ↓
         relation candidate extraction
                  ↓
        unchanged relation validator
```

The native structured proposition must be created as part of claim generation/normalization, not reconstructed later from persisted prose.

---

# Compatibility rule

V3.5 output is immutable.

Native V3.6 semantics must be:

```text
additive
versioned
shadow-only
```

Preferred architecture:

```text
existing canonical claim object unchanged
+
V3.6 structured sidecar/envelope keyed by claimId
```

or an equivalent versioned optional field that provably does not alter V3.5 serialization/hashes.

Do not introduce a second canonical claim authority.

One claim remains canonical; V3.6 structured semantics are a versioned derivative/sidecar.

---

# Native vs compatibility backfill

Preserve the Phase 2.5 distinction.

Supported provenance source types should remain conceptually:

```text
native
compatibility-backfill
```

Native means:

```text
produced at canonical claim-generation time
```

Backfill means:

```text
derived later from historical claim content
```

Never label backfill as native.

Never merge provenance histories.

---

# No mandatory extra provider call

First inspect how canonical claims are already generated.

## If claim generation is deterministic/local

Add native structured semantics deterministically at that boundary where possible.

## If claim generation already uses an LLM/provider

Prefer extending that EXISTING claim-generation request to return typed structured proposition output in the same call.

Do NOT introduce an additional provider request per claim merely to create structure.

## If historical claims already exist

Do NOT regenerate all historical claims with paid providers in this task.

Use fixtures/mocks for native-path validation and preserve compatibility backfill for the historical all-40 comparison.

---

# Native structured output contract

Reuse the accepted Phase 2.5 `StructuredClaimEnvelopeV36` and runtime schema.

Do not redesign it unless an actual native-generation requirement exposes a contract defect.

Required existing semantics include:

```text
deterministic proposition ID
episodeId
claimId
typed predicate
typed semantic roles
typed assertion status
resolved participant bindings
source span
exact provenance
schema version
native/backfill source
```

Do not create a second V3.6 structured-claim schema.

---

# Native output generation

Create a single authoritative adapter/generator at the claim boundary.

Conceptually:

```ts
generateCanonicalClaim(...)
  -> {
       claim: HistoryClaim,
       structuredV36?: StructuredClaimEnvelopeV36
     }
```

or a repository-equivalent sidecar workflow.

V3.5 consumers must continue reading exactly their existing claim representation.

---

# Required semantic families

Native generation should be capable of encoding explicit semantics relevant to the current V3.6 taxonomy when present.

Do not force every claim into one of these.

Cover only explicit source semantics.

At minimum evaluate:

```text
causal
dependency
movement/location
comparison
policy/action
process/steps
temporal ordering
evidence membership
```

These are proposition families, NOT final relation kinds.

---

# Movement semantics

Native claim structure must distinguish:

```text
actor
origin
destination
via
location
objective
```

Hard control:

```text
objective != destination
```

Franklin:

```text
sailed from Britain to search for the Northwest Passage
```

may encode:

```text
origin = Britain
objective = Northwest Passage
```

but NOT:

```text
destination = Northwest Passage
```

unless explicitly supported.

---

# Assertion / modality

Preserve accepted statuses:

```text
asserted
uncertain
intended
attempted
```

Clause-scoped modality must remain correct.

Examples:

```text
moved through X
=> asserted
```

```text
intended to move through X
=> intended
```

```text
attempted to move through X
=> attempted
```

```text
might have moved through X
=> uncertain
```

Nested comparison language such as:

```text
than the stereotype suggests
```

must not contaminate an unrelated enclosing asserted proposition.

---

# Causal semantics

Native structure should encode explicit cause/effect roles only when the claim says so.

Do not infer arbitrary pairs because:

```text
claim.kind = causal
```

Known false-positive controls must remain absent.

---

# Policy/action semantics

For claims such as:

```text
authorities attempted to restrict wages
```

represent:

```text
actor
action
target
assertionStatus = attempted
```

Do NOT directly emit a `policy-response` relation.

Cross-claim connection remains downstream.

---

# Process semantics

When a claim explicitly enumerates ordered steps:

```text
step
order
process context
```

may be represented natively.

Do not invent process order from unordered lists.

---

# Temporal semantics

Represent explicit:

```text
before
after
then
later
time anchor
```

when semantically stated.

Chronology != causality.

---

# Evidence semantics

Preserve evidence nesting.

Franklin control:

```text
graves of John Torrington, John Hartnell, and William Braine
```

must not become three peer evidence items merely because three named people occur.

---

# Proper-name atomicity

Preserve:

```text
Pearl Harbor
Great Heathen Army
Great Fire of London
Bay of Naples
United States
North Atlantic
Pas-de-Calais
International Ice Patrol
```

as atomic canonical participants unless source semantics independently refer to a component.

Do not create substring entities.

---

# Source-span provenance

Native proposition source spans must point to exact canonical claim text.

Require:

```text
start
end
text hash
claimId
episodeId
```

Validate:

```text
0 <= start < end <= claimText.length
```

and that the span hash matches.

Do not accept synthetic span coordinates.

---

# Participant resolution

Use already-known entity/place bindings where available.

Native proposition participants must reference canonical IDs.

If an explicit semantic participant cannot be resolved:

```text
preserve proposition incompleteness diagnostically
or omit unsafe proposition
```

Do not invent IDs.

Do not globally redesign entity resolution.

---

# Native generation diagnostics

Keep the catalog small.

Add only what native generation requires.

Potential codes:

```text
STRUCTURED_NATIVE_OUTPUT_SCHEMA_INVALID
STRUCTURED_NATIVE_PARTICIPANT_UNRESOLVED
STRUCTURED_NATIVE_SOURCE_SPAN_INVALID
STRUCTURED_NATIVE_ASSERTION_AMBIGUOUS
STRUCTURED_NATIVE_ROLE_AMBIGUOUS
STRUCTURED_NATIVE_UNSUPPORTED_SEMANTICS
```

Reuse Phase 2.5 diagnostics where equivalent.

---

# Caching

Native structured output must be persisted/cached with the claim-generation artifact.

Do not recompute it repeatedly when:

```text
episode regenerates without claim changes
visuals regenerate
audio regenerates
approval bundle regenerates
```

Cache/fingerprint should include at least:

```text
claim text/content hash
claim ID
structured schema version
generation implementation/prompt version
resolved participant binding fingerprint
provider/model identity if provider-backed
```

Do not include timestamps.

---

# Invalidation

Native structured output must invalidate when semantically relevant inputs change:

```text
claim text changes
claim participant bindings change
structured schema changes
native generator/prompt version changes
provider/model identity changes where relevant
```

It must NOT invalidate because:

```text
images regenerate
audio regenerates
render format changes
approval artifact timestamp changes
```

Reuse existing artifact lineage/invalidation infrastructure where possible.

---

# Provider-backed native output

If existing canonical claim generation already invokes OpenAI or an OpenAI-compatible provider:

prefer strict structured output from that same existing request.

Do not add a second semantic-generation call.

The provider is still not semantic authority.

Native output must:

```text
parse against runtime schema
reference supplied participant IDs only
retain exact claim/span evidence
fail closed on invalid output
```

If native structured output is invalid:

```text
canonical claim may still exist
native V3.6 structure absent
diagnostic recorded
compatibility fallback remains available
```

Never block V3.5 because V3.6 native structure failed.

---

# No live provider execution in Phase 2.6 implementation

Do not make paid/live provider calls while implementing.

Use:

```text
fixtures
mocks
existing frozen canonical claim inputs
```

The live/native provider path may be implemented if it extends an existing provider call, but do not execute it against the full corpus.

---

# Representative native fixture set

Before any corpus-level measurement, create/extend native fixtures for the same eight representative episodes:

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

Fixtures should model what the canonical claim generator SHOULD emit natively from explicit claim semantics.

Do not simply copy compatibility-backfill output.

Focus especially on claims currently classified:

```text
insufficient-structure
```

---

# Representative hypothesis test

For the same eight episodes, compare:

```text
compatibility backfill only
vs
native structured fixtures + compatibility fallback
```

Measure:

```text
claims with native structured propositions
structured propositions
atomic propositions
insufficient-structure claims
relation candidates
validated relations
rejected candidates
```

The goal is to prove the native contract can actually represent semantics absent from backfill.

---

# Representative hard controls

## Black Death

Native structure should be able to represent explicit per-claim semantics such as:

```text
demographic shock transforms labor
survivors demand higher wages/better terms
authorities attempt wage restrictions
```

Do NOT fabricate:

```text
labour scarcity causes wage pressure
```

if no individual claim says that.

Cross-claim proof remains downstream.

## Spanish Armada

Native structure must distinguish:

```text
actual movement
intended mission route
causal loss factors
```

## Franklin

Purpose remains distinct from destination.

## D-Day

Normandy/Pas-de-Calais comparison semantics remain distinct from movement.

## 1066

Do not invent a source endpoint for Pevensey landing.

Known bad V3.5 chain remains unsupported.

## Titanic

Preserve explicit ice/Californian causal semantics.

## Bronze Age/Chernobyl

Stability controls.

---

# Native fixture acceptance

Proceed only if:

```text
schema invalid native propositions = 0
unsupported validated relations = 0
purpose-as-destination errors = 0
proper-name fragmentation = 0
cross-episode support = 0
directionality violations = 0
cardinality violations = 0
```

Do not tune downstream validators.

---

# Historical all-40 evaluation limitation

The existing 40 historical claims were not generated with native structured output.

Therefore:

> Do not claim the historical all-40 corpus has native coverage unless you actually have frozen native-generation artifacts from claim creation.

For Phase 2.6, evaluate all 40 using ONE of the following safe approaches:

## Preferred A — offline native-generation fixtures/snapshots already available

If existing claim-generation fixtures contain enough input/output evidence to generate native structured output deterministically without paid calls:

run them.

## Preferred B — compatibility corpus + native-capability simulation

If true native outputs do not exist:

do NOT fabricate a native all-40 count.

Instead report:

```text
historical native coverage = unavailable
```

and use the representative native fixture experiment to validate the architecture.

Then separately report the historical compatibility metrics unchanged.

Do not convert backfill into fake native output.

---

# Optional offline deterministic native backfill

Only if canonical claim-generation input artifacts contain the exact structured semantic information originally used to create each claim, you may reconstruct native output offline.

If the source is merely final claim prose:

that is compatibility backfill, NOT native.

Preserve terminology honestly.

---

# Main success metric

The task should demonstrate that native claim generation can reduce insufficient structure on representative cases.

Do NOT force an all-40 numerical reduction if native historical output does not exist.

For the representative corpus report:

```text
insufficient-structure before
insufficient-structure after native structured fixtures
absolute reduction
percentage reduction
```

This is the key architectural test.

---

# Atomic grounding integration

Atomic grounding priority remains:

```text
native structured proposition
      ↓
compatibility structured proposition
      ↓
frozen fallback
```

Record provenance path for each atomic proposition.

Do not bypass grounding validation.

---

# Relation extraction integration

Existing deterministic relation proposer remains frozen.

Existing relation validator remains unchanged.

Rerun relation extraction over the representative native fixtures.

Any newly validated relation must derive from newly available native structured evidence and pass every existing invariant.

Report exact evidence lineage.

---

# Candidate projection vs structured structure

Do not attribute all remaining misses to native structured claims.

For representative misses classify:

```text
native structure absent
native structure present / atomic grounding gap
atomic grounding present / candidate projection gap
candidate proposed / validator reject
cross-claim proof missing
taxonomy gap
unresolved participant
```

This classification is important.

---

# Cross-claim proof

Do NOT solve cross-claim relations in this task.

If Black Death still needs:

```text
claim A + claim B
```

to prove a causal/policy relation, classify:

```text
cross-claim proof missing
```

Do not add a compositional proof engine yet.

---

# Differential reporting

Keep Phase 2.5's corrected granularity reporting.

Explicitly distinguish:

```text
episode-level presence
relation-level paired comparisons
unpaired signals
```

Do not fabricate relation alignment.

---

# Tests

Follow risk-based validation.

Run:

1. Phase 2.5 affected package typecheck preflight;
2. existing V3.6 schema/IR tests;
3. 45 golden fixtures;
4. structured-claim native-generation unit tests;
5. native schema parsing/rejection tests;
6. proposition ID determinism tests;
7. native/backfill provenance tests;
8. cache fingerprint/invalidation tests;
9. source-span tests;
10. participant-binding tests;
11. assertion/modality tests;
12. Franklin purpose/destination tests;
13. evidence nesting tests;
14. representative native fixture tests;
15. atomic-grounding structured-first integration tests;
16. deterministic relation integration tests;
17. candidate/miss classification tests;
18. affected History package typecheck;
19. targeted lint;
20. representative 8-episode native experiment;
21. deterministic repeat/hash check;
22. artifact checksum/ZIP validation.

Do not run unrelated full repository suites.

---

# Hard safety gates

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
schema-invalid persisted relations
```

If any non-zero:

```text
verdict = FAIL
```

Do not weaken safeguards.

---

# No V3.5 changes

V3.5 production behavior remains frozen.

If a shared claim-generation function must receive an additive V3.6 hook:

prove the V3.5 output object/serialization is unchanged.

Run focused V3.5 regression/hash tests if shared code is touched.

Do not regenerate the entire V3.5 approval corpus unless actual V3.5 semantic behavior changes.

---

# No live LLM experiment

Do not enable:

```text
HISTORY_V36_LLM_SHADOW_PROPOSER
```

Do not run live relation proposal.

Do not add a separate LLM structured-claim call.

No external research.

---

# No maps or diagrams

Do not implement V3.6 compilers.

Do not change visual planning or rendering.

---

# Artifact

Generate:

```text
history-v3.6-native-structured-claims-review-YYYYMMDDTHHMMSSZ.zip
```

Include at least:

```text
README.md
architecture.md

structured-claim-schema.json
structured-claim-contract-document.json

canonical-claim-integration.json
native-generation-summary.json
representative-native-summary.json
grounding-comparison.json
relation-comparison.json
miss-classification.json

cache-invalidation-summary.json
diagnostic-summary.json
manual-review.json
decision-report.md

test-summary.json
invariant-test-summary.json
provenance.json
checksums.sha256
```

If historical all-40 native output is unavailable, say so explicitly.

Do not invent all-40 native metrics.

---

# Manual review

Include:

```text
all newly native-structured representative claims
all newly validated relations
all native structure that still fails downstream
all purpose/objective movement controls
all assertion-sensitive cases
all cross-claim-proof gaps
all taxonomy gaps
all unresolved participant controls
```

Keep ordinary samples bounded.

---

# Provenance

Include:

```text
v36ImplementationCommitSha
phase25BaselineCommitSha
contractBaselineCommitSha
frozenV35ProductionCommitSha
acceptedV35SemanticBaselineCommitSha

structuredClaimSchemaVersion
nativeGeneratorVersion
atomicGroundingSchemaVersion
relationSchemaVersion

artifactKind
episodeSet
generatedAt
gitBranch

liveProviderCalls
historicalNativeCoverageAvailable
```

Artifact kind:

```text
history-v3.6-native-structured-claims-review
```

---

# Commit/tag strategy

After implementation + representative gate passes:

```text
feat(history): add native v3.6 structured claim generation
```

Tag:

```text
history-v3.6-native-structured-claims-baseline
```

Use a versioned equivalent if occupied.

Do not overwrite existing tags.

Generate the review artifact from the exact committed state.

Do not push unless repository policy explicitly permits it.

---

# Required completion report

Return:

1. Starting SHA/tag.
2. Typecheck-preflight result.
3. Any Phase 2.5 typecheck micro-fix commit if required.
4. Phase 2.5 baseline SHA/tag.
5. Contract baseline SHA/tag.
6. Frozen V3.5 SHA/tag.
7. Canonical claim-generation entrypoint(s).
8. Persistence/cache entrypoint(s).
9. Whether claim generation is deterministic/provider-backed/mixed.
10. Chosen native structured integration architecture.
11. Native generator module paths.
12. Reused StructuredClaim schema path.
13. Native generator version.
14. Native proposition source/provenance semantics.
15. Provider behavior: reused existing call / no provider / fixtures only.
16. Confirmation no new provider call per claim was added.
17. Cache key fields.
18. Invalidation rules.
19. Tests added.
20. Golden fixture result.
21. Representative 8 episode IDs.
22. Representative claims evaluated.
23. Native structured claim count.
24. Native structured proposition count.
25. Backfill proposition count used as fallback.
26. Representative insufficient-structure before/after.
27. Absolute/percentage reduction.
28. Atomic propositions before/after.
29. Relation candidates before/after.
30. Validated relations before/after.
31. Newly validated relations and evidence lineage.
32. Remaining miss classification counts.
33. Cross-claim-proof gap count.
34. Candidate projection gap count.
35. Unresolved participant count.
36. Taxonomy gap count.
37. Hard safety invariant counts.
38. Historical all-40 native coverage availability.
39. Historical compatibility metrics if relevant.
40. Determinism result.
41. Final affected History typecheck result.
42. Targeted lint result.
43. Confirmation live provider calls = 0.
44. Confirmation live LLM relation calls = 0.
45. Confirmation V3.5 production behavior unchanged.
46. Final commit SHA.
47. Immutable tag.
48. Review artifact path.
49. Artifact SHA-256/checksum result.
50. Recommend exactly ONE next architectural task; do not execute it.

---

# Acceptance criteria

Complete only when all are true.

## Preflight

- [ ] Phase 2.5 affected History package typecheck has been rerun.
- [ ] If it failed, only the necessary branded-ID/type errors were fixed.
- [ ] Final preflight typecheck is green before Phase 2.6 proceeds.

## Architecture

- [ ] Native structured semantics are emitted at/adjacent to canonical claim generation.
- [ ] They are not merely renamed post-hoc backfill.
- [ ] Existing canonical claim authority is preserved.
- [ ] V3.5 claim representation remains compatible.
- [ ] Phase 2.5 StructuredClaim schema is reused.
- [ ] Native vs backfill provenance is explicit.
- [ ] Exact source spans are preserved.
- [ ] Participant bindings are canonical.
- [ ] Proposition IDs are deterministic.
- [ ] Assertion/modality remains typed.
- [ ] Objective/destination remains distinct.

## Provider/cost

- [ ] No mandatory second provider call per claim is introduced.
- [ ] Existing provider call is extended only if safe and already present.
- [ ] No live paid provider execution occurs in this task.
- [ ] Historical claims are not regenerated via paid calls.
- [ ] Native output is cached/persisted.
- [ ] Cache invalidation follows semantic inputs only.

## Representative experiment

- [ ] Same eight representative episodes are evaluated.
- [ ] Native structured fixtures/output are meaningfully different from backfill where semantics exist.
- [ ] Representative insufficient-structure before/after is reported.
- [ ] Native output enables richer atomic grounding where supported.
- [ ] Existing relation proposer remains frozen.
- [ ] Existing relation validator remains unchanged.
- [ ] Newly validated relations, if any, have exact native evidence lineage.
- [ ] Remaining misses are classified by layer.

## Semantic controls

- [ ] Franklin purpose is not destination.
- [ ] Spanish intent is not completed movement.
- [ ] Black Death cross-claim causality is not fabricated.
- [ ] D-Day comparison is not movement.
- [ ] 1066 bad V3.5 chain remains unsupported.
- [ ] Titanic regression remains fixed.
- [ ] Proper names remain atomic.
- [ ] Evidence nesting remains correct.
- [ ] Assertion scope remains correct.

## Safety

- [ ] Unsupported validated relations = 0.
- [ ] Duplicate semantic IDs = 0.
- [ ] Cross-episode support violations = 0.
- [ ] Directionality violations = 0.
- [ ] Cardinality violations = 0.
- [ ] Proper-name fragmentation = 0.
- [ ] Purpose-as-destination errors = 0.
- [ ] Invalid structured propositions = 0.
- [ ] Invalid grounding objects = 0.
- [ ] Invalid persisted relations = 0.

## Historical corpus honesty

- [ ] Backfilled historical structured propositions are not labeled native.
- [ ] If true historical native output is unavailable, the artifact says so.
- [ ] No fake all-40 native improvement metric is reported.
- [ ] Compatibility-census metrics remain distinguishable from native experiment metrics.

## Scope

- [ ] V3.5 production semantics unchanged.
- [ ] No live LLM relation proposal.
- [ ] No separate LLM grounding system.
- [ ] No V3.6 maps.
- [ ] No V3.6 diagrams.
- [ ] No relation taxonomy expansion.
- [ ] No validator weakening.
- [ ] No cross-claim proof engine.
- [ ] No global entity-resolution redesign.
- [ ] No narration/TTS/localization/rendering changes.

## Completion

- [ ] Final affected History typecheck passes.
- [ ] Targeted lint passes.
- [ ] Focused tests pass.
- [ ] Successful state committed.
- [ ] Immutable native-structured baseline tag created.
- [ ] Timestamped review artifact generated.
- [ ] Checksums pass.
- [ ] ZIP integrity passes.

Stop after Phase 2.6.

Do not automatically execute the recommended next task.
