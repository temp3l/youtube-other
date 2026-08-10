# V3.6 Phase 2.5 — Structured Claim Enrichment at the Canonical Claim Boundary

## Mission

Implement the next V3.6 architecture step:

> Add a typed, versioned, provenance-bound **structured proposition representation at the canonical claim-generation boundary**, run it in V3.6 shadow/compatibility mode, and measure whether this upstream structure materially improves atomic grounding and relation extraction without weakening any downstream safety gate.

This task responds to the completed all-40 deterministic census.

Do **not** solve the problem by adding more post-hoc regex heuristics to atomic grounding.

Do **not** weaken `ExplanatoryRelation` validation.

Do **not** modify V3.5 production semantics.

Do **not** implement maps or diagrams.

Do **not** run live LLM relation proposal.

Do **not** cut V3.6 into production.

---

# Accepted baselines

All-40 deterministic census:

```text
CENSUS_SHA:
8d41d0c

CENSUS_TAG:
history-v3.6-all40-shadow-census-baseline
```

Frozen grounding census baseline:

```text
GROUNDING_CENSUS_SHA:
650b510

GROUNDING_CENSUS_TAG:
history-v3.6-grounding-census-baseline
```

Phase 2.3 atomic-grounding baseline:

```text
46f80c1fba9d89ab2f7c4df1377018154a028dfc
history-v3.6-atomic-grounding-baseline
```

Phase 2.2:

```text
35e917207713e0a1b44d75b7d27dd698d6a70d35
history-v3.6-bounded-llm-shadow-baseline
```

V3.6 contract baseline:

```text
022f2177cc0e66f47cb5d652d6d456ce12a5a7be
history-v3.6-contract-preflight-baseline
```

Frozen V3.5:

```text
f04262c16bfd1a89dc699a0d
```

If the short SHA above does not resolve uniquely, derive the full SHA from the existing immutable tag:

```text
history-v3.5-frozen-before-v36
```

Accepted semantic baseline:

```text
82b4192f6e832523ce00675e39593e3f98a96403
history-v3.5-semantic-baseline
```

Use repository Git/tag history as authoritative.

---

# Evidence from the all-40 census

The completed census showed:

```text
3,774 claims
106 newly grounded claims
111 atomic propositions
309 claims blocked by insufficient structure
2 unresolved participants

236 relation candidates
103 validated
48 rejected
85 semantic duplicates collapsed
```

Validated relation kinds were heavily skewed:

```text
causal                77
dependency            22
movement               1
spatial-comparison     1
evidence-set           2

spatial-area            0
process                 0
temporal-sequence       0
policy-response         0
```

The census recommendation was:

```text
Improve structured claim generation.
```

Treat that as the task hypothesis to test.

Do not assume it is correct merely because the census recommended it; implement a measurable shadow experiment.

---

# Phase 0 — Repository checkpoint and scope audit

Before editing:

```bash
git status --short
git branch --show-current
git rev-parse HEAD
git log --oneline --decorate -20
git tag --list 'history-v3.5*'
git tag --list 'history-v3.6*'
```

Resolve and record:

```text
CURRENT_HEAD
CENSUS_SHA
CENSUS_TAG
GROUNDING_CENSUS_SHA
GROUNDING_CENSUS_TAG
CONTRACT_BASELINE_SHA
FROZEN_V35_SHA
FROZEN_V35_TAG
```

Create an immutable pre-task tag if absent:

```text
history-v3.6-pre-structured-claim-enrichment
```

Use a versioned equivalent if occupied.

Never force-update existing tags.

No destructive Git.

Leave unrelated worktree changes untouched.

Do not push unless repository policy explicitly permits it.

---

# First action — inspect the canonical claim lifecycle

Before designing types, identify exactly:

1. where canonical history claims are created;
2. where claim text/span provenance is persisted;
3. where claim kind is assigned;
4. where entities/places are bound/resolved;
5. whether claim generation is deterministic, fixture-backed, provider-backed, or mixed;
6. whether structured subject/predicate/object information already exists anywhere;
7. which claim fields V3.5 production consumes;
8. which APIs/scripts/tests assume the current claim schema;
9. how V3.6 currently converts canonical claims into atomic grounding.

Write a concise architecture note from repository evidence.

Do not redesign unrelated claim/research systems.

---

# Architectural requirement

The desired future flow is:

```text
narration/source
      ↓
canonical claim
      ↓
structured proposition(s)      ← Phase 2.5 semantic structure
      ↓
resolved participant bindings
      ↓
assertion / modality
      ↓
exact source-span provenance
      ↓
V3.6 atomic grounding
      ↓
relation candidate proposer
      ↓
unchanged deterministic validator
```

The structured proposition layer describes **what the claim explicitly says**.

It must NOT directly emit:

```text
movement relation
causal relation
policy-response relation
map
diagram
```

Those remain downstream interpretations.

---

# Compatibility requirement

V3.5 is frozen.

Do not mutate the V3.5 canonical claim contract in a way that changes:

```text
V3.5 plan hashes
V3.5 approval behavior
V3.5 map/diagram semantics
V3.5 claim serialization consumed by production
```

Preferred implementation:

```text
CanonicalClaim
      +
V3.6 shadow StructuredClaimEnvelope
```

or another repository-appropriate versioned extension.

If changing a shared claim schema is unavoidable:

- preserve backward-compatible serialization;
- feature/version gate V3.6 fields;
- run focused V3.5 regressions;
- do not alter existing V3.5 semantic fields.

---

# New V3.6 structured proposition contract

Create a typed, runtime-validated, versioned V3.6 representation.

Conceptually:

```ts
type StructuredPropositionIdV36 =
  Brand<string, "StructuredPropositionIdV36">;

type StructuredClaimEnvelopeV36 = {
  readonly schemaVersion: "...";
  readonly episodeId: EpisodeId;
  readonly claimId: ClaimId;

  readonly source: StructuredClaimSourceV36;

  readonly propositions:
    readonly StructuredPropositionV36[];
};
```

Use existing repository branded types where available.

Do not duplicate canonical IDs unnecessarily.

---

# Structured proposition model

A proposition should expose only semantics explicitly supported by its source span.

Conceptually:

```ts
type StructuredPropositionV36 = {
  readonly propositionId: StructuredPropositionIdV36;

  readonly subject: StructuredParticipantV36;

  readonly predicate: StructuredPredicateV36;

  readonly object?: StructuredParticipantV36;

  readonly roles?: readonly StructuredSemanticRoleV36[];

  readonly assertionStatus: AssertionStatusV36;

  readonly qualifiers?: readonly StructuredQualifierV36[];

  readonly sourceSpan: StructuredSourceSpanV36;

  readonly provenance: StructuredPropositionProvenanceV36;
};
```

Do not require subject/object grammar where a typed role representation is safer.

The actual discriminated model may vary by predicate family.

Prefer semantic clarity over forcing everything into one generic triple.

---

# Bounded predicate vocabulary

Use a typed predicate vocabulary.

Do not persist arbitrary free-form predicates.

Derive the minimum vocabulary from:

```text
current canonical claim kinds
V3.6 atomic-grounding predicates
45 golden fixtures
all-40 census failure classes
nine accepted relation families
```

Potential families include, only where supported:

```text
causes
contributes-to
depends-on
increases
decreases
restricts
responds-to
moves
departs-from
arrives-at
passes-through
located-at
located-in
compares-with
precedes
follows
contains-evidence-of
performs-step
```

Do not add speculative predicates merely to cover the taxonomy.

If semantics do not fit:

```text
structured proposition absent
+
typed diagnostic
```

rather than inventing a predicate.

---

# Semantic roles

Where needed, encode explicit roles rather than deriving them downstream from sentence order.

Examples:

## Movement-related claim

Potential roles:

```text
actor
origin
destination
via
location
objective
```

Critically:

```text
objective != destination
```

Franklin control must remain correct.

## Causal proposition

Potential roles:

```text
cause
effect
```

## Policy/action proposition

Potential roles:

```text
condition
actor
action
target
policy
```

Do not automatically create a policy-response relation.

## Process proposition

Potential roles:

```text
process
step
stepOrder
```

Only if ordering is explicit.

## Temporal proposition

Potential roles:

```text
event
before
after
timeAnchor
```

Chronology does not imply causality.

## Evidence proposition

Potential roles:

```text
evidenceItem
target
nestedEntity
```

Preserve Franklin evidence grouping.

---

# Assertion / modality

Reuse the accepted V3.6 assertion-status semantics.

At minimum preserve the current distinctions:

```text
asserted
uncertain
intended
attempted
```

Do not make an intent equivalent to completion.

Examples:

```text
"the fleet moved through the Channel"
=> asserted movement
```

```text
"the fleet intended to move through the Channel"
=> intended movement
```

```text
"the fleet attempted to move through the Channel"
=> attempted
```

```text
"the fleet may have moved through the Channel"
=> uncertain
```

Clause scope must remain local.

Do not regress the Phase 2.3.1 `suggests` fix.

---

# Exact provenance

Every proposition must retain enough information to verify it against the canonical claim.

Require:

```text
episodeId
claimId
source-span start/end
source-span text hash
structured schema version
generation method
generator/rule version
participant-binding references
```

If provider-backed structured generation is eventually supported, include provider/model/prompt provenance separately.

Do not include timestamps in semantic proposition identity.

---

# Semantic proposition identity

IDs must be deterministic.

Derive identity from normalized semantic content plus source authority, conceptually:

```text
episodeId
claimId
canonical predicate/variant
canonical participant IDs/roles
canonical qualifiers
assertion status
source-span hash/coordinates
schema version
```

Do not include:

```text
random UUID
timestamp
Git SHA
provider request ID
cache path
```

Add determinism tests.

---

# Source types

Use a small typed source enum.

For this task, prefer something equivalent to:

```text
existing-structured-claim
deterministic-shadow-enrichment
```

If canonical claim generation already has a provider-backed structured form, model that explicitly.

Do not add live LLM enrichment in this task unless the repository ALREADY generates canonical claims using a provider and structured output can be added to that existing call without an extra paid invocation.

Even in that case:

```text
do not run live provider calls during this task
```

Use fixtures/mocks.

---

# Important: no second post-hoc inference engine

Do not simply move the current atomic-grounding regex implementation into a new file and call it "structured claims."

The new layer must be architecturally tied to the claim-generation/normalization boundary.

Compatibility backfill from existing claims is allowed for evaluating the historical 40-episode corpus, but it must be explicitly marked:

```text
backfill / shadow compatibility
```

and must not be presented as equivalent to future native structured claim generation.

---

# Native path vs backfill path

Design two explicit paths if needed:

```text
A. native structured claim generation
B. compatibility backfill for existing claims
```

## Native

Used by future V3.6 claim generation.

The semantics are produced/persisted at the canonical claim boundary.

## Backfill

Used to evaluate existing 40 episodes without regenerating claims.

It may reuse existing safe deterministic grounding rules.

Its provenance must say:

```text
deterministic-shadow-enrichment
```

Never silently mix the two.

---

# Runtime schema + generated JSON Schema

Create an authoritative runtime schema.

Suggested conceptual paths:

```text
packages/history/src/v36/structured-claim-v36.ts
docs/history/v3.6/structured-claim-schema.json
docs/history/v3.6/structured-claim-contract-document.json
```

Use actual repository conventions.

Generate JSON Schema mechanically from the runtime schema, as already established for V3.6 relation/grounding contracts.

Do not manually duplicate machine contracts.

---

# Required schema rejection tests

Reject:

```text
primitive root
empty object
unknown schema version
unknown predicate
unknown assertion status
missing claimId
missing source span
invalid span range
malformed participant
unknown participant role
invalid movement objective/destination shape
invalid ordered step index
unknown additional properties where strict
```

Valid controls must cover every supported proposition family.

---

# Diagnostics

Use a small typed diagnostic catalog.

Potential diagnostics:

```text
STRUCTURED_CLAIM_UNSUPPORTED_SEMANTICS
STRUCTURED_CLAIM_PARTICIPANT_UNRESOLVED
STRUCTURED_CLAIM_PREDICATE_AMBIGUOUS
STRUCTURED_CLAIM_ASSERTION_SCOPE_AMBIGUOUS
STRUCTURED_CLAIM_SOURCE_SPAN_INVALID
STRUCTURED_CLAIM_PURPOSE_NOT_DESTINATION
STRUCTURED_CLAIM_GROUPING_AMBIGUOUS
STRUCTURED_CLAIM_BACKFILL_INSUFFICIENT
```

Reuse existing diagnostics where semantically identical.

Do not create duplicate catalogs.

---

# Semantic controls

Preserve all previously accepted controls.

---

## Franklin

For:

```text
sailed from Britain to search for the Northwest Passage
```

structured semantics may include:

```text
departure/origin: Britain
objective/search-object: Northwest Passage
assertion: asserted departure/search activity
```

but must NOT encode:

```text
destination: Northwest Passage
```

unless separately supported.

Evidence grouping for sailors/graves must remain nested correctly.

---

## Black Death

Structure explicit claim semantics around:

```text
demographic shock
labour conditions/scarcity
survivor bargaining/wage demands
Ordinance/Statute of Labourers
wage restriction
```

Do not create cross-claim causality that no individual claim asserts.

The desired output is stronger semantic structure per claim, not fabricated final relations.

---

## Spanish Armada

Distinguish:

```text
actual departure/movement
intended mission route
actual causal loss factors
```

Do not turn mission objective into completed route.

Preserve the clause-boundary fix for storms/navigation/hunger/disease/shipwreck.

---

## D-Day

Represent:

```text
Normandy selection
Pas-de-Calais expectation/consideration
asserted landing/location where resolved
```

Do not invent unresolved beach IDs.

---

## 1066

Represent actual landing/campaign facts.

Keep the known bad:

```text
Europe -> England -> King Edward
```

unsupported.

Do not invent movement origin for Pevensey.

---

## Titanic

Preserve:

```text
ice -> Californian stopping
```

where source claim supports it.

Do not fragment `International Ice Patrol`.

---

## Bronze Age / Chernobyl

Use as stability controls.

Do not inflate semantic structures simply to increase counts.

---

# Representative validation first

Before running the full 40-episode evaluation, test the native/backfill structured proposition representation on the SAME eight representative episodes:

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

Compare against the frozen Phase 2.3.1 grounding baseline.

Do not alter semantics in response to aggregate counts.

Only fix actual contract/implementation defects found by focused tests.

---

# Integration with atomic grounding

After structured proposition contracts are green:

make V3.6 atomic grounding consume structured propositions preferentially.

Required priority:

```text
native structured proposition
    ↓
compatibility structured proposition
    ↓
existing frozen grounding fallback
```

Do not delete the fallback yet.

Record which path produced each atomic proposition.

Do not allow the structured layer to bypass atomic-grounding validation.

---

# Grounding integration invariants

Require:

```text
structured proposition schema-valid
participant IDs resolved or explicitly unresolved
source span valid
assertion status preserved
purpose/destination distinction preserved
proper-name atomicity preserved
```

Then atomic grounding may normalize it into the accepted grounding IR.

Do not modify relation validator behavior.

---

# Relation rerun

After the 8-episode structured integration is green:

rerun the existing frozen deterministic relation extractor.

Measure:

```text
old atomic proposition count
new atomic proposition count

old candidate count
new candidate count

old validated relations
new validated relations

old rejects
new rejects
```

Do not require more relations.

Any new relation must pass the unchanged validator.

---

# Representative acceptance gate before all-40

Proceed to all-40 measurement only if:

```text
unsupported validated relations = 0
purpose-as-destination errors = 0
proper-name fragmentation = 0
cross-episode support = 0
directionality/cardinality violations = 0
schema-invalid structured propositions = 0
```

and all existing golden/safety tests remain green.

If a fundamental contract defect appears:

stop before the 40-episode run and report it.

---

# All-40 shadow evaluation

Once the representative gate passes:

run the new structured-claim layer over the same authoritative 40-episode corpus used by the census.

This remains:

```text
SHADOW MEASUREMENT ONLY
```

Do not modify semantics during the all-40 run.

Freeze the structured-claim implementation before starting the corpus evaluation.

Create an immutable checkpoint:

```text
history-v3.6-structured-claim-corpus-baseline
```

Record its SHA.

No semantic edits after this checkpoint until the corpus artifact is generated.

---

# All-40 comparison metrics

Compare directly against the frozen census.

At minimum report:

## Structured claims

```text
total canonical claims
claims with structured propositions
total structured propositions
native structured count
backfill structured count
schema rejects
diagnostics by code
```

## Atomic grounding

```text
Phase 2.4 atomic propositions: 111
new atomic propositions
claims newly grounded
insufficient-structure count before/after
unresolved count before/after
```

## Relations

```text
Phase 2.4 candidates: 236
Phase 2.4 validated: 103
Phase 2.4 rejected: 48

new candidates
new validated
new rejected
duplicates collapsed
relations by kind before/after
```

Explicitly compare whether previously absent kinds emerge:

```text
spatial-area
process
temporal-sequence
policy-response
```

Do not consider appearance alone proof of quality.

---

# Most important success metric

The main hypothesis is:

> Better upstream structure should reduce `insufficient-structure` without increasing semantic safety violations.

Report:

```text
insufficient-structure:
309 -> NEW_VALUE
```

and calculate:

```text
absolute reduction
percentage reduction
```

Do not manipulate thresholds to produce improvement.

---

# Structured coverage

Report per episode:

```text
claims
claims with structured propositions
structured proposition count
atomic proposition count
insufficient-structure count
validated relation count
```

Also report:

```text
median
p25
p75
min
max
```

for key coverage metrics.

---

# Bottleneck reassessment

Reclassify systemic bottlenecks after the structured-claim experiment:

```text
A. entity/place resolution
B. canonical structured-claim generation
C. candidate projection
D. compositional/cross-claim proof
E. relation taxonomy
F. V3.5 legacy false positives
G. V3.6 validated semantic improvements
```

Do not force category B to win.

Use measured evidence.

---

# Differential-reporting fix

The previous census differential was too coarse/episode-level.

In this task, improve differential reporting enough to avoid misleading counts.

Do NOT build a giant semantic alignment engine.

At minimum distinguish:

```text
episode-presence summary
```

from:

```text
relation/signal-level comparison coverage
```

Never label 40 episode-level classifications as if they were 103 relation-level comparisons.

Add explicit fields such as:

```text
comparisonGranularity
itemsCompared
itemsUnpaired
```

If exact relation-level V3.5 pairing is unavailable:

say so.

Do not fabricate alignment.

---

# Candidate-projection reporting fix

The previous census understated candidate-projection bottlenecks.

Report separately:

```text
candidate proposed
candidate validator rejected
candidate rejected by reason
```

Do not equate strict validator rejection with upstream structured-claim failure.

Systemic category C must be evidence-driven rather than hard-coded zero.

---

# Manual-review set

Produce a bounded deterministic manual-review set.

Must include:

```text
all newly validated relation kinds
all new policy-response/process/temporal/spatial-area relations
all changed purpose-vs-destination cases
all assertion/modality-sensitive changes
all structured propositions that lead to newly validated relations
all structured propositions rejected downstream for semantic reasons
known V3.5 regression controls
taxonomy-extension cases
```

Sample ordinary unchanged cases.

Target:

```text
<= 100 ordinary review items
```

Mandatory safety/conflict items may exceed the cap.

---

# No live LLM

Do not call:

```text
bounded LLM relation proposer
LLM grounding
LLM structured-claim generator
web research
external historical sources
```

during this task.

If native canonical claim generation normally uses a provider:

use fixtures/mocks for implementation tests and use compatibility backfill for the existing 40-episode evaluation.

Do not regenerate the 40 claims through paid providers.

---

# No maps / diagrams

Do not implement or generate:

```text
V3.6 maps
V3.6 diagrams
```

Do not alter V3.5 visual plans.

---

# No V3.5 changes

V3.5 production files/behavior remain frozen.

If a shared type must change:

preserve V3.5 compatibility and run focused V3.5 regression tests.

Do not regenerate the full V3.5 approval bundle unless actual shared V3.5 behavior changes.

---

# Tests

Follow risk-based validation.

Run in this order:

1. existing V3.6 schema/IR tests;
2. 45 golden fixtures;
3. structured-claim runtime schema tests;
4. generated JSON-Schema tests;
5. proposition identity tests;
6. assertion/modality tests;
7. semantic-role tests;
8. Franklin purpose/destination tests;
9. evidence nesting/grouping tests;
10. clause-boundary tests;
11. representative 8-episode structured-enrichment tests;
12. atomic-grounding integration tests;
13. deterministic relation integration tests;
14. differential-granularity reporting tests;
15. candidate-rejection classification tests;
16. affected package typecheck;
17. targeted lint;
18. same-eight shadow run;
19. freeze structured-claim corpus baseline;
20. all-40 shadow evaluation;
21. final persisted-object schema/invariant sweep;
22. deterministic hash/repeat check;
23. artifact checksum/ZIP validation.

Do not run unrelated full repository suites.

---

# Hard safety gates

Among validated output:

```text
unsupported validated relations = 0
duplicate semantic relation IDs = 0
cross-episode support violations = 0
directionality violations = 0
cardinality violations = 0
proper-name fragmentation = 0
purpose-as-destination errors = 0
schema-invalid relations = 0
schema-invalid atomic grounding = 0
schema-invalid structured propositions = 0
```

If any is non-zero:

```text
artifact verdict = FAIL
```

Do not weaken validation.

---

# Determinism

Same frozen inputs must produce:

```text
same structured proposition IDs
same atomic grounding IDs
same relation semantic IDs
same diagnostics
same aggregate metrics
```

excluding timestamps/provenance envelope.

Use deterministic hashes where practical.

---

# Performance

Keep this cheap.

No external network/provider calls.

Record:

```text
episode runtime
claims processed
structured propositions emitted
atomic propositions emitted
relations validated
```

Do not add heavy observability infrastructure.

---

# Safe parallelism

Use **ONE primary writer** for shared contract/generation/integration code.

Read-only/disjoint subagents may:

### Agent A
audit canonical claim-generation seams and compatibility requirements;

### Agent B
audit movement/modality/evidence semantic controls;

### Agent C
analyze all-40 measurement output after the frozen run.

Do not allow competing implementations of the structured proposition contract.

---

# Token discipline

Minimize context and token use:

```text
reuse existing census artifacts
inspect only affected claim/V3.6 modules
same eight episodes for development
scripts for all-40 metrics
no full episode dumps
no external research
no live LLM
no image/audio review
focused tests
```

---

# Artifact

Generate:

```text
history-v3.6-structured-claim-enrichment-review-YYYYMMDDTHHMMSSZ.zip
```

Include at least:

```text
README.md

architecture.md
structured-claim-schema.json
structured-claim-contract-document.json

representative-summary.json
all40-summary.json
structured-claim-summary.json
grounding-comparison.json
relation-comparison.json

episode-summary.json
diagnostic-summary.json
candidate-rejection-summary.json

differential-granularity-summary.json
manual-review.json
systemic-findings.json
decision-report.md

test-summary.json
invariant-test-summary.json
provenance.json
checksums.sha256
```

Keep files compact.

Do not package large legacy approval bundles.

---

# Artifact provenance

Include:

```text
v36ImplementationCommitSha
structuredClaimCorpusBaselineCommitSha
censusBaselineCommitSha
groundingCensusBaselineCommitSha
contractBaselineCommitSha
frozenV35ProductionCommitSha
acceptedV35SemanticBaselineCommitSha

structuredClaimSchemaVersion
atomicGroundingSchemaVersion
relationSchemaVersion

artifactKind
episodeSet
generatedAt
gitBranch
```

Artifact kind:

```text
history-v3.6-structured-claim-enrichment-review
```

Version provenance schema if required.

---

# Commit/tag strategy

Prefer two checkpoints.

## 1. Structured-claim contract + representative integration

After focused representative validation:

```text
feat(history): add v3.6 structured claim enrichment
```

Tag:

```text
history-v3.6-structured-claim-baseline
```

## 2. Frozen all-40 evaluation tooling/artifact

Before/at all-40 freeze:

```text
history-v3.6-structured-claim-corpus-baseline
```

Then commit reporting/artifact generation as needed:

```text
feat(history): evaluate v3.6 structured claims across corpus
```

Final tag:

```text
history-v3.6-structured-claim-review-baseline
```

Use versioned equivalents if names exist.

Never overwrite existing tags.

Generate the final review artifact from the final committed state.

Do not push unless repository policy permits it.

---

# Required completion report

Return:

1. Starting SHA/tag.
2. Census baseline SHA/tag.
3. Grounding census baseline SHA/tag.
4. Contract baseline SHA/tag.
5. Frozen V3.5 SHA/tag.
6. Canonical claim-generation module paths inspected.
7. Current claim-generation lifecycle summary.
8. Chosen compatibility architecture.
9. Structured-claim runtime schema path.
10. Generated JSON-Schema path.
11. Contract-document path.
12. Structured predicate vocabulary.
13. Semantic role vocabulary.
14. Assertion-status vocabulary.
15. Structured proposition ID algorithm.
16. Structured provenance model.
17. Native vs compatibility-backfill semantics.
18. Diagnostics added.
19. Tests added.
20. Golden fixture result.
21. Representative 8-episode result.
22. Structured-claim baseline commit/tag.
23. Confirmation semantic implementation frozen before all-40 run.
24. All-40 canonical claim count.
25. Claims with structured propositions.
26. Structured proposition total.
27. Native vs backfill proposition counts.
28. Structured schema rejects.
29. Atomic propositions before/after.
30. `insufficient-structure` before/after.
31. Absolute/percentage reduction in insufficient structure.
32. Relation candidates before/after.
33. Validated relations before/after.
34. Rejected candidates before/after.
35. Relation-kind distribution before/after.
36. Newly appearing relation kinds, if any.
37. Candidate rejection reasons.
38. Genuine unresolved participant count.
39. Hard safety invariant counts.
40. Differential granularity explanation.
41. Items compared/unpaired.
42. Manual-review set size.
43. Systemic bottleneck category results A-G.
44. Determinism result.
45. Typecheck/lint result.
46. Confirmation live LLM calls = 0.
47. Confirmation V3.5 production unchanged.
48. Final commit SHA.
49. Final immutable tag.
50. Review artifact path.
51. Artifact SHA-256/checksum result.
52. Recommend exactly ONE next architectural task; do not execute it.

---

# Acceptance criteria

Complete only when all are true.

## Architecture

- [ ] Structured proposition representation exists at/adjacent to the canonical claim-generation boundary.
- [ ] It is not merely a renamed post-hoc grounding regex layer.
- [ ] Runtime schema is authoritative.
- [ ] Machine JSON Schema is mechanically generated.
- [ ] Proposition IDs are deterministic.
- [ ] Exact source-span provenance is preserved.
- [ ] Predicates are bounded/typed.
- [ ] Semantic roles are typed where needed.
- [ ] Assertion/modality is preserved.
- [ ] Structured propositions do not directly create explanatory relations.

## Compatibility

- [ ] V3.5 production semantics remain unchanged.
- [ ] Existing canonical claim consumers remain compatible.
- [ ] Native structured generation and historical compatibility backfill are distinguishable.
- [ ] Backfill provenance is explicit.
- [ ] No live provider calls are required for historical corpus evaluation.

## Semantic controls

- [ ] Franklin objective is not destination.
- [ ] Spanish Armada intent is not completed movement.
- [ ] Titanic ice/Californian behavior remains correct.
- [ ] 1066 bad causal chain remains unsupported.
- [ ] Proper names remain atomic.
- [ ] Evidence grouping remains nested correctly.
- [ ] Clause-scoped assertion status remains correct.
- [ ] Cross-claim causality is not fabricated by the structured-claim layer.

## Integration

- [ ] Atomic grounding preferentially consumes structured propositions.
- [ ] Existing fallback remains available during shadow phase.
- [ ] Relation validator remains unchanged.
- [ ] Same-eight representative safety gate passes before all-40 evaluation.
- [ ] Structured semantics are frozen before the all-40 run.
- [ ] No semantic remediation occurs during the all-40 measurement.

## Corpus measurement

- [ ] Exactly 40 authoritative episodes are evaluated.
- [ ] `309 insufficient-structure` census baseline is compared against the new result.
- [ ] Structured coverage is reported by episode and corpus.
- [ ] Atomic-grounding before/after is reported.
- [ ] Relation before/after is reported.
- [ ] Relation-kind distribution is reported.
- [ ] Candidate rejection reasons are reported independently from structured-grounding failures.
- [ ] Differential granularity is explicitly labeled and not overstated.
- [ ] Systemic bottlenecks are reassessed from data.

## Safety

- [ ] Unsupported validated relations = 0.
- [ ] Duplicate semantic IDs = 0.
- [ ] Cross-episode support violations = 0.
- [ ] Directionality violations = 0.
- [ ] Cardinality violations = 0.
- [ ] Proper-name fragmentation = 0.
- [ ] Purpose-as-destination errors = 0.
- [ ] Invalid structured propositions = 0.
- [ ] Invalid atomic grounding = 0.
- [ ] Invalid persisted relations = 0.

## Scope

- [ ] No live LLM calls.
- [ ] No LLM grounding.
- [ ] No production LLM integration.
- [ ] No V3.6 maps.
- [ ] No V3.6 diagrams.
- [ ] No V3.5 remediation.
- [ ] No relation taxonomy expansion.
- [ ] No validator weakening.
- [ ] No global entity-resolution redesign.
- [ ] No narration/TTS/localization/rendering changes.

## Artifact

- [ ] Successful representative baseline committed/tagged.
- [ ] Frozen corpus baseline created before all-40 evaluation.
- [ ] Final evaluation committed/tagged.
- [ ] Timestamped review artifact generated.
- [ ] Provenance is explicit.
- [ ] Checksums pass.
- [ ] ZIP integrity passes.

Stop after the structured-claim enrichment evaluation.

Do not automatically execute the recommended next task.
