# Task 02 — Persistence, Resume, And Inspection

Implement only this task after Task 01. Reuse the existing Dark Truth artifact
and workflow infrastructure and follow this folder's `README.md`.

## Goal

Persist a byte-stable, versioned `horror-affect-plan.json` and make its state
inspectable and resumable without a provider call.

## Inspect First

- `packages/story-localization/src/horror-affect-plan.ts`
- `packages/story-localization/src/canonical-full-story.persistence.ts`
- `packages/story-localization/src/story-workflow-store.ts`
- `packages/story-localization/src/story-workflow-status.ts`
- `packages/story-localization/src/story-workflow-invalidation.ts`
- `packages/story-localization/src/story-localization.service.ts`
- `packages/story-localization/src/story-localization-batch-service.ts`
- `packages/story-localization/src/story-production-analysis.persistence.ts`
- `apps/cli/src/story-production-command.ts`
- `apps/cli/src/story-workflow-command-helpers.ts`

## Required Work

1. Define a strict persisted artifact envelope containing schema/strategy
   versions, source identity/hash, eligibility, rollout mode, plan or typed
   ineligibility reason, validation issues, plan hash, and creation metadata.
2. Reuse canonical JSON, atomic write, path resolution, and lineage conventions.
   Do not add an unrelated store abstraction.
3. Persist beside the canonical full-story planning artifacts using an explicit
   resolver; reject traversal and mismatched episode identity.
4. Make synchronous and batch paths produce byte-equivalent semantic artifacts
   for the same source and settings.
5. Resolve `missing`, `current`, `stale`, and `invalid` states locally. Explain
   staleness by changed dependency/version/hash.
6. On resume, reuse a current artifact and deterministically refresh a stale or
   invalid artifact. Legacy stories without the file must remain readable.
7. Add the state to existing story production status/inspection output. Human
   output should be concise; JSON output should be stable and typed.
8. Only `enforce` may let the plan hash alter downstream narration identity.
   Shadow artifact refresh must not invalidate accepted narration.

## Focused Verification

- Add persistence/store tests for canonical bytes, atomic replacement, malformed
  JSON, lineage mismatch, stale versions, and legacy absence.
- Add one sync/batch equivalence or service test.
- Add the exact CLI status/inspection unit test.
- Run at most three distinct focused test commands and one affected-package
  typecheck after they pass.

## Acceptance Criteria

- Inspection and resume never call a provider.
- Current plans are reused; stale/invalid plans are explained and refreshed.
- Shadow persistence changes no provider request or accepted narration cache.
- The artifact contains no secrets or model-generated prose.
- Existing canonical full and workflow artifacts remain compatible.
