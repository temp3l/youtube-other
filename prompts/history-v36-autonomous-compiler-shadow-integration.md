# History V3.6 — Autonomous Compiler Shadow Integration

## Mission

Integrate the accepted History V3.6 semantic IR into **shadow-only map and diagram compilation**.

The compiler layer must be deliberately "dumb":

```text
validated ExplanatoryRelationV36
        ↓
strict relation-kind dispatch
        ↓
typed map/diagram compilation intent
        ↓
existing V3.5-compatible rendering boundary in SHADOW ONLY
```

The compiler must NOT infer semantics from narration, claims, nearby text, verbs, entity names, or visual context.

This run may complete multiple bounded internal phases autonomously.

Do not stop after each successful phase to request another prompt.

Stop only at a HUMAN DECISION GATE, production-activation boundary, or the run cap.

---

# Starting baseline

Latest accepted all-40 semantic release-readiness baseline:

```text
COMMIT:
9a25cb94f35e557a2da43545d697a9a18638b2fb

TAG:
history-v3.6-all40-semantic-release-readiness-baseline
```

Previous accepted semantic close:

```text
72b4ee8010f22f6ea3c663edc8c3e90dbeb7aa67
history-v3.6-autonomous-event-location-drain-baseline
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

Resolve all full peeled SHAs before implementation.

Never move accepted tags.

---

# Critical census qualification

The all-40 census passed, but it used the frozen historical compatibility-backed corpus:

```text
40/40 episodes
3,774 claims
0 historical native sidecars
111 compatibility propositions
111 atomic propositions
236 candidates
103 validated relations
0 proofs
```

The census artifact explicitly records:

```text
nativeAll40Available = false
episodesWithOnlyCompatibilitySemantics = 40
relationsSupportedByNativeSemantics = 0
relationsSupportedOnlyByCompatibilitySemantics = 103
policyResponseProofPathStable = false
```

Therefore this compiler integration MUST use TWO distinct validation lanes.

---

# Validation lane A — full-feature representative lane

Use the latest accepted same-eight V3.6 semantic state to exercise semantic features that the frozen all-40 compatibility corpus does not contain.

The representative lane must cover, where already accepted:

```text
native StructuredClaimV36
process
temporal-sequence
policy-response
proof-aware multi-claim evidence
event-location
causal modality
evidence-set aggregation
movement
spatial-comparison
dependency
```

Use repository-authoritative latest same-eight fixtures/artifacts.

Do not regenerate semantics with a provider.

This lane proves FEATURE COVERAGE.

---

# Validation lane B — all-40 compatibility lane

Use the exact frozen all-40 corpus from the accepted census.

This lane proves:

```text
scale
determinism
legacy/compatibility safety
no overgeneration
stable relation dispatch
V3.5 isolation
```

It does NOT prove native/proof feature coverage.

Do not claim otherwise.

---

# Architectural principle

V3.6 semantics are upstream authority.

The compiler layer must behave conceptually like:

```ts
switch (relation.kind) {
  case ...:
    return compileKnownTypedSemantics(relation)
}
```

It must NOT:

```text
read narration to infer what relation means
search adjacent claims
guess locations
guess route endpoints
infer causality
infer chronology
infer comparison
infer policy response
promote modality
repair incomplete relations
```

If a validated relation cannot be represented safely by the current visual intent/output contract:

```text
NO_SAFE_COMPILATION
```

is preferable to inference.

---

# Autonomous run cap

Complete at most:

```text
6 new phases
```

in this run.

Expected broad sequence:

```text
compiler boundary audit
typed shadow intent contract
map compiler integration
diagram compiler integration
same-eight full-feature validation
all-40 compatibility shadow census / consolidated close
```

Use sequential phase numbers from the current repository state.

Do not skip numbers.

---

# Phase 0 — preflight

Run:

```bash
git status --short
git branch --show-current
git rev-parse HEAD
git log --oneline --decorate -35

git rev-parse history-v3.6-all40-semantic-release-readiness-baseline
git rev-parse 'history-v3.6-all40-semantic-release-readiness-baseline^{}'

git rev-parse history-v3.6-autonomous-event-location-drain-baseline
git rev-parse 'history-v3.6-autonomous-event-location-drain-baseline^{}'

git rev-parse history-v3.5-frozen-before-v36
git rev-parse 'history-v3.5-frozen-before-v36^{}'
```

Run focused preflight:

```text
History package typecheck
targeted ESLint
current V3.6 semantic tests
46 golden semantic fixtures
same-eight semantic regression
all-40 census integrity smoke check
```

Proceed only if green.

Create immutable checkpoint:

```text
history-v3.6-pre-compiler-shadow-integration
```

Use a versioned equivalent if occupied.

No destructive Git operations.

---

# Phase 1 — audit existing compiler/rendering boundaries

Before adding code, locate existing:

```text
map compiler / map visual planner
diagram compiler / diagram visual planner
visual intent types
rendering input contracts
map asset contracts
diagram asset contracts
V3.5 semantic heuristics
V3.6 hooks or placeholders
```

Produce a compact architecture audit:

```text
docs/history/v3.6/compiler-shadow-boundary-audit.md
```

Record:

```text
current compiler entrypoints
current inputs
current outputs
where semantic inference currently happens
which V3.5 paths must remain untouched
where a V3.6 shadow adapter can attach safely
```

Do not refactor production code during the audit.

---

# Compiler target contract

Prefer an additive V3.6 shadow contract.

Use existing repository naming conventions.

Conceptually this may be:

```text
MapIntentV36
DiagramIntentV36
```

or equivalent.

Do not create unnecessary abstractions if suitable typed visual-plan contracts already exist.

The contract must preserve:

```text
relationId
relationKind
episodeId
participants
direction/order where semantic
assertion/modality where semantic
evidence/provenance reference
compiler rule/version
```

Do not copy full narration into compiler intents.

---

# Required compiler disposition

Every validated relation must deterministically receive exactly one disposition:

```text
MAP
DIAGRAM
NO_SAFE_COMPILATION
```

unless the existing architecture explicitly supports another typed visual target.

No silent drops.

No relation may compile to both map and diagram unless repository evidence and existing visual semantics explicitly justify dual output.

Default to one target.

---

# Relation-kind dispatch audit

For every accepted relation kind, inspect exact schema and existing rendering capability:

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

Do not assume the final mapping from this prompt.

Determine it from:

```text
relation semantics
current visual contract capabilities
accepted V3.5 map/diagram behavior
```

However, expected semantic families are:

```text
movement            -> likely MAP
spatial-comparison  -> likely MAP
spatial-area        -> likely MAP
event-location      -> likely MAP

causal              -> likely DIAGRAM
dependency          -> likely DIAGRAM
process             -> likely DIAGRAM
temporal-sequence   -> likely DIAGRAM
policy-response     -> likely DIAGRAM
evidence-set        -> DIAGRAM only if the current diagram contract can represent an evidence set losslessly; otherwise NO_SAFE_COMPILATION
```

If repository evidence contradicts these expectations, use evidence.

If two materially different safe mappings remain plausible:

HUMAN DECISION GATE.

---

# Map compiler hard rules

Map compilation may consume only accepted typed relation semantics plus already-authoritative resolved geographic metadata.

It must NOT infer geography from raw strings.

## movement

Only compile when the validated relation already contains all required route semantics.

Preserve:

```text
origin
destination
via/order if present
actor if relation schema carries it
assertion/modality if present
```

Never:

```text
purpose -> destination
objective -> destination
intended route -> completed route
missing destination -> guessed destination
```

The accepted Franklin and Armada terminal cases remain terminal.

---

## spatial-comparison

Compile as comparison, not route.

No origin/destination inference.

Preserve both compared places and comparison direction/semantics according to the accepted relation contract.

---

## spatial-area

Compile only from the accepted area semantics.

Do not turn a generic location into a spatial area.

---

## event-location

Compile:

```text
event -> location
```

as an event-location visual intent.

For the accepted D-Day relation:

```text
assertionStatus = intended
```

must remain intended.

Do NOT render it semantically as:

```text
movement to Calais
completed invasion at Calais
```

The map visual contract may represent modality metadata/styles only if it can do so without changing meaning.

---

# Diagram compiler hard rules

## causal

Preserve exact:

```text
cause -> effect
```

and accepted modality.

No chronology-to-causality inference.

No strengthening of uncertain/intended/attempted semantics.

---

## dependency

Preserve exact dependency direction.

Do not render as causal unless the relation kind is causal.

---

## process

Preserve ordered steps exactly.

Do not convert process ordering into causality.

Grouping labels remain non-authoritative visual metadata only.

---

## temporal-sequence

Preserve:

```text
before -> after
```

or exact accepted order semantics.

Do not add causal arrows.

---

## policy-response

Preserve:

```text
condition -> response
conditionAssertionStatus
responseAssertionStatus
```

For the accepted Black Death proof-backed relation:

```text
condition = uncertain
response = attempted
```

must remain exact.

The compiler may not flatten to asserted/asserted.

Preserve proof-aware support/provenance references.

---

## evidence-set

Evidence members are an unordered semantic set unless the accepted contract states otherwise.

Use deterministic canonical member ordering only for serialization/layout stability.

Do not imply chronology, causality, or priority from that ordering.

If current diagram visual semantics cannot display evidence membership without implying false edges:

return:

```text
NO_SAFE_COMPILATION
```

and report it.

Do not invent a new diagram taxonomy silently.

---

# Provenance

Every compiler output must retain enough provenance to trace:

```text
visual intent
→ relation semantic ID
→ evidence fingerprint
→ supporting atomic/proof lineage
```

Do not require compilers to reread claims to reconstruct provenance.

Use relation/proof provenance already accepted upstream.

---

# Compiler identity

Define deterministic compiler-output identity separately from semantic relation identity.

Conceptually:

```text
compilerIntentId =
hash(
  compiler contract version
  target type
  semantic relation ID
  visual-semantic fields that legitimately affect compiled intent
)
```

Do not alter the semantic relation ID.

Layout-only decisions must not contaminate semantic identity.

---

# No camera/image prompt work

This run ends at typed map/diagram shadow compilation.

Do NOT implement:

```text
camera settings
image generation prompts
image provider calls
map rendering
diagram rendering
ffmpeg composition
production visual placement
```

Those are downstream.

---

# Shadow-only integration

Hard requirement:

```text
V3.6 compiler mode = SHADOW ONLY
```

Do not switch production visual planning to V3.6.

Do not change current V3.5 rendering output.

Do not use V3.6 compiler output to alter production approvals.

Store shadow outputs separately.

---

# Same-eight full-feature validation

Generate a compact compiler review set for the accepted same-eight episodes.

Require examples covering every relation kind available in the current representative semantic state.

For each compiled relation report:

```text
relationId
kind
assertion/modality
target disposition
compilerIntentId
compiler rule/version
support/provenance
```

For each `NO_SAFE_COMPILATION` record exact reason.

Manually inspect at least one accepted example of each available relation kind.

---

# All-40 compatibility compiler census

Run the compiler over the exact 103 validated relations from the accepted all-40 census.

Measure:

```text
total relations
MAP dispositions
DIAGRAM dispositions
NO_SAFE_COMPILATION dispositions

counts by relation kind
counts by compiler rule
compiler rejects/diagnostics
```

Repeat twice.

Require deterministic equality.

Important:

```text
all-40 compatibility lane contains 0 native proof relations
```

Do not use absence of policy-response/event-location/process/temporal in this lane as a compiler defect.

Feature coverage comes from lane A.

---

# Semantic/compiler invariants

All applicable must remain zero:

```text
compiler reads narration for semantics
compiler reads adjacent claims for semantics

purpose-as-destination
objective-as-destination
intent-as-completed-movement

event-location-as-movement
spatial-comparison-as-movement

chronology-as-causality
process-as-causality
dependency-as-causality

policy-response modality loss
causal modality loss
event-location modality loss
modality strengthening

direction reversal
process order corruption
temporal order corruption

evidence-set ordering treated as chronology
evidence member loss
proof support loss

unresolved participant compilation
unresolved geographic compilation
cross-episode compiler support

semantic relation ID mutation
evidence fingerprint mutation

non-deterministic compilerIntentId

V3.5 production output change
```

Any non-zero semantic invariant:

```text
COMPILER_SHADOW_READINESS = BLOCKED
```

Do not remediate by weakening semantics.

---

# Determinism

Run both validation lanes twice.

Require stable:

```text
relation disposition
compilerIntentId
serialized semantic intent
diagnostic codes
aggregate counts
```

Layout/render randomness is not in scope because this run stops before rendering.

---

# Differential review

Where current V3.5 map/diagram plans exist, compare only at a safe aggregate/semantic level.

Examples:

```text
V3.5 emitted map for relation that V3.6 compiles as MAP
V3.5 emitted diagram for relation that V3.6 compiles as DIAGRAM
V3.6 correctly emits NO_SAFE_COMPILATION where V3.5 heuristics guessed
```

Do not require V3.6 to reproduce V3.5 heuristic outputs.

Do not treat fewer visuals as failure if V3.6 is semantically safer.

---

# Quality metrics

Report:

```text
compiler coverage rate =
(MAP + DIAGRAM) / validated relations

safe-abstention rate =
NO_SAFE_COMPILATION / validated relations

coverage by relation kind

feature-lane coverage
all-40 compatibility coverage
```

Do not optimize for 100% coverage.

Semantic correctness > visual count.

---

# Human decision gates

STOP if any occurs.

## Gate A — ambiguous relation-to-visual mapping

Two materially different safe compiler dispositions exist and repository evidence cannot choose.

## Gate B — visual contract cannot preserve semantics

Example:

```text
policy-response asymmetric modality cannot be represented
evidence-set diagram necessarily implies false ordering
```

Do not flatten.

## Gate C — compiler requires semantic inference

If existing visual contracts require narration/claim inference to complete a map/diagram:

stop.

Do not reintroduce V3.5 heuristics.

## Gate D — semantic contract change required

Any change to accepted V3.6 relation/proof semantics requires a separate architecture decision.

## Gate E — production activation

Stop before enabling V3.6 compiler output in production.

## Gate F — new renderer/visual taxonomy

If safe compilation requires a materially new renderer or visual semantic taxonomy, stop and propose it.

## Gate G — repeated implementation failure

Same compiler semantic defect fails twice.

---

# Autonomous per-phase workflow

For each completed internal phase:

1. record exact target;
2. implement smallest bounded change;
3. run focused tests;
4. verify semantic invariants;
5. self-review;
6. commit;
7. create immutable tag;
8. generate compact phase artifact;
9. continue automatically if no human gate.

Do not stop simply because a phase passed.

---

# Git safety

Never:

```text
force tag
rewrite accepted commits
reset --hard across unrelated changes
clean user files
modify frozen V3.5 production semantics
```

Detect overlapping concurrent edits before writing canonical compiler contracts.

---

# Validation policy

Use focused risk-based validation.

Run as applicable:

```text
History typecheck
targeted ESLint
compiler contract tests
map compiler tests
diagram compiler tests
46 golden semantic fixtures
same-eight semantic regression
same-eight compiler lane x2
all-40 compatibility compiler lane x2
determinism comparison
V3.5 isolation checks
artifact checksum / ZIP integrity
```

Do not run unrelated repository-wide suites.

---

# Provider policy

Hard:

```text
provider calls = 0
LLM semantic calls = 0
image provider calls = 0
```

No web/live research.

---

# Parallelism

Use one primary writer.

Read-only/disjoint subagents may inspect:

```text
existing map compiler boundary
existing diagram compiler boundary
relation-kind mapping
same-eight fixture coverage
all-40 compiler census
V3.5 isolation
```

Do not allow concurrent edits to canonical compiler contracts.

---

# Token discipline

Prefer:

```text
exact rg/find
small targeted reads
machine-readable relation fixtures
existing semantic artifacts
compact test outputs
```

Avoid:

```text
full narration dumps
large approval packs
repeated semantic architecture prose
full repo rereads
```

---

# Suggested phase structure

Use repository evidence to name exact phases, but expected sequence is approximately:

```text
Phase 2.24 — compiler boundary audit + typed shadow intent contract
Phase 2.25 — strict map compiler
Phase 2.26 — strict diagram compiler
Phase 2.27 — same-eight full-feature compiler validation
Phase 2.28 — all-40 compatibility compiler census
Phase 2.29 — consolidated compiler-shadow readiness close
```

Do not force this numbering if current repository phase numbering differs.

Do not exceed six phases.

---

# Journal

Maintain:

```text
docs/reports/codex-runs/
2026-08-09-history-v36-autonomous-compiler-shadow-integration.md
```

Per phase record only:

```text
phase
starting SHA
target
change
tests
invariants
commit
tag
artifact
next
```

Keep concise.

---

# Per-phase artifact

Generate compact artifacts under:

```text
artifacts/shadow/history-v3.6/
```

Do not generate huge review packs.

---

# Consolidated final artifact

Generate:

```text
history-v3.6-compiler-shadow-readiness-<timestamp>.zip
```

Include at least:

```text
README.md
architecture-summary.md

compiler-contract.json
relation-disposition-matrix.json

same-eight-feature-coverage.json
same-eight-compiler-review.json

all40-compatibility-compiler-census.json

map-compiler-summary.json
diagram-compiler-summary.json
safe-abstention-summary.json

determinism-summary.json
v35-isolation-summary.json
invariant-summary.json
test-summary.json

human-decision-gate.json if applicable

provenance.json
checksums.sha256
```

Do not embed previous ZIPs.

---

# Readiness verdict

Return exactly one:

```text
READY_FOR_RENDERER_SHADOW_INTEGRATION

READY_WITH_SAFE_COMPILER_ABSTENTIONS

BLOCKED_BY_COMPILER_SEMANTIC_GAP

BLOCKED_BY_VISUAL_CONTRACT_LIMITATION

BLOCKED_BY_DETERMINISM

BLOCKED_BY_V35_ISOLATION

STOPPED_AT_HUMAN_GATE
```

`READY_WITH_SAFE_COMPILER_ABSTENTIONS` is acceptable.

Do not optimize away safe abstentions.

---

# Production activation prohibition

Even if all compiler tests pass:

DO NOT:

```text
make V3.6 production default
replace V3.5 plans
change production episode outputs
trigger regeneration
trigger maps/images/diagrams
```

The next human-approved stage will decide renderer shadow integration.

---

# Required final response

Return one compact consolidated report:

```text
AUTONOMOUS COMPILER SHADOW RUN:
PASS / STOPPED_AT_GATE / BLOCKED

phases completed:
- phase — purpose — commit — tag — result

validation lane A:
same-eight full-feature
relations:
compiled MAP:
compiled DIAGRAM:
safe abstentions:
feature kinds exercised:

validation lane B:
all-40 compatibility
relations: 103 or actual
compiled MAP:
compiled DIAGRAM:
safe abstentions:
determinism:

relation disposition:
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

hard semantic invariants:
all zero / exact failures

V3.5:
unchanged

provider/LLM/image calls:
0

compiler-shadow readiness:
...

final HEAD:
...

final tag:
...

artifact:
...

artifact SHA-256:
...

human decision required:
yes/no

next recommendation:
exactly one task
```

Do not execute the next task.

---

# Acceptance criteria

## Architecture

- [ ] Existing compiler/rendering boundary audited.
- [ ] V3.6 compiler path is additive and shadow-only.
- [ ] Compiler consumes validated typed relations.
- [ ] Compiler does not infer semantics from narration/claims.
- [ ] Every validated relation receives deterministic disposition.
- [ ] Safe abstention is explicit.

## Map semantics

- [ ] Movement uses only explicit validated route semantics.
- [ ] No purpose/objective -> destination.
- [ ] Spatial comparison stays comparison.
- [ ] Spatial area stays area.
- [ ] Event-location stays event-location.
- [ ] Event-location modality preserved.
- [ ] No unresolved geography compiled.

## Diagram semantics

- [ ] Causal direction preserved.
- [ ] Causal modality preserved.
- [ ] Dependency remains dependency.
- [ ] Process order preserved without causal implication.
- [ ] Temporal order preserved without causal implication.
- [ ] Policy-response asymmetric modality preserved.
- [ ] Proof lineage retained.
- [ ] Evidence-set does not gain false ordering.

## Identity/provenance

- [ ] Semantic relation IDs unchanged.
- [ ] Evidence fingerprints unchanged.
- [ ] Compiler intent IDs deterministic.
- [ ] Visual output traces to relation/proof evidence.

## Dual-lane coverage

- [ ] Same-eight lane exercises native/proof/modality features available in accepted fixtures.
- [ ] All-40 compatibility lane runs exact accepted census relations.
- [ ] Native all-40 absence is reported honestly.
- [ ] All-40 lane is not falsely presented as proof/native coverage.

## Safety

- [ ] Semantic inference in compiler = 0.
- [ ] Purpose-as-destination = 0.
- [ ] Intent-as-completed-movement = 0.
- [ ] Event-location-as-movement = 0.
- [ ] Chronology-as-causality = 0.
- [ ] Process-as-causality = 0.
- [ ] Dependency-as-causality = 0.
- [ ] Modality loss = 0.
- [ ] Modality strengthening = 0.
- [ ] Direction/order corruption = 0.
- [ ] Evidence-set false chronology = 0.
- [ ] Proof support loss = 0.
- [ ] Semantic-ID mutation = 0.
- [ ] Evidence-fingerprint mutation = 0.
- [ ] V3.5 production output change = 0.

## Completion

- [ ] Focused tests pass.
- [ ] 46 semantic goldens pass.
- [ ] Same-eight compiler lane deterministic.
- [ ] All-40 compiler lane deterministic.
- [ ] V3.5 isolation passes.
- [ ] Successful internal phases committed/tagged.
- [ ] Consolidated artifact generated.
- [ ] Checksums pass.
- [ ] ZIP integrity passes.
- [ ] Exactly one next task recommended.
- [ ] No production activation performed.

Begin from:

```text
history-v3.6-all40-semantic-release-readiness-baseline
```

and execute the V3.6 compiler shadow integration autonomously.
