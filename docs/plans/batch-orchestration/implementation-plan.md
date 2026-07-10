# Batch Orchestration Implementation Plan

## Objective

Introduce a resilient batch-first production orchestration layer that reuses the existing story, image, audio, and render modules instead of creating a second pipeline. The new work should sit on top of:

- `apps/cli/src/story-localization-commands.ts`
- `apps/cli/src/images-batch-commands.ts`
- `apps/cli/src/story-pipeline-command.ts`
- `apps/cli/src/episode-commands.ts`
- `apps/cli/src/index.ts`
- `packages/story-localization/src/story-localization-batch-service.ts`
- `packages/story-localization/src/story-localization-batch-storage.ts`
- `packages/story-localization/src/story-localization-openai-batch.ts`
- `packages/story-localization/src/story-workflow.types.ts`
- `packages/story-localization/src/story-workflow-store.ts`
- `packages/story-localization/src/generated-story-validator.ts`
- `packages/story-localization/src/localized-content-text.ts`
- `packages/image-generation/src/image-batch-service.ts`
- `packages/image-generation/src/image-batch-storage.ts`
- `packages/image-generation/src/image-batch-planner.ts`
- `packages/image-generation/src/image-batch-identity.ts`
- `packages/image-generation/src/openai-image-batch-provider.ts`
- `packages/image-generation/src/image-generation-config.ts`
- `packages/image-generation/src/video-image-spec.ts`
- `packages/speech/src/narration-pipeline.ts`
- `packages/speech/src/audio-validation.ts`
- `packages/speech/src/narration-pacing.ts`
- `packages/rendering/src/index.ts`
- `packages/shared/src/episode-filesystem.ts`

## Existing Reuse Strategy

| Area | Current repo capability | Reuse decision |
| --- | --- | --- |
| Text batch lifecycle | `story-localization-batch-service.ts` already supports prepare, submit, refresh, download/import, retry, `custom_id`-based reconciliation, and `imported_with_failures`. | Reuse with minimal extension. |
| Image batch lifecycle | `image-batch-service.ts` already supports provider batch submit/status/download/import, out-of-order reconciliation, per-item failure capture, and `imported_with_failures`. | Reuse with minimal extension. |
| Workflow state | `story-workflow.types.ts`, `story-workflow-store.ts`, `story-workflow-status.ts` already model stage state, failures, retryability, and batch linkage. | Wrap and extend. |
| Canonical paths | `episode-filesystem.ts` already defines canonical authored/runtime paths. | Reuse as-is. |
| Image dimension validation | `video-image-spec.ts` and `image-generation-config.ts` already distinguish generation size from render size and validate actual files. | Reuse as-is. |
| German cleanup validation | `localized-content-text.ts` and `generated-story-validator.ts` already detect German ASCII transliteration and locale leakage. | Reuse with minimal extension. |
| Audio queue | `narration-pipeline.ts` already provides staged queue-style preparation/generation/assembly/validation with pacing and duration checks. | Reuse as-is; do not batch through OpenAI Batch API. |
| Render validation | `packages/rendering/src/index.ts` already validates final render outputs. | Wrap and extend. |

## Target Persistence Model

Keep existing per-episode state as the source of truth and add a workspace-level audit trail:

```text
batches/<run-id>/
  batch-plan.json
  input.jsonl
  provider-batch.json
  output.jsonl
  errors.jsonl
  import-report.json
  validation-report.json
  retry-plan.json
  logs/
```

Imported artifacts still land in the existing episode structure:

- Canonical authored full script: `episodes/<slug>/languages/script-en.md`
- Canonical authored short script: `episodes/<slug>/languages/short/script-en.md`
- Runtime locale full script: `episodes/<slug>/locales/<lang>/full/script.md`
- Runtime locale short script: `episodes/<slug>/locales/<lang>/short/script.md`
- Shared full images: `episodes/<slug>/shared/images/generated/`
- Shared short images: `episodes/<slug>/shared/short/images/generated/`
- Audio: `episodes/<slug>/locales/<lang>/<variant>/audio/`
- Render output: `episodes/<slug>/locales/<lang>/<variant>/renders/<profile>/`
- Workflow state: `episodes/<slug>/state/story-workflow/workflows/<workflow-id>.json`

## Recommended Implementation Order

1. `task-01-batch-run-and-state-foundation`
2. `task-02-text-batch-plan-submit-download`
3. `task-03-text-batch-import-normalize-validate`
4. `task-04-production-gates-and-status-cli`
5. `task-05-scene-plan-and-image-prompt-batching`
6. `task-06-image-batch-resilient-import-and-retry`
7. `task-07-output-blocking-and-render-readiness`
8. `task-08-german-validation-and-audio-queue-integration`
9. `task-09-render-validation-and-repair-flows`
10. `task-10-production-batch-orchestration-and-todo`

## Task Dependency Graph

- `task-01` blocks all later tasks because it defines the shared run/state contracts.
- `task-02` depends on `task-01`.
- `task-03` depends on `task-02`.
- `task-04` depends on `task-01` and `task-03`.
- `task-05` depends on `task-04`.
- `task-06` depends on `task-01`, `task-04`, and `task-05`.
- `task-07` depends on `task-04` and `task-06`.
- `task-08` depends on `task-04`.
- `task-09` depends on `task-07` and `task-08`.
- `task-10` depends on `task-02` through `task-09`.

## Safe Sequential Batches

- Batch A: task 01 only.
- Batch B: tasks 02 and 03.
- Batch C: tasks 04 and 05.
- Batch D: tasks 06 and 07.
- Batch E: tasks 08 and 09.
- Batch F: task 10 and final verification.

## Commit-Grouped Execution Checklist

Use the tighter commit sequence in [execution-checklist.md](./execution-checklist.md). It groups the ten tasks into implementation-safe commits so shared state, importer behavior, gating, and operator CLI changes do not land half-finished.

## Tasks Safe To Parallelize

Only documentation and report preparation can run in parallel. Shared pipeline code should remain sequential because the same modules own state, retry semantics, and CLI contracts.

## Tasks That Must Not Be Parallelized

Do not parallelize:

- state schema changes with batch importer changes
- batch importer changes with retry-plan generation
- image provider boundary edits with render readiness logic
- audio gating changes with render gate changes
- orchestration CLI changes with underlying status model changes

## Verification Gates

- Start with directly affected focused tests.
- Prefer `pnpm test:focused -- <test-file>`.
- After focused tests pass, run at most one affected-package typecheck.
- For docs-only work, use `git diff --check -- <changed-docs>`.
- Do not call paid providers during verification.

## Rollback Guidance

Keep each task in a separate commit. Roll back by reverting the single task commit and its matching tests. Do not remove characterization coverage when reverting behavior changes.

## Task Index

- [Task 01](./tasks/task-01-batch-run-and-state-foundation.md)
- [Task 02](./tasks/task-02-text-batch-plan-submit-download.md)
- [Task 03](./tasks/task-03-text-batch-import-normalize-validate.md)
- [Task 04](./tasks/task-04-production-gates-and-status-cli.md)
- [Task 05](./tasks/task-05-scene-plan-and-image-prompt-batching.md)
- [Task 06](./tasks/task-06-image-batch-resilient-import-and-retry.md)
- [Task 07](./tasks/task-07-output-blocking-and-render-readiness.md)
- [Task 08](./tasks/task-08-german-validation-and-audio-queue-integration.md)
- [Task 09](./tasks/task-09-render-validation-and-repair-flows.md)
- [Task 10](./tasks/task-10-production-batch-orchestration-and-todo.md)
- [Execution Checklist](./execution-checklist.md)
