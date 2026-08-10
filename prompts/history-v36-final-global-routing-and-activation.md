# History V3.6 — Final Global Production Routing Integration + Activation

## Objective

Finish the final History V3.6 production-routing gap and activate V3.6 globally only after the new routing architecture passes focused validation.

Current state:

```text
HISTORY V3.6 PRODUCTION ACTIVATION: FAIL

reason:
existing routing seam is deliberately canary-only

current production route:
V3.5

canary status:
Black Death PASS
D-Day PASS

timing minimum:
300s

hard invariants:
all zero

bounded-rollout readiness commit:
fc0be5851b3bc262e6d45fdac55664341c48c50f

tag:
history-v3.6-production-canary-bounded-rollout-ready
```

The remaining blocker is architectural:

```text
production composer / global routing does not yet support V3.6
```

This task is explicitly authorized to implement that routing integration.

Do not reopen semantic, compiler, renderer, visual-plan, or timing architecture.

---

# Starting baseline

Use Git as authority.

Verify:

```text
HEAD descends from:
fc0be5851b3bc262e6d45fdac55664341c48c50f

tag:
history-v3.6-production-canary-bounded-rollout-ready
```

Also resolve:

```text
history-v3.6-production-readiness-baseline
history-v3.6-renderer-shadow-readiness-baseline
history-v3.6-compiler-shadow-readiness-baseline
history-v3.5-frozen-before-v36
```

Do not overwrite tags.

---

# Exact problem to solve

The current seam effectively behaves like:

```text
if exact canary allowlist match:
    use V3.6 canary path
else:
    use V3.5

productionActivated = false
```

That is insufficient for production activation.

Implement an explicit production-routing state machine that supports:

```text
OFF
CANARY
GLOBAL
```

or repository-equivalent typed configuration.

Required semantics:

```text
OFF
→ all History episodes use V3.5

CANARY
→ only allowlisted episodes use V3.6
→ all others use V3.5

GLOBAL
→ all eligible History episodes use V3.6
→ fail closed when V3.6 production prerequisites are not met
```

Do not rely on raw booleans if they cannot represent these three states clearly.

---

# Production composer integration

Locate the actual History production composer / production-plan entrypoint.

Integrate the V3.6 visual-plan production path there.

The composer must select between:

```text
V3.5 production composer
V3.6 production composer
```

based only on the typed routing mode and episode eligibility.

Do not duplicate V3.6 pipeline logic.

Reuse the already accepted:

```text
V3.6 semantics
compiler
renderer
visual-plan
measured-timing gate
```

---

# Eligibility

For GLOBAL mode, V3.6 is eligible only when production prerequisites pass.

At minimum:

```text
measured narration timing exists
measured duration >= 300s
required V3.6 artifacts/contracts valid
episode input/version hashes compatible
```

If a production prerequisite is missing:

FAIL CLOSED.

Do NOT silently fall back to V3.5 while GLOBAL mode is explicitly selected unless repository product policy already defines that fallback and tests prove it is intentional.

Preferred behavior:

```text
GLOBAL + invalid V3.6 prerequisites
→ explicit production error
```

This prevents mixed invisible production semantics.

---

# Missing-timing requirement

Measured timing remains mandatory.

Negative control:

```text
GLOBAL mode
+
episode without measured timing

→ TIMING_MEASUREMENT_REQUIRED
or repository-equivalent typed production error
```

Do not permit provisional text timing.

Do not automatically regenerate TTS during routing.

---

# Configuration

Use existing repository configuration conventions.

Prefer a typed setting conceptually equivalent to:

```text
MEDIAFORGE_HISTORY_V36_MODE=off|canary|global
```

If the existing config already uses another name, extend it rather than introducing redundant configuration.

Backward compatibility:

```text
missing config
→ OFF / V3.5
```

unless current repository defaults already specify otherwise.

---

# Preserve canary mode

The existing canary path must continue to work unchanged:

```text
CANARY
Black Death → V3.6
D-Day → V3.6
non-canary → V3.5
```

Do not remove the canary allowlist.

It remains useful for rollback/testing.

---

# Global mode smoke tests

After implementation, run GLOBAL mode in a bounded local/test production context.

Use:

```text
Black Death
D-Day
one non-canary History episode WITH valid measured timing
```

If no non-canary episode currently has measured timing:

generate or use one existing measured-timing fixture/artifact only if already supported by the local production path.

Do not broaden into all-40 TTS generation.

If a suitable non-canary measured-timing fixture cannot be produced without a new architecture decision:

stop at a human gate.

---

# Required global smoke behavior

In GLOBAL mode:

```text
Black Death → V3.6
D-Day → V3.6
non-canary valid episode → V3.6
```

Require:

```text
V3.6 production composer selected
measured timing consumed
V3.6 visual plan selected
no V3.5 semantic fallback inside V3.6 path
no canary-only branch restriction
```

---

# Negative smoke

Test one episode with missing measured timing.

Require:

```text
GLOBAL
→ fail closed
→ typed timing-required error
```

No fallback to V3.5.

---

# OFF mode regression

Require:

```text
OFF
Black Death → V3.5
D-Day → V3.5
non-canary → V3.5
```

Existing V3.5 hashes/results remain unchanged.

---

# CANARY mode regression

Require:

```text
CANARY
Black Death → V3.6
D-Day → V3.6
non-canary → V3.5
```

No change from accepted behavior.

---

# Rollback

Rollback must be one configuration change:

```text
GLOBAL → OFF
```

or repository-equivalent.

Verify in focused smoke:

```text
all tested episodes route back to V3.5
V3.5 hashes unchanged
no V3.6 state leakage
```

Then restore GLOBAL only after all activation gates pass.

---

# Activation gate

Before actually setting production mode to GLOBAL, require all:

```text
Black Death canary PASS
D-Day canary PASS
global non-canary smoke PASS
missing-timing fail-closed PASS
OFF regression PASS
CANARY regression PASS
rollback PASS
History typecheck PASS
targeted ESLint PASS
hard invariants = 0
V3.5 unchanged
```

If any fail:

do not activate.

---

# Authorized activation

If every gate passes:

ACTIVATE GLOBAL V3.6 production routing.

This task is explicitly authorized to change the production History routing configuration/default from V3.5/OFF to V3.6/GLOBAL.

Do not publish or regenerate episodes as part of activation.

Activation means only:

```text
future eligible History production runs use V3.6
```

Existing produced assets remain unchanged.

---

# Production safety

Do NOT:

```text
regenerate all 40 episodes
publish/upload videos
rewrite existing production assets
modify semantic contracts
modify relation taxonomy
modify compiler semantics
modify renderer semantics
lower timing below 300s
remove measured-timing requirement
```

---

# Hard invariants

Require all zero:

```text
silent GLOBAL→V3.5 fallback
canary allowlist restricting GLOBAL
provisional timing accepted
missing timing accepted
semantic fallback
V3.5 semantic mutation
V3.5 hash mutation
V3.6 semantic ID mutation
compiler ID mutation
render-spec ID mutation
duplicate routing
mixed composer selection
production asset overwrite
```

---

# Validation

Focused only:

```text
routing-mode schema/config tests
production composer routing tests
OFF mode smoke
CANARY mode smoke
GLOBAL mode smoke
missing-timing negative test
rollback smoke
History typecheck
targeted ESLint
V3.5 isolation
activation config verification
```

Do not run unrelated full-repository suites.

---

# Git

Use one implementation commit for the routing architecture, then a separate activation commit if practical.

Suggested:

```text
feat(history): add v3.6 global production routing
```

then:

```text
feat(history): activate v3.6 production routing
```

Create immutable final tag:

```text
history-v3.6-production-activated
```

Use a versioned suffix if occupied.

Never overwrite tags.

---

# Activation record

Create:

```text
docs/history/v3.6/production-activation-record.md
```

Record:

```text
activation timestamp
previous mode
new mode
routing config
routing implementation commit
activation commit
V3.6 production-readiness baseline
canary readiness baseline
timing minimum = 300s
measured timing requirement
smoke-tested episode IDs
negative timing test
rollback procedure
validation result
```

Keep concise.

---

# Final result

Return exactly:

```text
HISTORY V3.6 GLOBAL PRODUCTION ACTIVATION:
PASS / FAIL / STOPPED_AT_GATE

routing architecture:
OFF:
CANARY:
GLOBAL:

production mode:
V3.6 GLOBAL / V3.5

timing minimum:
300s

measured timing required:
yes

smoke tests:
Black Death:
D-Day:
non-canary:

missing-timing fail-closed:
PASS/FAIL

OFF regression:
PASS/FAIL

CANARY regression:
PASS/FAIL

rollback:
PASS/FAIL

hard invariants:
all zero / details

V3.5:
unchanged

routing implementation commit:
...

activation commit:
...

final tag:
...

activation record:
...

next action:
normal episode regeneration/publishing only when explicitly requested
```

Do not regenerate or publish episodes.

Continue autonomously through implementation, validation, and activation. Do not stop after the routing implementation if all activation gates pass.
