# Batch Orchestration Execution Checklist

## Goal

Convert the ten task files into a commit-safe execution sequence that can be implemented incrementally without leaving the production pipeline in an ambiguous state.

## Commit 01: Run State And ID Contracts

### Covers

- `task-01-batch-run-and-state-foundation`

### Scope

- add run-level schema and storage helpers
- add per-episode production-state summary shape
- define readable orchestration `custom_id` parsing and validation
- add status-mapping helpers from existing workflow/image/text batch states

### Files Likely Touched

- `packages/story-localization/src/story-workflow.types.ts`
- `packages/story-localization/src/story-workflow.schemas.ts`
- `packages/story-localization/src/story-workflow-store.ts`
- shared orchestration helper files

### Verification

```bash
pnpm test:focused -- packages/story-localization/src/story-workflow-batch.unit.test.ts
```

### Commit Gate

Do not proceed until state shapes are additive, test-covered, and clearly compatible with existing workflow manifests.

## Commit 02: Text Batch Planning And Submission Wrappers

### Covers

- `task-02-text-batch-plan-submit-download`

### Scope

- add `stories batch plan`
- add `stories batch submit`
- add `stories batch status`
- add `stories batch download`
- persist run-level `batch-plan.json`, `input.jsonl`, and `provider-batch.json`

### Files Likely Touched

- `apps/cli/src/story-localization-commands.ts`
- `packages/story-localization/src/story-localization-batch-service.ts`
- `packages/story-localization/src/story-localization-batch-storage.ts`

### Verification

```bash
pnpm test:focused -- packages/story-localization/src/story-localization.batch.integration.test.ts
```

### Commit Gate

Do not import any provider output in this commit. This commit is wrappers and persistence only.

## Commit 03: Text Batch Import, Validation, And Retry Seeds

### Covers

- `task-03-text-batch-import-normalize-validate`

### Scope

- add `stories batch import`
- add `stories batch validate`
- add `stories batch sync`
- write run-level import and validation reports
- record text-stage failure items and retry candidates

### Files Likely Touched

- `packages/story-localization/src/story-localization-batch-service.ts`
- `packages/story-localization/src/generated-story-validator.ts`
- `packages/story-localization/src/localized-content-text.ts`
- `packages/story-localization/src/story-workflow-store.ts`

### Verification

```bash
pnpm test:focused -- packages/story-localization/src/story-localization.batch.integration.test.ts
pnpm test:focused -- packages/story-localization/src/generated-story-validator.unit.test.ts
```

### Commit Gate

Do not proceed until import is idempotent, `custom_id`-based, and proven independent of provider output order.

## Commit 04: Production Gates And Ready/Blocked Status

### Covers

- `task-04-production-gates-and-status-cli`

### Scope

- add `stories production status`
- add `stories production next`
- add `stories production resume`
- add narrow blocked-reason propagation per episode/language/profile

### Files Likely Touched

- `apps/cli/src/story-pipeline-command.ts`
- `apps/cli/src/episode-commands.ts`
- `packages/story-localization/src/story-workflow-status.ts`
- `packages/story-localization/src/story-workflow-planner.ts`

### Verification

```bash
pnpm test:focused -- packages/story-localization/src/story-workflow-media.unit.test.ts
pnpm test:focused -- packages/story-localization/src/story-workflow.integration.test.ts
```

### Commit Gate

This commit must expose gating in one shared evaluation layer. Do not duplicate gate logic across wrappers.

## Commit 05: Scene Plan And Prompt Planning Boundary

### Covers

- `task-05-scene-plan-and-image-prompt-batching`

### Scope

- gate scene-plan generation on approved scripts
- persist scene plans before image work
- plan canonical full-image prompts from English full scene plans
- keep shorts prompt planning isolated from full assets

### Files Likely Touched

- `packages/story-localization/src/story-workflow-visual.ts`
- `packages/image-generation/src/episode-image-pipeline.ts`
- `packages/image-generation/src/image-batch-planner.ts`
- `packages/image-generation/src/shorts-image-strategy.ts`

### Verification

```bash
pnpm test:focused -- packages/story-localization/src/story-workflow-visual.unit.test.ts
pnpm test:focused -- packages/image-generation/src/image-batch-planner.unit.test.ts
```

### Commit Gate

Do not change image import or retry behavior in this commit.

## Commit 06: Resilient Image Batch Import And Retry Planning

### Covers

- `task-06-image-batch-resilient-import-and-retry`

### Scope

- add `stories images batch submit`
- add `stories images batch status`
- add `stories images batch sync`
- add `stories images batch retry-plan`
- write per-asset failure records, validation failures, and retry plans

### Files Likely Touched

- `apps/cli/src/images-batch-commands.ts`
- `packages/image-generation/src/image-batch-service.ts`
- `packages/image-generation/src/image-batch-storage.ts`
- `packages/image-generation/src/image-batch-identity.ts`
- `packages/image-generation/src/video-image-spec.ts`

### Verification

```bash
pnpm test:focused -- packages/image-generation/src/image-batch-service.unit.test.ts
pnpm test:focused -- packages/image-generation/src/video-image-spec.unit.test.ts
```

### Commit Gate

Do not proceed until one failed image is proven not to abort successful sibling imports.

## Commit 07: Output Blocking, Full-Image Reuse, And Render Readiness

### Covers

- `task-07-output-blocking-and-render-readiness`

### Scope

- add per-output readiness evaluation
- reuse canonical full images for localized full renders where valid
- keep short renders dependent on short image assets only
- surface blocked outputs cleanly for downstream stages

### Files Likely Touched

- `packages/story-localization/src/story-workflow-media.ts`
- `packages/image-generation/src/shorts-image-strategy.ts`
- `packages/rendering/src/index.ts`

### Verification

```bash
pnpm test:focused -- packages/story-localization/src/story-workflow-media.unit.test.ts
pnpm test:focused -- packages/image-generation/src/shorts-image-strategy.unit.test.ts
```

### Commit Gate

Do not add render wrapper behavior yet. This commit ends at readiness evaluation and blocking semantics.

## Commit 08: German Pre-TTS Validation And Audio Wrappers

### Covers

- `task-08-german-validation-and-audio-queue-integration`

### Scope

- add pre-TTS German cleanup validation
- add `stories audio generate`
- add `stories audio validate`
- persist audio failure and readiness state per output

### Files Likely Touched

- `packages/story-localization/src/localized-content-text.ts`
- `packages/story-localization/src/generated-story-validator.ts`
- `packages/speech/src/narration-pipeline.ts`
- `apps/cli/src/index.ts`

### Verification

```bash
pnpm test:focused -- packages/story-localization/src/localized-content-text.unit.test.ts
pnpm test:focused -- packages/story-localization/src/generated-story-validator.unit.test.ts
pnpm test:focused -- packages/speech/src/narration-pipeline.unit.test.ts
```

### Commit Gate

Do not route TTS through the OpenAI Batch API in this commit.

## Commit 09: Render Wrappers, Final Validation, And Repair Flow

### Covers

- `task-09-render-validation-and-repair-flows`

### Scope

- add `stories render`
- add `stories render validate`
- add `stories production repair`
- enforce `--only-ready`
- add final media validation and skipped-target reporting

### Files Likely Touched

- `apps/cli/src/index.ts`
- `packages/rendering/src/index.ts`
- `packages/speech/src/audio-validation.ts`
- `packages/image-generation/src/video-image-spec.ts`

### Verification

```bash
pnpm test:focused -- packages/image-generation/src/video-image-spec.unit.test.ts
pnpm test:focused -- packages/speech/src/narration-pipeline.unit.test.ts
```

### Commit Gate

Render wrappers must reject invalid prerequisites and must not regenerate missing upstream assets implicitly.

## Commit 10: High-Level Production Batch And Todo Views

### Covers

- `task-10-production-batch-orchestration-and-todo`

### Scope

- add `stories production batch`
- add `stories batch todo`
- produce operator-facing next-action summaries
- wire exact retry commands for failed and blocked outputs

### Files Likely Touched

- `apps/cli/src/story-pipeline-command.ts`
- `apps/cli/src/story-localization-commands.ts`
- `apps/cli/src/images-batch-commands.ts`
- `apps/cli/src/index.ts`

### Verification

```bash
pnpm test:focused -- packages/story-localization/src/story-workflow.integration.test.ts
```

### Commit Gate

This commit must remain a thin orchestrator over already-proven lower layers. If a lower layer is unstable, stop and fix it before landing the wrapper.

## Commit 11: Focused Final Verification And Operator Docs

### Covers

- targeted verification pass
- minimal doc sync for operator-facing commands if the implementation changed command surfaces

### Scope

- rerun only the directly affected focused test files
- run one affected-package typecheck if the code changes warrant it
- update CLI/operator docs only where command behavior actually changed

### Verification

```bash
git diff --check -- docs/plans/batch-orchestration docs/reports/codex-runs
```

### Commit Gate

Do not use broad repo-wide verification unless explicitly authorized.

## Stop Conditions

Stop the sequence and open a repair subtask if any of these happens:

- state ownership becomes ambiguous between workflow manifests and production-state summaries
- importer changes require weakening existing tests
- one failed image still aborts successful sibling imports
- wrapper commands start duplicating gate logic already owned by workflow helpers
- render wrappers attempt implicit upstream regeneration

## Recommended Working Rule

One commit should have one owner and one dominant risk:

- state contract
- text batch lifecycle
- text import/validation
- readiness gates
- visual planning
- image partial-failure handling
- readiness/blocking
- audio gating
- render gating
- high-level orchestration
