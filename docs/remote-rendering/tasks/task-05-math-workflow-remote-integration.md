# Task 05: True Hybrid Math Workflow Integration

## Objective

Run one lesson's independent scene-video work on local and VPS Docker lanes at
the same time. Preserve local workflow ownership, canonical ordering, narration
privacy, strict evidence, final local assembly/QA, and per-scene fallback.

## Inspect First

- Tasks 01–04 implementations and reports
- `apps/cli/src/math-commands.ts`
- `apps/cli/src/math-workflow-runtime.ts`
- `packages/math-education/src/orchestration/canonical-task-adapters.ts`
- `packages/math-rendering/src/quality/media-qa.ts`
- Relevant config, CLI, workflow-runtime, and evidence tests

## Implementation

1. Add `--render-executor local|remote|hybrid` to canonical math production
   run/resume and batch run/resume. Precedence is:
   - explicit CLI option
   - `MEDIAFORGE_MATH_RENDER_EXECUTOR`
   - `local`
2. Preserve the current native local path for `local`. For `remote`, send every
   scene shard to the VPS and still assemble/mux locally. For `hybrid`, require
   the same immutable worker image locally and remotely and run both lane groups
   concurrently.
3. Require remote rendering to be enabled, a valid deployment receipt or
   explicit immutable image ID, strict host keys, and a successful compatible
   local/remote preflight for `remote` or `hybrid`.
4. Keep semantic component selection, fact binding, SVG creation, visual
   validation, narration ownership, timing, thumbnails, brand policy, workflow
   state, and canonical evidence local.
5. Build the nine scene work units locally. Inspect compatible cache state and
   load calibration from the deployment/benchmark receipt. If calibration is
   missing, run the bounded no-provider scene calibration before hybrid
   scheduling.
6. Estimate each scene/lane completion time as:
   - uncached raster samples divided by measured raster throughput
   - plus uncached frames divided by measured encode throughput
   - plus lane startup and, for remote work, estimated upload/download time
   Use the deterministic earliest-finish scheduler from Task 02. Do not
   alternate scenes or divide them 50/50 by count.
7. Start local and remote lane queues together. Collect scene results by scene
   ID while allowing either side to claim the next unstarted scene when a lane
   becomes free. Never render one scene on both sides speculatively.
8. Validate every fragment locally before assembly: request/image identity,
   hash, exact frame count, dimensions, 30 fps, H.264, yuv420p, no audio,
   compatible profile/level/time base, and successful decode.
9. Retry only transient SSH, transfer, timeout, capacity, or worker process
   failures. After bounded remote retries, requeue only the affected scene on a
   local Docker lane. Preserve all completed fragments. Do not requeue or fall
   back for schema, containment, image identity, request fingerprint,
   dependency hash, or result hash violations.
10. Once all nine fragments are valid, assemble them in canonical order locally,
    apply the existing narration treatment/reveal cue, mux narration once, run
    full packet/corruption QA, and atomically promote `final.mp4`.
11. Persist `renderExecution` provenance with mode, shared image ID,
    per-scene worker assignment, predicted/actual timings, cache status,
    attempts/reassignment, transfer bytes, overlap interval, assembly time, and
    fallback status. Exclude host address and private absolute paths.
12. Resume must reuse validated local/remote fragments, reconcile exact remote
    results, render only missing scenes, and never remux over a valid canonical
    final result.

## Required Tests

- CLI/config precedence and local default.
- Hybrid execution proves local and remote scene intervals overlap.
- Unequal fake scene costs are balanced by predicted finish time rather than
  scene count.
- Every scene appears exactly once in the assembled order.
- Remote success writes per-scene provenance and canonical output.
- Each retryable class retries within budget and reassigns only the failed scene.
- Each integrity/identity class fails closed without fallback.
- Fragment QA blocks bad dimensions, frame counts, codecs, time bases, audio
  streams, corruption, mixed image IDs, and wrong hashes.
- Final QA blocks bad duration, continuity, corruption, or missing narration.
- Interrupted local promotion leaves the prior final output untouched.
- Resume reuses valid fragments and does not duplicate scene work.
- Existing local production and story rendering behavior remain unchanged.

## Focused Verification

1. `pnpm test:focused -- apps/cli/src/math-workflow-runtime.unit.test.ts`
2. `pnpm test:focused -- apps/cli/src/math-commands.unit.test.ts`
3. One affected-package typecheck after tests pass.

Use fake transport and a short local fixture. Do not run paid speech, a
180–300-second render, real SSH, remote mutation, or publication.

## Acceptance

- Canonical production can select true hybrid execution without moving workflow
  authority, narration, final assembly, or quality gates.
- Local and VPS lanes execute different scenes concurrently.
- Valid fragments are independently validated before local ordered assembly.
- Fallback is per-scene, bounded, observable, and limited to transient failures.
- Resume and cache behavior remain idempotent.

## Stop Conditions

Stop if hybrid execution would require copying the whole workspace or audio,
mixing worker image IDs, trusting worker-selected destinations, duplicating
scenes speculatively, skipping local fragment/final validation, or treating an
integrity failure as retryable.
