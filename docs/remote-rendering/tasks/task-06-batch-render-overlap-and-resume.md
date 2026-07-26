# Task 06: Batch Render Overlap And Resume

## Objective

Increase lesson throughput while true hybrid scenes from one or more
render-ready lessons share global local/VPS lane budgets. Keep paid speech
generation and aggregate cost accounting serial and race-free.

## Inspect First

- Task 05 implementation and report
- `apps/cli/src/math-commands.ts`
- `packages/workflow-engine/src/workflow-operator.ts`
- `packages/workflow-engine/src/batch.ts`
- `packages/math-education/src/orchestration/batch.ts`
- Current canonical private batch tests and state contracts

## Implementation

1. Preserve the current paid-provider rate, retry, per-lesson ceiling, aggregate
   ceiling, and one-at-a-time speech generation.
2. Add a math-specific staged batch scheduler:
   - prepare one lesson through `math.render` readiness
   - enqueue its scene work into the global hybrid scheduler
   - prepare the next lesson while local and remote scene lanes run
   - finalize a lesson locally as soon as all nine fragments are validated
   - complete downstream quality, metadata, and publish-dry-run tasks locally
3. Never run two workflow tasks concurrently for the same unit. Use the
   workflow operator's unit lock and one operator instance per active unit.
4. Enforce global, not per-lesson, limits for local CPU slots, remote CPU slots,
   remote containers, transfers, and active render-ready lessons. A second
   lesson must not cause each hybrid renderer to assume it owns the whole host.
5. Schedule ready scenes across lessons by predicted earliest finish while
   preserving a bounded ready-lesson window. Do not let one long lesson starve
   finalization of another whose remaining scenes are short.
6. Persist an atomic math render-queue sidecar under the existing private batch
   state root. Record batch/item identity, phase (`preparing`, `rendering`,
   `finalizing`, terminal), every scene assignment/status, remote job ID,
   request fingerprint, shared image ID, attempts/reassignments, and timestamps.
7. On resume:
   - reconcile canonical workflow state first
   - reconcile exact remote result/status for rendering items
   - reuse succeeded validated outputs
   - continue running scene shards without duplication
   - retry or locally reassign only under Task 05 policy
   - never charge or submit paid speech twice
8. Keep `BatchCoordinator` authoritative for final item status. The sidecar is
   operational queue state, not a competing publication or quality source.
9. Handle cancellation by stopping new preparation, terminating owned remote
   containers where safely identifiable, syncing available diagnostics, and
   preserving resumable local/remote state.
10. Make partial outcomes explicit: one failed scene/lesson must not discard
    completed fragments or lessons, oversubscribe the surviving lane, or bypass
    aggregate cost enforcement.

## Required Tests

- Paid speech never exceeds concurrency one.
- Global local/remote slot and container counts never exceed configuration.
- Preparation overlaps both local and remote scene work in a deterministic
  fake-clock test.
- Per-unit workflow tasks never overlap.
- Resume from every persisted phase does not duplicate speech or scene work.
- Cost checks remain correct while remote promises complete out of order.
- Two hybrid lessons do not multiply host CPU budgets or starve final assembly.
- Cancellation and partial failure preserve completed results and resumable
  state.
- Job concurrency one remains compatible with existing serial batches.

## Focused Verification

1. Focused canonical private batch scheduler tests.
2. Focused CLI batch run/resume tests.
3. One affected-package typecheck after tests pass.

Do not run the real 37-lesson batch, providers, remote jobs, broad verification,
or publication.

## Acceptance

- Multiple render-ready lessons share bounded local and VPS lanes.
- At least one lesson can use local and remote lanes concurrently without
  preventing another ready lesson from progressing.
- Paid calls and cost mutations remain serial and exactly accounted.
- Resume never duplicates paid speech or a reconciled remote render.
- Completed items survive unrelated item failures.

## Stop Conditions

Stop if throughput requires parallel paid calls, weakening cost gates, concurrent
tasks for one unit, per-lesson oversubscription, or treating the render sidecar
as canonical quality evidence.
