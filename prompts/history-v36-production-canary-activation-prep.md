# History V3.6 — Production Canary + Activation Preparation

## Objective

Take the accepted V3.6 production-readiness baseline through one final reversible production-candidate canary run.

The goal is:

```text
existing V3.6 readiness baseline
→ wire production routing behind existing feature flag
→ keep default OFF
→ obtain measured timing for two canary episodes
→ build production-candidate V3.6 plans
→ render/validate canary outputs
→ verify rollback
→ prepare global activation packet
→ STOP before changing the default production route
```

Do not stop after each internal phase.

Continue autonomously until either:

```text
READY_FOR_GLOBAL_ACTIVATION_APPROVAL
```

or a TRUE HUMAN DECISION GATE.

---

# Starting baseline

Accepted V3.6 production-readiness baseline:

```text
COMMIT:
cbeab20078c3932e1e08cdb9e607fde34a96c9e4

TAG:
history-v3.6-production-readiness-baseline
```

Accepted readiness verdict:

```text
READY_WITH_KNOWN_NONBLOCKING_TERMINAL_CASES
```

Known remaining prerequisite:

```text
measured timing required per episode
```

Frozen V3.5:

```text
commit:
f04262c16bfd1a89d1b404b1ac291a89dc699a0d

tag:
history-v3.5-frozen-before-v36
```

Use Git as authority.

Resolve all full peeled SHAs before work.

Never overwrite accepted tags.

---

# Canary episodes

Use exactly these two canaries unless repository IDs differ:

```text
Black Death
D-Day
```

Resolve authoritative episode IDs from the repository.

Reason for coverage:

## Black Death

Exercises accepted V3.6 features including:

```text
proof-aware policy-response
asymmetric modality
evidence semantics
diagram rendering
visual-plan placement
```

## D-Day

Exercises accepted V3.6 features including:

```text
event-location
map rendering
intended assertion status
visual-plan placement
static geography sidecar
```

Do not substitute other episodes merely for convenience.

---

# Hard production rule

Production default must remain:

```text
V3.5
```

throughout this run.

V3.6 may be enabled only:

```text
explicitly
for the two canary episodes
inside a bounded test/production-candidate context
```

No global default change.

No all-40 production activation.

No published asset replacement.

---

# Phase 0 — preflight

Run:

```bash
git status --short
git branch --show-current
git rev-parse HEAD
git log --oneline --decorate -35

git rev-parse history-v3.6-production-readiness-baseline
git rev-parse 'history-v3.6-production-readiness-baseline^{}'

git rev-parse history-v3.5-frozen-before-v36
git rev-parse 'history-v3.5-frozen-before-v36^{}'
```

Verify the current branch descends cleanly from the accepted baseline.

Run focused preflight:

```text
History typecheck
targeted ESLint
current V3.6 production-readiness tests
same-eight shadow-plan regression
renderer/compiler smoke
activation-seam tests
```

Proceed only if green.

Create immutable checkpoint:

```text
history-v3.6-pre-production-canary
```

Use a versioned equivalent if occupied.

No destructive Git operations.

---

# Phase 1 — production routing seam

Inspect the existing disabled-by-default activation seam from the readiness baseline.

Wire actual production-path routing behind it only if not already fully wired.

Required behavior:

```text
flag OFF
→ current V3.5 production path

flag ON for explicit canary episode
→ V3.6 production-candidate path

flag OFF again
→ clean V3.5 rollback
```

Do not make the flag global by default.

Do not change environment defaults to V3.6.

Do not change published assets.

---

# Activation scope

Prefer explicit episode allowlisting.

Conceptually:

```text
HISTORY_V36_ENABLED=false

HISTORY_V36_CANARY_EPISODES=<BlackDeathID,D-DayID>
```

or repository-equivalent configuration.

Use existing config conventions.

Do not invent unnecessary config layers.

If a global V3.6 flag already exists, retain it OFF and add the smallest safe canary override if required.

---

# Measured timing requirement

The canaries must use real measured narration timing.

Do not use:

```text
provisional-text-estimate
```

for final canary validation.

Use the existing TTS/audio timing pipeline.

Allowed sources:

```text
already-generated local narration audio
existing deterministic local timing artifacts
explicitly configured TTS provider if already part of the normal production pipeline and user credentials/configuration are present
```

Do not invent timing.

---

# Provider policy for timing

This is the one place where an already-configured production TTS provider MAY be used if required to generate actual canary narration.

Rules:

1. Use the repository's existing production TTS configuration.
2. Do not switch provider/model/voice architecture.
3. Do not call LLM/image/web/geocoding services.
4. Record exact TTS provider/voice used.
5. Record cost/usage metrics if available.
6. Generate only the two canary episodes.
7. Reuse existing audio if current and valid.
8. Do not regenerate unrelated episodes.

If measured timing cannot be obtained with the existing configured production path:

HUMAN DECISION GATE.

---

# Timing artifact requirements

For each canary record:

```text
episodeId
audio asset path/hash
measured duration
word/segment timing source
timing artifact hash
provider/voice if applicable
generatedAt
```

The final visual plan must consume measured timing, not text estimates.

---

# Phase 2 — production-candidate plan generation

Generate V3.6 production-candidate plans for:

```text
Black Death
D-Day
```

Use:

```text
measured timing
accepted V3.6 semantics
accepted compiler contract
accepted renderer adapters
accepted visual-plan integration
```

Do not regenerate semantics.

Do not call semantic LLMs.

---

# Production-candidate isolation

Store all canary outputs under a clearly isolated path such as:

```text
artifacts/canary/history-v3.6/
```

or repository-equivalent.

Do not overwrite current V3.5 production artifacts.

Every canary artifact must be traceable to:

```text
episode
V3.6 baseline
timing artifact
compiler/render/plan versions
```

---

# Phase 3 — canary rendering

Render the two production-candidate outputs through the real local production rendering pipeline where safely possible.

Use existing:

```text
map renderer
diagram renderer
image scenes
FFmpeg composition
subtitle/caption/audio pipeline
```

Do not regenerate ordinary image assets unless the current canary build strictly requires it.

Prefer reuse of existing approved image assets.

No image-generation provider calls.

No web/geocoding calls.

---

# Full-video policy

For only the two canary episodes:

full local production-candidate rendering is authorized if practical.

Do NOT:

```text
publish
upload to YouTube
replace production assets
modify production manifests
```

Rendered canaries remain local review artifacts.

---

# Canary validation — semantic

Require all existing V3.6 invariants zero.

Additionally verify:

```text
all expected V3.6 overlays present
no duplicate overlays
no orphan render specs
no missing semantic relations
no semantic inference fallback
no V3.5 heuristic fallback inside V3.6 path
```

---

# Canary validation — timing

Verify:

```text
all V3.6 visual placements are based on measured timing
no overlay starts before its support window
no overlay ends after invalid semantic/timing boundary
no timing collision hides narration-critical visual
no negative duration
no zero duration
no estimated timing remains in final canary plan
```

---

# Canary validation — visual quality

For both canaries inspect:

```text
map readability
diagram readability
label clipping
text overlap
off-canvas content
aspect ratio behavior
16:9 output
9:16 output if current production pipeline supports it for these episodes
```

Do not redesign unrelated visuals.

Only fix canary-blocking rendering defects.

---

# Black Death required checks

Verify:

```text
policy-response condition remains uncertain
policy-response response remains attempted
proof-aware support retained
diagram semantics remain condition -> response
no false asserted/asserted rendering
```

---

# D-Day required checks

Verify:

```text
event-location remains event-location
Calais remains point
Pas-de-Calais remains area/presentation-anchor semantics
assertionStatus remains intended
no movement-to-Calais interpretation
no completed invasion implication
```

---

# Differential comparison

Compare canary V3.5 production candidate vs V3.6 production candidate.

Measure:

```text
beat count
shot count
map count
diagram count
image scene count
overlay count
total duration
timing deltas
visual replacements
visual insertions
```

Expected architecture from readiness baseline:

```text
V3.6 overlays are additive
ordinary beats/shots preserved
```

If canary production output materially violates this without prior authorization:

HUMAN DECISION GATE.

---

# Rollback validation

After generating V3.6 canary outputs:

run the same canary entrypoint with V3.6 disabled.

Require:

```text
routing returns to V3.5
V3.5 hashes unchanged
no V3.6 artifacts consumed by V3.5
no stale V3.6 state leaks into production path
```

Record rollback evidence.

---

# Activation readiness

If both canaries pass:

prepare the global activation packet.

Do NOT activate globally.

The packet must specify:

```text
exact config/flag change required
expected default before
expected default after
rollback command/config
pre-activation validation
post-activation validation
known terminal cases
timing requirement for future episodes
```

---

# Future episode policy

Production activation must not imply that timing estimates are acceptable.

After V3.6 activation, each episode must still require:

```text
measured narration timing
```

before final V3.6 visual placement is considered production-valid.

Fail closed if measured timing is missing.

---

# Global activation strategy

Prepare a recommended rollout sequence:

```text
1. canary-approved V3.6 routing
2. small bounded production batch
3. all-40 migration/regeneration only when explicitly requested
```

However, because the user wants to finish efficiently, if repository architecture makes global default activation trivially reversible and the canaries fully pass, the final packet may recommend direct activation.

Do not execute it.

---

# TRUE HUMAN DECISION GATES

Stop only if:

## Gate A — canary semantic failure

A validated V3.6 relation is rendered/planned incorrectly.

## Gate B — measured timing cannot be obtained

Existing configured production timing path cannot produce authoritative timing.

## Gate C — production route cannot be isolated

V3.6 cannot be enabled for canaries without risking global V3.5 output.

## Gate D — rollback failure

V3.5 cannot be restored cleanly.

## Gate E — repeated rendering defect

Same canary-blocking renderer defect fails twice.

## Gate F — unexpected production migration

Activation would require rewriting accepted assets/IDs/manifests destructively.

## Gate G — external architecture change

A new semantic/compiler/renderer contract would be required.

Routine code fixes, config wiring, test repairs, artifact generation, or local canary rendering are NOT human gates.

---

# Autonomous run behavior

For each internal phase:

```text
implement
→ focused validate
→ self-review
→ commit
→ immutable tag
→ continue
```

Do not stop after routine success.

Maximum:

```text
8 meaningful phases
```

or until final activation-prep verdict.

---

# Validation

Use focused risk-based validation.

Run as applicable:

```text
History typecheck
targeted ESLint
activation routing tests
timing tests
canary plan tests
renderer tests
FFmpeg/local render smoke
Black Death semantic assertions
D-Day semantic assertions
rollback tests
V3.5 isolation
artifact checksums
ZIP integrity
```

Do not run unrelated full-repository suites.

---

# Git safety

Never:

```text
force tag
rewrite accepted history
reset unrelated changes
clean user files
replace production assets
publish/upload
```

Each successful major stage should have:

```text
commit
immutable tag
compact artifact
```

---

# Consolidated journal

Maintain:

```text
docs/reports/codex-runs/
history-v36-production-canary-activation-prep.md
```

Keep entries concise.

---

# Final artifact

Generate:

```text
history-v3.6-production-canary-readiness-<timestamp>.zip
```

Include:

```text
README.md
phase-index.json

routing-seam-summary.json
canary-config-summary.json

black-death-timing.json
d-day-timing.json

black-death-plan-summary.json
d-day-plan-summary.json

black-death-render-review.json
d-day-render-review.json

v35-v36-canary-differential.json
rollback-summary.json

activation-instructions.md
rollback-instructions.md
future-episode-timing-policy.md

test-summary.json
invariant-summary.json
production-canary-decision.json
provenance.json
checksums.sha256
```

Include compact representative preview assets if useful.

Do not include giant video binaries inside the ZIP.

Reference rendered video paths/hashes instead.

---

# Final verdict

Return exactly one:

```text
READY_FOR_GLOBAL_ACTIVATION_APPROVAL

READY_FOR_BOUNDED_PRODUCTION_ROLLOUT

BLOCKED_BY_MEASURED_TIMING

BLOCKED_BY_CANARY_SEMANTIC_DEFECT

BLOCKED_BY_CANARY_RENDERING

BLOCKED_BY_ROLLBACK

STOPPED_AT_HUMAN_GATE
```

---

# Final response only

Do not emit intermediate user-facing phase reports.

Return one consolidated result:

```text
V3.6 PRODUCTION CANARY RUN:
PASS / BLOCKED / STOPPED_AT_GATE

phases:
- ...

Black Death:
measured timing:
V3.6 plan:
render:
semantic checks:
PASS/FAIL

D-Day:
measured timing:
V3.6 plan:
render:
semantic checks:
PASS/FAIL

V3.5 differential:
...

rollback:
PASS/FAIL

hard invariants:
...

V3.5 production:
unchanged

provider usage:
TTS:
LLM: 0
image: 0
web/geocoding: 0

activation readiness:
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

if no:
next action = approve global V3.6 activation
```

Do NOT perform global V3.6 activation.

Begin from:

```text
history-v3.6-production-readiness-baseline
```

and execute the two-episode V3.6 production canary + activation-preparation run autonomously.
