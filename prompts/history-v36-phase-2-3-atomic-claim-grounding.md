# Goal: V3.6 Phase 2.3 — Atomic Claim Grounding Shadow IR

Work in **strict shadow-architecture mode**.

Do not modify V3.5 production semantics.

Do not expand to all 40 episodes.

Do not run live LLM relation proposal.

Do not implement V3.6 maps or diagrams.

Do not weaken or redesign the accepted V3.6 `ExplanatoryRelation` validator.

The objective of this task is:

> Introduce a typed, deterministic, reviewable **atomic claim-grounding layer** upstream of V3.6 relation extraction, evaluate it on the SAME eight representative episodes, and measure whether it supplies the proposition-level evidence currently missing from relation validation.

This task should preserve the successful V3.6 architecture:

```text
canonical claims
      ↓
atomic claim grounding       ← NEW Phase 2.3 layer
      ↓
resolved semantic atoms / bindings
      ↓
existing deterministic proposer
      ↓
optional bounded LLM proposer [remain disabled]
      ↓
UNCHANGED ExplanatoryRelation validator
```

The grounding layer provides evidence.

It does NOT approve relations.

---

# Accepted baselines

Phase 2.2:

```text
PHASE_22_SHA:
35e917207713e0a1b44d75b7d27dd698d6a70d35

PHASE_22_TAG:
history-v3.6-bounded-llm-shadow-baseline
```

Representative V2:

```text
a314d64e453e4abba9ea25ec21faaf8505b9fdcd
history-v3.6-representative-shadow-v2-baseline
```

V3.6 contract baseline:

```text
022f2177cc0e66f47cb5d652d6d456ce12a5a7be
history-v3.6-contract-preflight-baseline
```

Frozen V3.5:

```text
f04262c16bfd1a89d1b404b1ac291a89dc699a0d
history-v3.5-frozen-before-v36
```

Accepted V3.5 semantic baseline:

```text
82b4192f6e832523ce00675e39593e3f98a96403
history-v3.5-semantic-baseline
```

Do not reinterpret these baselines.

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

Resolve actual repository IDs from existing Phase 2.1/2.2 artifacts.

Do not process all 40.

---

# Phase 0 — Mandatory checkpoint

Before edits:

```bash
git status --short
git branch --show-current
git log --oneline --decorate -20
git tag --list 'history-v3.5*'
git tag --list 'history-v3.6*'
git rev-parse HEAD
git rev-parse 35e917207713e0a1b44d75b7d27dd698d6a70d35
```

Record:

```text
CURRENT_HEAD
PHASE_22_SHA
PHASE_22_TAG
CONTRACT_BASELINE_SHA
FROZEN_V35_SHA
```

Create an immutable checkpoint if absent:

```text
history-v3.6-pre-atomic-grounding
```

If occupied, create a versioned equivalent.

Do not overwrite existing tags.

Do not use destructive Git commands.

Do not push unless repository policy explicitly permits it.

Leave unrelated untracked files untouched.

---

# Why this task exists

Phase 2.2 showed a clear bottleneck:

The proposer can identify potentially valid relations, but the existing claims often lack normalized proposition-level evidence needed by the deterministic validator.

Known Black Death example:

```text
Claim A:
When the first great wave receded, the demographic shock transformed labor.

Claim B:
Survivors could demand higher wages or better terms...
```

Current claim representation may expose:

```text
groundedPropositions: []
```

even though useful semantic atoms are present in the claim text.

Likewise:

```text
the Ordinance and Statute of Labourers attempted to restrict wages...
```

should expose a proposition corresponding to wage-restriction policy without requiring the relation validator to infer it itself.

The correct fix is NOT:

```text
weaken RELATION_PROPOSITION_UNSUPPORTED
```

The correct fix is:

```text
build a typed proposition-grounding representation
```

upstream.

---

# Architectural rule

The new layer must separate:

```text
claim text
```

from:

```text
grounded atomic semantic propositions
```

and each grounded proposition must preserve exact provenance.

The relation validator must continue validating relation claims against grounded proposition evidence.

---

# New typed IR

Introduce a V3.6-only typed structure conceptually equivalent to:

```ts
type AtomicGroundingIdV36 = Brand<string, "AtomicGroundingIdV36">;

type AtomicConceptRefV36 = {
  readonly id: ConceptId | EntityId | PlaceId;
  readonly label: string;
  readonly kind: "concept" | "entity" | "place";
};

type AtomicPropositionV36 = {
  readonly groundingId: AtomicGroundingIdV36;
  readonly episodeId: EpisodeId;
  readonly claimId: ClaimId;

  readonly subject: AtomicConceptRefV36;
  readonly predicate: AtomicPredicateV36;
  readonly object?: AtomicConceptRefV36;

  readonly qualifiers?: readonly AtomicQualifierV36[];

  readonly sourceSpan: {
    readonly start: number;
    readonly end: number;
    readonly textHash: string;
  };

  readonly provenance: AtomicGroundingProvenanceV36;
};
```

Use actual repository types and naming conventions.

Do not force this exact shape if the codebase already has a better canonical abstraction.

---

# Predicate model

Use a SMALL typed predicate vocabulary.

Do NOT create an open-ended natural-language predicate string.

Prefer a bounded vocabulary sufficient for current representative needs.

Examples may include:

```text
causes
contributes-to
depends-on
increases
decreases
restricts
responds-to
moves-from
moves-to
located-in
compares-with
precedes
contains-evidence-of
```

But do not add predicates speculatively.

Derive the minimum set from:

```text
existing claim structures
45 golden fixtures
representative 8 episodes
current relation taxonomy
```

If a proposition cannot be normalized safely:

```text
do not emit an atomic proposition
record diagnostic
```

---

# Important distinction: atomic proposition != relation

Examples:

```text
labour scarcity increases bargaining power
higher bargaining power increases wages
authorities restrict wages
```

may be grounded propositions.

A relation proposer may later use them to propose:

```text
causal
policy-response
```

But the grounding layer itself must not create `ExplanatoryRelation`.

Keep layers separate.

---

# Grounding source

Use existing structured claim data first.

Priority:

```text
1. existing explicit normalized/structured proposition fields
2. resolved subject/predicate/object fields
3. claim-level entity/place bindings
4. narrowly bounded deterministic claim normalization
```

Do NOT begin with broad free-text NLP.

Do NOT scan whole episodes.

Do NOT add live LLM grounding in this task.

---

# No live LLM

The Phase 2.2 bounded LLM proposer remains:

```text
implemented
disabled by default
```

Do not call it live.

Do not introduce an LLM grounding step.

Do not add research or external knowledge.

This task measures what deterministic structured grounding can provide first.

---

# Grounding provenance

Every atomic proposition must answer:

```text
which episode?
which claim?
which exact source span?
which source text hash?
which resolved participants?
which grounding rule produced it?
which grounding schema version?
```

Do not create provenance-free semantic atoms.

---

# Deterministic grounding ID

Grounding identity must be deterministic.

Conceptually derive from:

```text
episodeId
claimId
canonical subject
canonical predicate
canonical object
canonical qualifiers
source-span coordinates/hash
grounding schema version
```

Do not include:

```text
timestamps
random UUIDs
Git SHA
render IDs
```

Add deterministic identity tests.

---

# Grounding rule IDs

Every deterministic grounding rule should have a stable typed/versioned rule ID.

Examples:

```text
explicit-structured-proposition-v1
bounded-causal-clause-v1
bounded-policy-action-v1
explicit-movement-endpoint-v1
```

Do not generate dozens of ad-hoc rule names.

Keep the rule set small and reviewable.

---

# Required diagnostics

Create or reuse narrowly scoped diagnostics.

Examples:

```text
GROUNDING_PARTICIPANT_UNRESOLVED
GROUNDING_PREDICATE_AMBIGUOUS
GROUNDING_SOURCE_SPAN_INVALID
GROUNDING_PROPER_NAME_FRAGMENTATION
GROUNDING_PURPOSE_NOT_DESTINATION
GROUNDING_COMPOUND_ARGUMENT_AMBIGUOUS
GROUNDING_UNSUPPORTED_STRUCTURE
```

Do not duplicate existing entity/claim diagnostics unnecessarily.

---

# Proper-name atomicity

Preserve the accepted invariant.

Examples that must stay atomic:

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

Do not emit proposition participants from arbitrary substrings of proper names.

---

# Purpose vs destination

Carry the Phase 2.2 Franklin fix into grounding.

Example:

```text
sailed from Britain to search for the Northwest Passage
```

may ground:

```text
movement-origin = Britain
search-object = Northwest Passage
```

but MUST NOT ground:

```text
movement-destination = Northwest Passage
```

unless another explicit proposition establishes it.

This must be enforced at the grounding layer too.

---

# Grouped concepts

Preserve the Phase 2.1 grouped-concept policy.

Examples:

```text
storms, navigation difficulty, hunger, disease, and shipwreck
taxes and agricultural surpluses
resistance networks and local knowledge
```

Do not blindly split conjunctions.

Ground a grouped concept when the source predicates collectively over the group.

Split only when the source independently predicates over each member.

If ambiguous:

```text
keep grouped or fail closed
```

Do not invent atomicity.

---

# Evidence-set nesting

Preserve the Franklin evidence semantics.

Example:

```text
graves of John Torrington, John Hartnell, and William Braine
```

should not become three peer atomic evidence propositions merely because three names are present.

Keep:

```text
grave/burial evidence
```

as the semantic item, with named sailors as nested qualifiers/entities if the contract needs them.

---

# Clause boundaries

Preserve the Spanish Armada fix.

Example:

```text
The Armada sailed north around Scotland and Ireland,
where storms, navigation difficulty, hunger, disease and shipwreck caused losses.
```

Ground:

```text
storms/navigation difficulty/hunger/disease/shipwreck
causes
losses
```

without including unrelated route narration inside the causal subject.

---

# Adjacent claims

Atomic grounding itself should normally remain claim-local.

Do not merge adjacent claims into one atomic proposition unless the existing structured representation explicitly encodes a cross-claim proposition.

Cross-claim relation composition remains the proposer’s responsibility.

This is important.

Ground:

```text
Claim A:
labour became scarce

Claim B:
survivors demanded higher wages
```

as separate propositions if supported.

Then let relation proposal compose them.

Do NOT fabricate a single synthetic cross-claim proposition:

```text
labour scarcity caused higher wages
```

unless a claim explicitly states it.

---

# Black Death target

This episode is the most important coverage control.

Inspect claims around:

```text
demographic shock
labour scarcity
survivor bargaining power
higher wages
Ordinance of Labourers
Statute of Labourers
wage restrictions
```

The grounding layer should expose the smallest defensible semantic atoms.

Examples conceptually:

```text
population loss -> labour scarcity
labour scarcity -> increased worker bargaining power
survivors -> demanded higher wages
authorities -> attempted wage restriction
```

Only emit what exact claim text supports.

Do not force the desired final relation.

---

# Spanish Armada target

Ground movement-relevant atoms independently:

```text
fleet departed Lisbon
fleet entered/passed English Channel
fleet moved around Scotland
fleet moved around Ireland
```

ONLY when claim text establishes each transition/location fact.

Mission/objective language must remain distinct from actual movement.

Example:

```text
mission was to move through the English Channel
```

must not be normalized identically to:

```text
fleet moved through the English Channel
```

Model modality/status if required.

---

# Modality / assertion status

This is important.

Atomic propositions must distinguish where useful:

```text
actual/asserted event
intent/plan
attempt
counterfactual
uncertain/reported
```

Do not treat:

```text
planned to
intended to
mission was to
attempted to
```

as equivalent to completed fact.

Introduce the smallest typed assertion-status model necessary.

Conceptually:

```text
asserted
intended
attempted
uncertain
```

Do not over-engineer.

The relation proposer/validator should be able to reject or treat non-asserted propositions appropriately.

---

# D-Day target

Ground:

```text
Normandy selected
Pas-de-Calais expected/considered
landing occurred at relevant resolved area
```

while preserving assertion/modality differences.

Do not manufacture unresolved Utah/Omaha place IDs.

---

# 1066 target

Ground actual landing/location/campaign facts only.

Do NOT ground:

```text
Europe -> England -> King Edward
```

as causal or movement semantics.

If Pevensey remains unresolved:

```text
record grounding participant unresolved
```

Do not broaden global entity resolution.

---

# Titanic target

Preserve:

```text
ice causes Californian stopping
```

if the claim supports it.

Ensure:

```text
ice
```

does not fragment `International Ice Patrol`.

No regression.

---

# Franklin target

Preserve corrected evidence grouping.

Preserve purpose/destination distinction.

If the text only establishes:

```text
Britain = departure origin
Northwest Passage = search objective
```

ground exactly that distinction.

---

# Bronze Age and Chernobyl

Use as stability controls.

Do not inflate grounding counts.

Ground only explicit propositions.

---

# Grounding schema

Create a real runtime schema and generated machine JSON Schema using the same pattern established for V3.6 relations.

Suggested paths conceptually:

```text
packages/history/src/v36/atomic-claim-grounding-v36.ts
docs/history/v3.6/atomic-grounding-schema.json
docs/history/v3.6/atomic-grounding-contract-document.json
```

Use repository conventions.

The runtime schema is authoritative.

Generated JSON Schema must reject malformed payloads.

---

# Required schema tests

Reject:

```text
primitive
empty object
unknown predicate
unknown assertion status
missing claimId
missing subject
malformed participant ref
invalid source span
unknown grounding rule
unknown additional properties where strictness applies
```

Accept valid controls.

---

# Grounding property/invariant tests

Add focused invariants:

```text
groundingIdDeterministic
episodeIsolation
claimIsolation
sourceSpanWithinClaim
participantResolutionRequired
properNameAtomicity
purposeNotDestination
assertionStatusPreserved
groupedConceptDeterministic
evidenceNestingPreserved
noCrossClaimSyntheticGrounding
```

Use table-driven/property tests consistent with current dependency policy.

---

# Grounding extraction metrics

For each representative episode report:

```text
claims inspected
claims with existing structured propositions
claims newly grounded deterministically
atomic propositions emitted
grounding rejects
unresolved participant cases
ambiguous predicate cases
assertion-status counts
grounding rules used
```

Do not use raw proposition count as success by itself.

---

# Coverage categories

For each claim classify:

```text
existing-grounding
new-deterministic-grounding
insufficient-structure
unresolved-participant
not-explanatory
ambiguous
```

Keep categories small.

---

# Relation rerun after grounding

After the grounding layer is green:

rerun the EXISTING deterministic V3.6 relation extractor on the same eight episodes using the new grounding IR as evidence input.

Do NOT add new relation heuristics.

Do NOT change the relation validator.

The key measurement is:

```text
does better grounding allow existing proposer + validator
to recover additional supported relations?
```

---

# LLM mock rerun

Keep live LLM disabled.

Rerun the existing MOCK bounded LLM experiment using the new grounding evidence.

Measure:

```text
mock proposals
pre-validator rejects
validator rejects
admitted relations
```

Do not tune the mock to manufacture success.

The purpose is regression/integration validation.

---

# Black Death comparison

Explicitly compare before/after:

```text
Phase 2.2:
labour/wage candidate rejected due insufficient proposition support

Phase 2.3:
atomic grounding available?
relation proposed?
validator result?
```

Likewise:

```text
wage pressure / wage restriction policy response
```

Do not require acceptance if source claims still do not support the exact relation.

---

# Spanish Armada comparison

Explicitly report whether grounding now distinguishes:

```text
actual movement
vs
mission/intention
```

and whether any new validated movement relation emerges WITHOUT loosening relation validation.

---

# 1066 comparison

Report whether landing/campaign grounding improves.

Do not invent an origin.

The known bad V3.5 causal chain must remain unsupported.

---

# Franklin comparison

Report:

```text
departure origin grounding
search-object grounding
movement destination grounding
```

Expected:

```text
Britain = departure origin
Northwest Passage = search objective
Northwest Passage != movement destination
```

unless separate evidence proves otherwise.

---

# Relation safety invariants remain HARD

After rerun:

```text
unsupported validated relations = 0
duplicate semantic relation IDs = 0
cross-episode support = 0
directionality violations = 0
cardinality violations = 0
proper-name fragmentation = 0
purpose-as-destination errors = 0
schema-invalid persisted relations = 0
```

Do not weaken these to improve recall.

---

# No live provider calls

Even if configuration exists:

```text
DO NOT run live LLM proposal in this task
```

The next decision will determine whether live evaluation is worthwhile.

Use mocks/fixtures only.

---

# Review artifact

Generate:

```text
history-v3.6-atomic-grounding-review-YYYYMMDDTHHMMSSZ.zip
```

Include at least:

```text
README.md
atomic-grounding-schema.json
atomic-grounding-contract-document.json
grounding-summary.json
episode-grounding/
relation-rerun-summary.json
phase22-comparison.json
manual-review.json
diagnostic-summary.json
test-summary.json
invariant-test-summary.json
provenance.json
checksums.sha256
```

Do not include full V3.5 approval packs.

---

# Manual review set

Include all:

```text
ambiguous grounding
new deterministic grounding used by a validated relation
new grounding rejected downstream
assertion-status-sensitive cases
unresolved participants
purpose-vs-destination cases
grouped-concept cases
evidence nesting cases
```

Also include deterministic samples of ordinary accepted grounding.

---

# Artifact provenance

Use explicit V3.6 provenance.

Include:

```text
v36ImplementationCommitSha
phase22BaselineCommitSha
contractBaselineCommitSha
frozenV35ProductionCommitSha
acceptedV35SemanticBaselineCommitSha
groundingSchemaVersion
artifactKind
episodeSet
generatedAt
```

Use a dedicated artifact kind:

```text
history-v3.6-atomic-grounding-review
```

Version provenance schema if necessary.

---

# Performance

Keep grounding lightweight.

Record:

```text
episode duration
claims processed
atomic propositions emitted
rejects
```

No heavy observability infrastructure.

---

# Safe parallelism

Use ONE primary writer for:

```text
atomic grounding schema
grounder
relation evidence integration
```

Optional read-only agents:

### Agent A
Black Death / Spanish Armada grounding audit.

### Agent B
Franklin / Titanic / 1066 semantic-boundary audit.

### Agent C
Schema/test/review-artifact audit.

Do not let multiple agents implement competing grounding models.

---

# Token discipline

Keep token use low:

```text
same 8 episodes
no web research
no external history research
no images
no audio
no narration regeneration
no all-40 scan
no live LLM
no huge JSON dumps
focused package tests only
```

Reuse existing claim/entity artifacts.

---

# Explicit anti-goals

Do NOT:

- modify V3.5 production code;
- process all 40 episodes;
- run live LLM calls;
- add LLM grounding;
- add broad NLP;
- redesign ExplanatoryRelation;
- add relation kinds;
- change semantic relation IDs;
- change evidence fingerprints;
- weaken relation validators;
- build maps;
- build diagrams;
- change production rendering;
- alter approval gates;
- globally redesign entity resolution;
- alter narration;
- alter localization;
- alter TTS;
- alter FFmpeg.

---

# Validation sequence

Follow repository risk-based validation.

Run:

1. existing V3.6 relation/schema tests;
2. 45 golden fixtures;
3. atomic-grounding schema tests;
4. grounding unit tests;
5. grounding invariant/property tests;
6. representative grounding tests;
7. relation integration tests;
8. Phase 2.2 Franklin/Titanic/Spanish regressions;
9. mocked bounded-LLM integration tests;
10. affected package typecheck;
11. targeted lint;
12. same-eight grounding run;
13. same-eight deterministic relation rerun;
14. mocked LLM rerun;
15. artifact schema/checksum validation.

Do not run unrelated repository-wide suites.

---

# V3.5 freeze

No V3.5 review bundle regeneration unless shared V3.5 runtime code changes unexpectedly.

Prefer V3.6-only implementation.

If V3.5/shared code must change:

stop and explain why before broadening scope.

---

# Completion checkpoint

Only after acceptance criteria pass:

Create commit:

```text
feat(history): add v3.6 atomic claim grounding shadow ir
```

Record full SHA.

Create immutable annotated tag:

```text
history-v3.6-atomic-grounding-baseline
```

If occupied, create a versioned equivalent.

Do not overwrite existing tags.

Generate the timestamped review artifact from this exact commit.

Do not push unless repository policy explicitly permits it.

---

# Required completion report

Return:

1. Starting SHA/tag.
2. Phase 2.2 baseline SHA/tag.
3. Contract baseline SHA/tag.
4. Frozen V3.5 SHA/tag.
5. Atomic grounding schema module path.
6. Runtime schema path.
7. Generated JSON Schema path.
8. Grounding contract-document path.
9. Predicate vocabulary.
10. Assertion-status vocabulary.
11. Grounding rule IDs.
12. Deterministic grounding ID algorithm.
13. Provenance model.
14. Diagnostics added.
15. Tests added.
16. Golden fixture result.
17. Grounding invariant result.
18. Per-episode grounding metrics.
19. Coverage categories/counts.
20. Black Death before/after grounding result.
21. Spanish Armada actual-vs-intended movement result.
22. 1066 grounding result.
23. Franklin purpose/destination grounding result.
24. Titanic regression result.
25. Relation-rerun per-episode old/new valid counts.
26. Newly validated relations enabled by grounding.
27. New downstream rejects enabled by grounding.
28. Mock LLM rerun result.
29. Unsupported validated relation count.
30. Purpose-as-destination error count.
31. Duplicate/cross-episode/directionality/cardinality/proper-name counts.
32. Manual-review set size.
33. Typecheck/lint result.
34. Confirmation no live LLM calls.
35. Confirmation V3.5 untouched.
36. Final commit SHA.
37. Immutable tag.
38. Review artifact path.
39. Artifact SHA-256/checksum result.
40. Recommended next task only — do not execute it.

---

# Acceptance criteria

Complete only when all are true:

## Grounding architecture

- [ ] Typed V3.6-only atomic grounding IR exists.
- [ ] Runtime schema is authoritative.
- [ ] Machine JSON Schema is generated/mechanically tied to runtime schema.
- [ ] Grounding IDs are deterministic.
- [ ] Exact claim/span provenance is retained.
- [ ] Predicate vocabulary is bounded and typed.
- [ ] Assertion/modality status is modeled where necessary.
- [ ] Grounding does not create `ExplanatoryRelation` directly.

## Semantic safety

- [ ] Proper names remain atomic.
- [ ] Purpose is not treated as movement destination.
- [ ] Intent/mission is distinguishable from completed movement.
- [ ] Grouped concepts are not blindly split.
- [ ] Evidence items do not flatten nested named entities incorrectly.
- [ ] Clause boundaries remain correct.
- [ ] No cross-claim synthetic proposition is invented.
- [ ] Unresolved participants fail closed.

## Representative evidence

- [ ] Same 8 episodes only.
- [ ] Black Death grounding gap is explicitly evaluated.
- [ ] Spanish Armada actual-vs-intended movement is evaluated.
- [ ] 1066 remains free of invented causal/movement origins.
- [ ] Franklin search-object vs destination distinction remains correct.
- [ ] Titanic ice/Californian regression remains fixed.
- [ ] Bronze Age/Chernobyl remain stability controls.

## Relation integration

- [ ] Existing deterministic proposer remains frozen.
- [ ] Existing relation validator remains unchanged.
- [ ] Relation extraction consumes grounding evidence without bypassing validator.
- [ ] Unsupported validated relations = 0.
- [ ] Duplicate semantic IDs = 0.
- [ ] Cross-episode violations = 0.
- [ ] Directionality violations = 0.
- [ ] Cardinality violations = 0.
- [ ] Proper-name fragmentation = 0.
- [ ] Purpose-as-destination errors = 0.

## LLM boundary

- [ ] Live LLM remains disabled/not run.
- [ ] Existing bounded proposer code remains opt-in.
- [ ] Mock integration remains green.
- [ ] No LLM semantic authority is introduced.

## Scope

- [ ] No V3.5 changes.
- [ ] No 40-episode rollout.
- [ ] No maps.
- [ ] No diagrams.
- [ ] No relation-taxonomy expansion.
- [ ] No validator weakening.
- [ ] No external research.
- [ ] No global entity-resolution redesign.

## Artifact

- [ ] Successful state committed.
- [ ] Immutable atomic-grounding tag created.
- [ ] Timestamped grounding review artifact generated.
- [ ] Provenance is explicit.
- [ ] Checksums and ZIP integrity pass.

Stop after this task.

Do not automatically run a live LLM experiment.

The next decision must be based on review of the atomic-grounding artifact.
