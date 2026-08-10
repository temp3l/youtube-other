# History V3.6 — Autonomous Renderer Shadow Adapter Integration

## Mission

Integrate the accepted V3.6 compiler-shadow intents into the existing map/diagram renderer boundary in **SHADOW ONLY**.

The renderer layer must remain semantically dumb:

```text
validated ExplanatoryRelationV36
        ↓
accepted V3.6 compiler shadow intent
        ↓
typed renderer adapter / render spec
        ↓
existing deterministic map/diagram renderer
        ↓
shadow preview / review artifact
```

The renderer adapter may make **presentation/layout decisions**.

It must NOT make **semantic decisions**.

Do not activate V3.6 in production.

Do not change V3.5 production outputs.

Do not regenerate episode images or videos.

Do not call image providers, LLMs, or live research.

---

# Starting baseline

Accepted compiler-shadow readiness baseline:

```text
COMMIT:
2d08bc8713833be65492c1f863840a4e9501becf

TAG:
history-v3.6-compiler-shadow-readiness-baseline
```

Accepted all-40 semantic readiness:

```text
COMMIT:
9a25cb94f35e557a2da43545d697a9a18638b2fb

TAG:
history-v3.6-all40-semantic-release-readiness-baseline
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

Resolve full peeled SHAs before implementation.

Never overwrite accepted tags.

---

# Accepted compiler contract

Current accepted compiler-shadow contract:

```text
schemaVersion:
history-compiler-shadow-intent.v1

compilerVersion:
history-compiler-shadow.v3.6.0

mode:
SHADOW_ONLY
```

Required compiler dispositions:

```text
MAP
DIAGRAM
NO_SAFE_COMPILATION
```

Accepted relation mapping:

```text
movement            -> MAP
spatial-comparison  -> MAP
spatial-area        -> MAP
event-location      -> MAP

causal              -> DIAGRAM
dependency          -> DIAGRAM
process             -> DIAGRAM
temporal-sequence   -> DIAGRAM
policy-response     -> DIAGRAM
evidence-set        -> DIAGRAM
```

Do not reopen this mapping unless actual renderer limitations create a HUMAN DECISION GATE.

---

# Accepted compiler validation state

Feature lane:

```text
same-eight relations: 34
MAP:                   3
DIAGRAM:               31
safe abstentions:      0
```

All-40 compatibility lane:

```text
relations:             103
MAP:                   2
DIAGRAM:               101
safe abstentions:      0
determinism:           PASS
```

Important qualification:

```text
all-40 native sidecars: 0
all-40 proof relations: 0
```

Therefore retain two validation lanes.

---

# Validation lane A — same-eight full-feature renderer lane

Use the latest accepted same-eight V3.6 compiler intents.

This lane must exercise all currently available feature kinds:

```text
movement
spatial-comparison
causal
dependency
process
temporal-sequence
policy-response
evidence-set
event-location
```

`spatial-area` may remain unexercised if no accepted relation exists.

This lane proves:

```text
semantic-to-visual lowering
modality preservation
proof-aware policy-response rendering
edge-free evidence-set rendering
event-location rendering
process/temporal distinction
```

---

# Validation lane B — all-40 compatibility render-spec census

Use the exact accepted all-40 compiler intents.

Do NOT render 103 heavy visual assets unless the existing deterministic renderer makes that cheap and bounded.

The required all-40 operation is:

```text
compiler intent
→ renderer adapter
→ deterministic render spec
```

This lane proves:

```text
scale
adapter coverage
determinism
no semantic fallback
no V3.5 changes
```

Actual pixel rendering for all 40 is optional and should NOT be done if expensive.

---

# Autonomous run cap

Complete at most:

```text
6 new phases
```

Expected sequence:

```text
renderer boundary audit + adapter contract
map render adapter
diagram render adapter
same-eight shadow preview rendering
all-40 render-spec census
readiness close
```

Do not stop after each successful phase.

Stop only at a HUMAN DECISION GATE or the run cap.

---

# Phase 0 — mandatory preflight

Run:

```bash
git status --short
git branch --show-current
git rev-parse HEAD
git log --oneline --decorate -35

git rev-parse history-v3.6-compiler-shadow-readiness-baseline
git rev-parse 'history-v3.6-compiler-shadow-readiness-baseline^{}'

git rev-parse history-v3.6-all40-semantic-release-readiness-baseline
git rev-parse 'history-v3.6-all40-semantic-release-readiness-baseline^{}'

git rev-parse history-v3.5-frozen-before-v36
git rev-parse 'history-v3.5-frozen-before-v36^{}'
```

Run focused preflight:

```text
History typecheck
targeted ESLint
208 compiler/semantic tests or current equivalent
46 goldens
same-eight compiler lane
all-40 compiler census smoke
```

Proceed only if green.

Create immutable checkpoint:

```text
history-v3.6-pre-renderer-shadow-integration
```

Use a versioned suffix if occupied.

No destructive Git operations.

---

# Phase 1 — audit existing renderer boundaries

Locate exact current:

```text
map renderer entrypoint
diagram renderer entrypoint

renderer input contracts
renderer output contracts

layout engines
label/text placement
map projection/path rendering
diagram node/edge rendering

V3.5 adapters
V3.5 semantic inference helpers
FFmpeg integration boundaries
preview/review artifact generators
```

Create:

```text
docs/history/v3.6/renderer-shadow-boundary-audit.md
```

Record:

```text
which existing renderer pieces are presentation-only and reusable

which paths perform semantic inference and MUST NOT be used by V3.6

safe insertion point for V3.6 typed render specs

whether renderer output is SVG/PNG/JSON/etc.

whether rendering is deterministic
```

Do not refactor production renderers during the audit.

---

# Core renderer principle

The V3.6 adapter may decide:

```text
coordinates
layout
node positions
label placement
line curvature
arrow routing
font sizing
map viewport
zoom/padding
legend layout
visual styling
```

The V3.6 adapter must NOT decide:

```text
what relation kind means
whether A causes B
whether a place is origin/destination
whether an event occurred at a place
whether policy response was attempted/asserted
whether evidence members are ordered
whether temporal sequence is causal
```

Those semantics are already frozen in the compiler intent.

---

# Typed render-spec contract

Prefer a small additive contract, using repository conventions.

Conceptually:

```text
MapRenderSpecV36
DiagramRenderSpecV36
```

or equivalent.

Every render spec must preserve:

```text
compilerIntentId
relationId
relationKind
episodeId
renderTarget
semantic payload
assertion/modality
provenance
renderer rule/version
shadowOnly = true
```

Do not include raw narration as semantic input.

If labels require human-readable text, use labels already present in the typed compiler intent or canonical resolved participant display fields.

Do not reread narration to generate labels.

---

# Render-spec identity

Create deterministic render-spec identity separately from:

```text
semantic relation ID
compiler intent ID
```

Conceptually:

```text
renderSpecId =
hash(
  render-spec contract version
  compilerIntentId
  deterministic semantic-preserving lowering payload
)
```

Exclude:

```text
timestamps
temporary file paths
random layout seeds
machine-specific paths
```

If layout is deterministic and identity-bearing in repository conventions, document it explicitly.

---

# MAP renderer adapter

The map adapter may consume only:

```text
accepted MAP compiler intent
resolved canonical geography already present upstream
presentation configuration
```

No raw geography inference.

---

## movement rendering

Render only the explicit accepted route.

Preserve:

```text
origin
via order
destination
actor if provided
assertion/modality if provided
```

Do not:

```text
add route endpoints
complete partial routes
replace objective with destination
show intended route as completed movement
```

If the existing map renderer assumes every route is completed:

HUMAN DECISION GATE.

Do not flatten modality.

---

## spatial-comparison rendering

Render compared places as a comparison.

Never connect them as movement route.

If a line is used visually, it must be a non-route comparison connector or equivalent presentation.

No direction unless accepted semantics specify it.

---

## spatial-area rendering

If no accepted fixture exists, implement contract support and tests without inventing a positive historical case.

Do not synthesize production semantics.

---

## event-location rendering

Preserve:

```text
event -> location
assertionStatus
```

The accepted D-Day case:

```text
event = main invasion
location = Calais
assertionStatus = intended
```

must NOT visually imply:

```text
completed invasion at Calais
movement destination Calais
```

If the renderer needs distinct styling for `intended`, use deterministic presentation metadata such as:

```text
planned/intended marker style
legend/status annotation
non-completed route-free event marker
```

Use existing visual vocabulary where available.

Do not invent misleading semantics.

---

# Map viewport/layout

Viewport may be derived from already-resolved geographic participants.

Allowed:

```text
fit bounds to known coordinates
add deterministic padding
stable zoom limits
```

Forbidden:

```text
geocode raw narration
search web
infer missing places
add nearby contextual places as semantic participants
```

Context-only basemap geography may remain renderer background if existing renderer supports it, but it must not become semantic relation content.

---

# DIAGRAM renderer adapter

The diagram adapter receives typed semantic structures.

Node/edge semantics must be fixed before layout.

Layout may not create new semantic edges.

---

## causal

Render:

```text
cause -> effect
```

Preserve assertion/modality exactly.

For `reported`, `uncertain`, `attempted`, etc., presentation may use labels/styles, but never normalize to asserted.

---

## dependency

Render dependency semantics distinctly from causality.

Do not reuse a causal label/legend if it would misstate meaning.

---

## process

Render ordered process steps.

Ordering is semantic.

Do not add causal arrows/labels.

If arrows are used purely to indicate sequence, the legend/type must make that distinction explicit.

---

## temporal-sequence

Render chronology:

```text
before -> after
```

or current accepted ordering shape.

Do not label as cause/effect.

---

## policy-response

Preserve:

```text
condition -> response
conditionAssertionStatus
responseAssertionStatus
proof-aware support
```

For the accepted Black Death case:

```text
condition = uncertain
response = attempted
```

must remain visibly distinguishable or at minimum machine-preserved in the render spec.

Do not flatten either status.

---

## evidence-set

Hard requirement:

```text
NO SEMANTIC EDGES BETWEEN EVIDENCE MEMBERS
```

Render as:

```text
target / evidence group
unordered evidence members
```

Layout ordering may be deterministic for presentation only.

Never draw member-to-member arrows.

Never imply:

```text
chronology
causality
priority
```

If the current renderer cannot represent an edge-free evidence set safely:

HUMAN DECISION GATE.

---

# Renderer diagnostics

Every compiler intent must produce exactly one:

```text
RENDER_SPEC
NO_SAFE_RENDERING
```

No silent drop.

`NO_SAFE_RENDERING` is acceptable.

Do not fall back to V3.5 heuristics.

Required diagnostic classes should include repository-equivalent forms for:

```text
UNSUPPORTED_RENDERER_CONTRACT
SEMANTIC_MODALITY_NOT_REPRESENTABLE
UNRESOLVED_GEOGRAPHY
INVALID_RENDER_SPEC
RENDERER_REQUIRES_SEMANTIC_INFERENCE
PROOF_SUPPORT_NOT_REPRESENTABLE
```

Keep diagnostics typed and deterministic.

---

# Same-eight actual shadow previews

For Lane A, produce actual local renderer previews when the current renderer supports deterministic local output without external services.

Prefer:

```text
SVG
PNG
or existing review-preview format
```

Do NOT call paid/external image generation.

Generate at least one representative preview for each available relation kind.

If multiple relations of the same kind are identical from renderer-contract perspective, one manual-review sample is sufficient, but all 34 relations must still generate render specs.

---

# Preview semantics review

For each available relation kind, manually inspect at least one preview for:

```text
correct target type
correct participants
correct direction/order
correct modality/status
no invented nodes/places
no semantic edge invention
legible labels
no obvious overlap/cropping severe enough to change meaning
```

This is a shadow review.

Visual polish is secondary to semantic correctness.

---

# Layout quality floor

Renderer shadow output should meet a basic quality floor:

```text
labels readable
no severe text clipping
no node overlap that hides identity
no off-canvas semantic participants
no zero-length/degenerate route
no arrow endpoint ambiguity
```

These may BLOCK renderer readiness if they make semantics unreadable.

Do not start a broad UI redesign.

---

# Deterministic layout

Where the renderer has randomness:

```text
set a deterministic seed derived from renderSpecId
```

or use an existing deterministic layout mode.

Run Lane A rendering twice.

Require stable:

```text
render specs
semantic placement inputs
diagnostics
output file hashes
```

If pixel/SVG output contains nondeterministic metadata only, normalize metadata before hash comparison rather than changing semantics.

Document exact normalization.

---

# All-40 render-spec census

For all accepted 103 compatibility compiler intents:

generate deterministic render specs or typed abstentions.

Measure:

```text
render specs total
map render specs
diagram render specs
NO_SAFE_RENDERING
diagnostics

counts by relation kind
counts by renderer rule
```

Run twice and compare hashes.

Do not require all 103 pixel renders.

---

# V3.5 isolation

Hard requirement:

```text
V3.5 production output unchanged
```

Verify:

```text
no V3.5 semantic code changes
no production renderer routing changes
no plan hash changes
no regenerated V3.5 approval packs
no production episode assets changed
```

V3.6 renderer output must live under a separate shadow path.

---

# Shadow output paths

Use a clearly separate namespace such as repository-equivalent:

```text
artifacts/shadow/history-v3.6/renderer/
```

Never overwrite production assets.

---

# No production activation

Hard prohibition:

```text
do not switch production planner
do not switch production renderer
do not make V3.6 default
do not modify production approvals
do not regenerate videos
do not modify published assets
```

Even if renderer readiness passes.

---

# Hard semantic invariants

All applicable must remain zero:

```text
renderer reads narration for semantics
renderer reads adjacent claims for semantics
renderer geocodes/invents missing semantic places

purpose-as-destination
objective-as-destination
intent-as-completed-movement

event-location-as-movement
comparison-as-route

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

evidence-set member edge invention
evidence-set false ordering
evidence member loss

proof support loss
unresolved participant rendering
unresolved semantic geography rendering

semantic relation ID mutation
compilerIntentId mutation
evidence fingerprint mutation

silent renderer drop
fallback to V3.5 semantic heuristic

non-deterministic renderSpecId
V3.5 production output change
```

If any semantic invariant is non-zero:

```text
RENDERER_SHADOW_READINESS = BLOCKED
```

Do not fix by weakening semantics.

---

# Human decision gates

STOP if any occurs.

## Gate A — renderer cannot preserve modality

Examples:

```text
intended event-location can only be displayed as completed
policy-response asymmetric status cannot be shown/preserved
```

## Gate B — evidence-set renderer requires false edges

Do not permit member-to-member causal/temporal edges.

## Gate C — semantic inference required

If existing renderer needs raw narration/claims to determine meaning:

stop.

Do not reuse that semantic path.

## Gate D — new visual semantic taxonomy required

If safe rendering requires a materially new map/diagram visual type beyond presentation styling:

stop and propose it.

## Gate E — production activation

Stop before routing V3.6 into production.

## Gate F — external provider required

No external image/map/LLM/provider calls.

## Gate G — repeated defect

Same semantic renderer defect fails two focused attempts.

---

# Per-phase autonomous workflow

For each successful internal phase:

1. inspect exact boundary;
2. implement smallest bounded change;
3. run focused validation;
4. run invariant checks;
5. self-review;
6. commit;
7. create immutable tag;
8. generate compact phase artifact;
9. continue automatically if no gate.

Do not stop solely because a phase passed.

---

# Suggested phases

Expected approximately:

```text
Phase 2.30 — renderer boundary audit + render-spec contract
Phase 2.31 — map shadow adapter
Phase 2.32 — diagram shadow adapter
Phase 2.33 — same-eight renderer feature lane + previews
Phase 2.34 — all-40 render-spec census
Phase 2.35 — renderer-shadow readiness close
```

Use actual sequential numbering from repository state.

Maximum six phases.

---

# Validation

Use focused risk-based validation:

```text
History typecheck
targeted ESLint

render-spec contract tests
map adapter tests
diagram adapter tests

46 semantic goldens
same-eight semantic regression
same-eight compiler regression

same-eight renderer specs x2
same-eight preview rendering x2 where deterministic/local
all-40 render-spec census x2

V3.5 isolation
checksums
ZIP integrity
```

Do not run unrelated repository-wide suites.

---

# Safe parallelism

One primary writer.

Read-only/disjoint subagents may inspect:

```text
map renderer
diagram renderer
layout determinism
same-eight previews
all-40 render-spec census
V3.5 isolation
```

Do not concurrently edit canonical adapter/render-spec contracts.

---

# Token discipline

Prefer:

```text
exact rg/find
existing compiler intents
machine-readable fixtures
small renderer samples
compact preview index
focused tests
```

Avoid:

```text
full episode narration
large image packs
full video rendering
repeated architecture explanations
full repo rereads
```

---

# Provider policy

Hard:

```text
LLM calls = 0
image provider calls = 0
live map/geocoding calls = 0
web calls = 0
```

Use only existing resolved geography/assets and local deterministic renderers.

---

# Consolidated journal

Maintain:

```text
docs/reports/codex-runs/
2026-08-10-history-v36-autonomous-renderer-shadow-integration.md
```

Per phase:

```text
phase
start SHA
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

# Consolidated artifact

Generate:

```text
history-v3.6-renderer-shadow-readiness-<timestamp>.zip
```

Include:

```text
README.md
architecture-summary.md

renderer-contract.json
relation-renderer-matrix.json

same-eight-render-spec-summary.json
same-eight-preview-review.json
preview-index.json

all40-render-spec-census.json

map-renderer-summary.json
diagram-renderer-summary.json
safe-rendering-abstention-summary.json

determinism-summary.json
v35-isolation-summary.json
invariant-summary.json
test-summary.json

human-decision-gate.json if applicable

provenance.json
checksums.sha256
```

Include compact representative previews only.

Do not embed old ZIPs.

---

# Readiness verdict

Return exactly one:

```text
READY_FOR_V36_VISUAL_PLAN_SHADOW_INTEGRATION

READY_WITH_SAFE_RENDERER_ABSTENTIONS

BLOCKED_BY_RENDERER_SEMANTIC_GAP

BLOCKED_BY_LAYOUT_READABILITY

BLOCKED_BY_DETERMINISM

BLOCKED_BY_V35_ISOLATION

STOPPED_AT_HUMAN_GATE
```

---

# Next-stage boundary

Even on PASS:

DO NOT automatically integrate V3.6 renderer outputs into production visual plans.

The next stage, if ready, should be:

```text
V3.6 visual-plan shadow integration
```

That stage should decide:

```text
how validated map/diagram shadow renders are placed into episode visual plans
how they coexist with normal image scenes
how production gating/differential review works
```

Do not execute it here.

---

# Required final response

Return one compact report:

```text
AUTONOMOUS RENDERER SHADOW RUN:
PASS / STOPPED_AT_GATE / BLOCKED

phases completed:
- phase — purpose — commit — tag — result

Lane A same-eight:
compiler intents: 34
render specs:
actual previews:
MAP:
DIAGRAM:
safe abstentions:
relation kinds exercised:

Lane B all-40:
compiler intents: 103
render specs:
safe abstentions:
determinism:

renderer matrix:
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

preview quality:
PASS / exact blockers

V3.5:
unchanged

provider/LLM/image/web calls:
0

renderer-shadow readiness:
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

## Boundary

- [ ] V3.6 render path is additive and shadow-only.
- [ ] Renderer adapter consumes typed compiler intents.
- [ ] Renderer does not infer semantics from narration/claims.
- [ ] Render-spec identity deterministic.
- [ ] Every compiler intent produces render spec or typed abstention.

## Map

- [ ] Movement uses only explicit route semantics.
- [ ] No missing route completion.
- [ ] Spatial comparison remains non-route.
- [ ] Event-location remains non-movement.
- [ ] Intended event-location preserved.
- [ ] No raw geocoding/invented semantic places.

## Diagram

- [ ] Causal direction/modality preserved.
- [ ] Dependency distinct from causality.
- [ ] Process order preserved without causal claim.
- [ ] Temporal sequence preserved without causal claim.
- [ ] Policy-response asymmetric modality preserved.
- [ ] Proof support retained.
- [ ] Evidence-set has no semantic member-to-member edges.
- [ ] Evidence members complete.

## Rendering

- [ ] Same-eight full-feature render specs generated.
- [ ] Representative previews produced for available kinds where local deterministic rendering exists.
- [ ] No severe clipping/overlap/off-canvas semantic participants.
- [ ] Layout does not alter meaning.
- [ ] Same-eight deterministic repeat passes.
- [ ] All-40 render-spec repeat passes.

## Safety

- [ ] Semantic inference = 0.
- [ ] Purpose/objective-as-destination = 0.
- [ ] Intent-as-completed-movement = 0.
- [ ] Event-location-as-movement = 0.
- [ ] Comparison-as-route = 0.
- [ ] Chronology/process/dependency-as-causality = 0.
- [ ] Modality loss/strengthening = 0.
- [ ] Direction/order corruption = 0.
- [ ] Evidence false ordering/edge invention = 0.
- [ ] Proof support loss = 0.
- [ ] Semantic IDs/fingerprints/compiler IDs unchanged.
- [ ] Silent drops = 0.
- [ ] V3.5 heuristic fallback = 0.
- [ ] V3.5 production changes = 0.

## Scope

- [ ] No production activation.
- [ ] No image generation.
- [ ] No video regeneration.
- [ ] No live map/geocode calls.
- [ ] No LLM/provider calls.
- [ ] No semantic contract changes.
- [ ] No relation taxonomy changes.

## Completion

- [ ] Focused tests pass.
- [ ] 46 goldens pass.
- [ ] Typecheck/ESLint pass.
- [ ] Successful phases committed/tagged.
- [ ] Consolidated artifact generated.
- [ ] Checksums/ZIP integrity pass.
- [ ] Exactly one next task recommended.

Begin from:

```text
history-v3.6-compiler-shadow-readiness-baseline
```

and execute the renderer shadow integration autonomously.
