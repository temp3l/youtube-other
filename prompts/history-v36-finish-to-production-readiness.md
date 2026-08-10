# History V3.6 — Autonomous Finish-to-Production-Readiness Goal

## Objective

Finish the remaining History V3.6 implementation **autonomously** from the accepted renderer-shadow baseline.

Do NOT stop after each phase for another prompt.

Do NOT ask for confirmation for routine implementation choices.

Use conservative, fail-closed defaults and continue until either:

```text
A. V3.6 is objectively READY_FOR_PRODUCTION_ACTIVATION
or
B. a genuine HUMAN DECISION GATE is reached
```

The user does not want a prompt-by-prompt workflow anymore.

---

# Starting baseline

```text
HEAD:
75de97926ad039ee7fbbcae11023a5bc1dbabcc8

TAG:
history-v3.6-renderer-shadow-readiness-baseline
```

Accepted renderer-shadow state:

```text
same-eight compiler intents: 34
same-eight render specs: 34
same-eight previews: 9
all-40 compiler intents: 103
all-40 render specs: 103
safe abstentions: 0
determinism: PASS
hard semantic invariants: all zero
V3.5: unchanged
provider/LLM/image/web/geocoding calls: 0
```

Frozen V3.5:

```text
f04262c16bfd1a89d1b404b1ac291a89dc699a0d
history-v3.5-frozen-before-v36
```

Use Git as authority.

---

# Remaining mission

Continue through the remaining V3.6 delivery stages without requiring another user prompt after each one.

Expected broad progression:

```text
renderer-shadow baseline
→ visual-plan shadow integration
→ episode-plan coexistence with normal image scenes
→ deterministic placement/gating
→ same-eight full shadow plans
→ all-40 shadow-plan census
→ approval/review pack
→ production-activation readiness audit
→ STOP before actual production activation
```

You may add intermediate phases if repository evidence requires them.

Do not artificially create phases just to produce checkpoints.

---

# Autonomy policy

For every successful bounded phase:

```text
implement
→ focused validate
→ self-review
→ commit
→ immutable tag
→ compact artifact
→ derive next task
→ continue
```

Do NOT stop merely because a phase passed.

Do NOT ask the user to paste another prompt.

Do NOT ask for approval for routine choices when a conservative safe default is available.

---

# Safe-default policy

When a minor implementation choice is ambiguous, prefer in this order:

```text
1. preserve accepted semantics
2. preserve V3.5 behavior
3. fail closed
4. shadow-only behavior
5. deterministic behavior
6. smaller additive change
7. explicit typed abstention over inference
```

Do not create a human gate for naming, file layout, small adapter shape, local test organization, or other reversible implementation detail.

---

# TRUE HUMAN DECISION GATES ONLY

Stop only if one of these occurs.

## Gate A — production activation

The next step would actually switch production from V3.5 to V3.6 or alter published/generated production assets.

STOP before activation.

## Gate B — accepted semantics must change

Progress requires altering accepted relation semantics, IDs, modality behavior, proof semantics, renderer semantics, or V3.5 behavior.

## Gate C — multiple materially different architectures

Two or more designs remain credible and repository evidence cannot safely select one.

## Gate D — semantic weakening required

Any solution would require inference/fallback, modality loss, invented geography, guessed participants, or weaker validation.

## Gate E — new taxonomy / renderer semantic family

A genuinely new semantic or visual taxonomy is required.

## Gate F — external/live provider required

LLM, image generation, web research, live geocoding, or other external semantic generation becomes necessary.

## Gate G — repeated failure

The same architectural defect fails twice after focused remediation.

## Gate H — destructive migration

A migration would rewrite accepted artifacts/IDs or cannot be safely rolled back.

Everything else should be handled autonomously.

---

# Stage 1 — V3.6 visual-plan shadow integration

Integrate accepted V3.6 render specs into the episode visual-plan layer in SHADOW ONLY.

Required architecture:

```text
canonical episode
    ↓
existing normal image-scene planning
    +
validated V3.6 map/diagram render specs
    ↓
V3.6 shadow visual plan
```

Do not replace V3.5 production planning.

---

# Visual-plan principle

Maps/diagrams are already semantically decided upstream.

Visual-plan integration may decide only:

```text
placement
timing slot
layout slot
scene coexistence
duration allocation within existing plan constraints
review ordering
```

It must NOT decide:

```text
whether a relation deserves a map/diagram
relation meaning
new geography
new causality
new participants
new modality
```

---

# Placement rules

Use deterministic, evidence-backed placement.

Prefer exact relation-support claim spans/timing anchors already available.

If exact placement cannot be determined safely:

```text
NO_SAFE_PLACEMENT
```

Do not use narration keyword heuristics.

Do not scan nearby prose for approximate placement unless an already accepted typed timing/claim anchor explicitly authorizes it.

---

# Coexistence with ordinary image scenes

Do not remove ordinary image scenes merely because a map/diagram exists.

Implement deterministic coexistence policy based on current plan architecture.

Allowed strategies include:

```text
replace a scene only when the existing plan contract explicitly supports semantic visual substitution

or

insert/attach a visual overlay/slot without changing semantic timing
```

Choose the smallest architecture supported by repository evidence.

If both are materially different and neither is clearly supported:

Gate C.

---

# Timing

Respect current narration timing contracts.

Do not invent measured TTS timings.

The existing expected blocker:

```text
TIMING_MEASUREMENT_REQUIRED
```

remains legitimate where real measured timing is absent.

Do not "fix" timing measurement in this run.

Use existing deterministic timing estimates only where current shadow planning already permits them.

---

# Same-eight visual-plan lane

Generate full V3.6 SHADOW visual plans for the accepted same-eight representative episodes.

Require:

```text
all accepted V3.6 map/diagram render specs accounted for
no silent drops
no duplicate semantic insertion
deterministic placement
ordinary image scenes preserved according to chosen coexistence contract
```

Produce compact review previews/indexes.

Do not render full videos.

---

# All-40 shadow-plan census

After same-eight passes:

run the exact accepted all-40 compatibility corpus through visual-plan shadow integration.

Measure:

```text
episodes 40/40
relations/render specs consumed
placed visuals
typed safe-placement abstentions
duplicate placements
orphan render specs
plan validation failures
```

Run twice for determinism.

Do not treat absence of native/proof kinds in the frozen all-40 corpus as a failure.

---

# Differential audit

Compare V3.5 production plans and V3.6 shadow plans at aggregate/semantic level only.

Measure:

```text
map count changes
diagram count changes
visual replacement/insertion counts
unplaced semantic visuals
plan density
episode-level deltas
```

Do NOT require V3.6 to reproduce V3.5 heuristic visuals.

Safer reduction is acceptable.

---

# Review-pack stage

If shadow plans pass:

generate one compact V3.6 approval/review pack covering:

```text
same-eight detailed examples
all-40 aggregate metrics
representative map previews
representative diagram previews
placement/timing examples
V3.5/V3.6 differential summary
terminal/safe-abstention cases
```

Do not create large redundant packs.

Do not embed prior ZIPs.

---

# Production-readiness audit

After visual-plan shadow integration passes, run a final production-readiness audit.

It must answer whether V3.6 is safe to activate later.

Audit:

```text
semantic contracts frozen
compiler contracts frozen
renderer contracts frozen
visual-plan contract frozen
determinism
V3.5 isolation
migration/rollback path
feature flag / activation path
artifact compatibility
approval/review status
known terminal cases
timing blocker status
```

---

# Activation mechanism

Inspect how V3.6 would eventually be activated.

Prefer:

```text
explicit feature flag
genre-scoped configuration
private/shadow-first routing
rollback to V3.5
```

You MAY implement a disabled-by-default activation seam if needed for readiness testing.

You MUST NOT enable it.

Default must remain V3.5 production behavior.

---

# Production activation dry run

A dry-run/configuration-level activation test is allowed if it causes no production output changes.

Verify:

```text
flag OFF -> current V3.5 path
flag ON in test/shadow fixture -> V3.6 path
rollback -> V3.5
```

No production episode regeneration.

No published asset modification.

---

# Validation strategy

Use focused risk-based validation only.

Run as applicable:

```text
History typecheck
targeted ESLint
semantic/contract tests
46 goldens
same-eight semantic/compiler/renderer regression
same-eight visual-plan shadow x2
all-40 shadow-plan census x2
determinism checks
V3.5 isolation
activation-seam tests if implemented
artifact checksums
ZIP integrity
```

Do not run unrelated full-repository suites.

---

# Hard invariants

All applicable must remain zero:

```text
semantic inference in planner
narration keyword relation inference
guessed placement semantics
invented geography
purpose-as-destination
intent-as-completed-movement
modality loss
direction/order corruption
proof support loss
duplicate semantic visual placement
orphan semantic render spec without typed diagnostic
silent render-spec drop
V3.5 heuristic fallback inside V3.6
semantic relation ID mutation
compiler intent ID mutation
render spec ID mutation
evidence fingerprint mutation
non-deterministic shadow plan
production V3.6 activation
V3.5 production output change
```

---

# Provider policy

Hard default:

```text
LLM calls = 0
image-provider calls = 0
web calls = 0
live geocoding calls = 0
```

Use accepted local assets, static geography, deterministic fixtures, and local renderers.

---

# Git policy

Maintain safe checkpoints, but do not stop after them.

For each meaningful accepted stage:

```text
commit
immutable tag
compact artifact
```

Never:

```text
force tag
rewrite accepted commits
reset unrelated work
clean user files
overwrite V3.5 production assets
```

---

# Parallelism

One primary writer.

Read-only/disjoint subagents may inspect:

```text
visual-plan boundary
placement/timing contract
same-eight shadow plans
all-40 census
V3.5 isolation
activation seam
```

Do not allow parallel writes to canonical plan/activation contracts.

---

# Token discipline

Optimize strongly for low token use.

Prefer:

```text
exact file search
small targeted reads
existing machine-readable artifacts
aggregate reports
focused fixtures
compact journals
```

Avoid:

```text
full narration dumps
large review packs
repeated architecture summaries
full repo rereads
duplicated test output
```

---

# Run duration / phase cap

Do not use a tiny micro-phase cap.

This is a goal-mode completion run.

Maximum:

```text
10 meaningful phases
```

or stop earlier at a TRUE HUMAN DECISION GATE.

The objective is to reach production-readiness in one session if safely possible.

---

# Journal

Maintain one consolidated journal:

```text
docs/reports/codex-runs/
history-v36-finish-to-production-readiness.md
```

For each phase append only:

```text
phase
starting SHA
goal
result
tests
invariants
commit/tag
next
```

Keep concise.

---

# Final artifact

At completion generate one consolidated artifact:

```text
history-v3.6-production-readiness-<timestamp>.zip
```

Include at minimum:

```text
README.md
phase-index.json

visual-plan-contract-summary.json
same-eight-visual-plan-summary.json
all40-shadow-plan-census.json

placement-summary.json
renderer-consumption-summary.json
v35-v36-differential-summary.json

determinism-summary.json
v35-isolation-summary.json
activation-seam-summary.json
rollback-summary.json

known-terminal-cases.json
timing-status.json

test-summary.json
invariant-summary.json
production-readiness-decision.json
provenance.json
checksums.sha256
```

Include only compact representative previews.

---

# Final readiness verdict

Return exactly one:

```text
READY_FOR_PRODUCTION_ACTIVATION

READY_WITH_KNOWN_NONBLOCKING_TERMINAL_CASES

BLOCKED_BY_VISUAL_PLAN_INTEGRATION

BLOCKED_BY_TIMING_REQUIREMENT

BLOCKED_BY_DETERMINISM

BLOCKED_BY_V35_ISOLATION

STOPPED_AT_HUMAN_GATE
```

If the only remaining issue is the already accepted real-TTS timing gate, report that explicitly rather than inventing timing.

---

# Final response ONLY

Do not give intermediate user-facing summaries after each phase.

At the end return one consolidated result:

```text
V3.6 FINISH-TO-READINESS RUN:
PASS / STOPPED_AT_GATE / BLOCKED

phases completed:
- phase — purpose — commit — tag — result

same-eight visual-plan lane:
...

all-40 shadow-plan lane:
...

V3.5 differential:
...

hard invariants:
...

determinism:
...

V3.5:
unchanged

activation seam:
implemented/not needed
default remains V3.5

provider/LLM/image/web/geocoding calls:
0

production-readiness:
...

final HEAD:
...

final tag:
...

artifact:
...

artifact SHA-256:
...

HUMAN DECISION REQUIRED:
yes/no

if yes:
exactly one decision with 2-3 bounded options and recommendation

if no:
next action = production activation approval
```

Do not execute actual production activation.

---

# Success condition

The run succeeds when V3.6 is either:

```text
READY_FOR_PRODUCTION_ACTIVATION
```

or

```text
READY_WITH_KNOWN_NONBLOCKING_TERMINAL_CASES
```

with production activation still disabled.

Begin from:

```text
history-v3.6-renderer-shadow-readiness-baseline
```

and continue autonomously to production-readiness.
