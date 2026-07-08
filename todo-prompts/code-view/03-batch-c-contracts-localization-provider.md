# Batch C — Pipeline Contracts, Localization Asset Identity, Provider Boundary

## Copy/paste prompt for Codex

You are implementing the third safe batch of the code-review follow-up plan. Batches A and B must already be complete or explicitly accepted.

# Common Codex Operating Rules

Use this prompt from the repository root.

Before editing:
1. Run `git status --short`.
2. Read `AGENTS.md` if present.
3. Read only the relevant files under:
   - `docs/audits/code-review/`
   - `docs/plans/code-review-follow-up/implementation-plan.md`
   - the task files explicitly named in this prompt.
4. Do not overwrite unrelated user changes. If the worktree is dirty, only touch files required for this batch.

Hard constraints:
- Do not run broad commands: no `pnpm build`, no broad `pnpm test`, no broad `pnpm typecheck`, no fixture regeneration.
- Do not run paid/provider/live commands: no OpenAI calls, no YouTube upload, no remote render, no SSH/rsync to a live host.
- Do not edit generated media, archives, stale `dist` output, or unrelated docs.
- Prefer focused tests using `pnpm test:focused -- <test-file>`.
- After focused tests pass, run at most one affected package typecheck if the batch materially changes production TypeScript.
- Keep behavior changes behind tests from the same batch or from Batch 01.
- Use fakes/stubs for OpenAI, FFmpeg/process runners, remote worker/client, and YouTube.
- When a desired hardening behavior currently fails, do not hide it. Either fix it in the owning implementation task or document it as a blocked/failing expectation in the batch report.
- Do not continue into the next batch.

Required report:
- Because this work implements `docs/plans/code-review-follow-up/*`, create or update:
  `docs/reports/2026-07-08/code-review-follow-up-<batch-id>-implementation-report.md`
- Include: source task files, summary, changed files, tests/checks run, results, incomplete items, deviations, remaining risks, and next recommended batch.
- Never include secrets, tokens, full command logs, or full diffs in the report.


## Source documents to read

- `docs/audits/code-review/code-review-report.md`
- `docs/audits/code-review/finding-register.md`
- `docs/audits/code-review/pipeline-safety-audit.md`
- `docs/audits/code-review/security-provider-boundary-review.md`
- `docs/audits/code-review/type-safety-audit.md`
- `docs/audits/code-review/test-gap-report.md`
- `docs/plans/code-review-follow-up/implementation-plan.md`
- `docs/plans/code-review-follow-up/tasks/task-05-pipeline-stage-contracts.md`
- `docs/plans/code-review-follow-up/tasks/task-06-localization-asset-identity.md`
- `docs/plans/code-review-follow-up/tasks/task-07-batch-image-provider-boundary.md`

## Batch scope

Implement Tasks 05, 06, and 07 sequentially and conservatively:

1. Task 05 — pipeline stage contracts
2. Task 06 — localization asset identity
3. Task 07 — batch image provider boundary

Do not rewrite the entire CLI or the whole pipeline. This batch should introduce typed contracts and adapters incrementally.

## Task 05 focus — executable stage contracts

Requirements:
- Add typed stage input/output contracts with real dependency fingerprints.
- Replace synthetic workflow fingerprints where the needed input data is available.
- Add discriminated outcomes, such as:
  - `planned`
  - `skipped`
  - `cache-hit`
  - `started`
  - `completed`
  - `failed-retryable`
  - `failed-terminal`
- Store retryability and failure classification in workflow manifests.
- Keep CLI changes thin: command registration should delegate to application/service-level handlers where practical, without broad CLI rewrites.
- Implement at least the first executable stage boundary if full orchestration is too broad.
- Resume/status must detect changed inputs where Batch B has made hashes available.

Likely files:
- `apps/cli/src/story-pipeline-command.ts`
- `packages/story-localization/src/story-workflow-planner.ts`
- `packages/story-localization/src/story-workflow-store.ts`
- `packages/story-localization/src/story-workflow.schemas.ts`
- `apps/cli/src/index.ts`

Focused verification:
```bash
pnpm test:focused -- packages/story-localization/src/story-workflow.schemas.unit.test.ts
pnpm test:focused -- packages/story-localization/src/story-workflow-store.unit.test.ts
pnpm test:focused -- apps/cli/src/story-pipeline-command.unit.test.ts
```

## Task 06 focus — localized/full/short visual identity

Requirements:
- Add stable identity fields for shared/short visual aliasing:
  - episode slug
  - language
  - variant/full-or-short format
  - aspect ratio
  - story beat ID
  - shot ID where available
  - visual intent hash
  - prompt hash
  - dependency/source hash
  - source language
  - target language
  - asset purpose
- Prevent same-subject/same-output aliases from collapsing when visual intent differs.
- Centralize locale support or explicitly return unsupported-locale errors at boundaries, especially for `pt`.
- Preserve old cache reads only via explicit compatibility code.

Likely files:
- `packages/image-generation/src/image-batch-planner.ts`
- `packages/image-generation/src/image-batch-identity.ts`
- `packages/domain/src/shared-visuals.unit.test.ts`
- `packages/shared/src/episode-filesystem.ts`
- `packages/dark-truth/src/index.ts`

Focused verification:
```bash
pnpm test:focused -- packages/image-generation/src/image-batch-planner.unit.test.ts
pnpm test:focused -- packages/domain/src/shared-visuals.unit.test.ts
```

## Task 07 focus — batch image provider adapter

Requirements:
- Introduce an `ImageBatchProvider` interface for:
  - upload input file
  - create batch
  - retrieve batch/status
  - download output/error files
  - normalize provider statuses/errors
- Keep OpenAI JSONL mechanics and OpenAI-specific IDs/statuses in the adapter.
- Keep image orchestration in the service layer.
- Add branded provider IDs where useful:
  - `OpenAiBatchId`
  - `OpenAiFileId`
- Share strict base64/MIME/size/dimension validation between direct image generation and batch import.
- Keep reference-assisted edit batches blocked unless there is explicit paid verification approval. Do not enable live edit batches.

Likely files:
- `packages/image-generation/src/image-batch-service.ts`
- `packages/image-generation/src/image-batch-planner.ts`
- `packages/image-generation/src/openai-image.ts`
- `packages/story-localization/src/story-localization-openai-batch.ts`
- `packages/testing/src/openai-endpoint-guard.unit.test.ts`

Focused verification:
```bash
pnpm test:focused -- packages/image-generation/src/image-batch-service.unit.test.ts
pnpm test:focused -- packages/image-generation/src/openai-image.unit.test.ts
```

## Typecheck

After focused tests pass, run at most one affected package typecheck, for example:

```bash
pnpm --filter @mediaforge/story-localization typecheck
```

or:

```bash
pnpm --filter @mediaforge/image-generation typecheck
```

Choose the package with the largest production change. Do not run broad typecheck.

## Required final response

Report:
- changed files grouped by task
- stage contracts/outcomes added
- identity fields added and compatibility behavior
- provider adapter shape and remaining provider risks
- focused tests and typecheck actually run
- any unfinished orchestration stages
- path of the written implementation report

Stop after this batch.
