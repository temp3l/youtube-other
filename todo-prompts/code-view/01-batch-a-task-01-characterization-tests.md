# Common Codex Safety Rules

Use this prompt in Codex implementation mode from the repository root.

Before editing, read:

- `AGENTS.md`
- `docs/ai-context/context-pack.md`
- `docs/plans/code-review-follow-up/implementation-plan.md`
- The task files listed in this batch prompt

Hard constraints:

1. Do not run provider calls, paid API calls, YouTube uploads, remote rendering, fixture regeneration, broad builds, broad tests, broad lint, or broad typecheck unless explicitly approved.
2. Use focused tests only, exactly as listed in the task files, then at most one affected package typecheck after focused tests pass.
3. Do not edit generated media artifacts.
4. Do not revert unrelated dirty worktree changes.
5. Keep all changes task-owned, rollback-safe, and minimal.
6. Add or update tests before changing behavior whenever the task changes runtime behavior.
7. Stop if a failure is not clearly owned by the current batch.
8. At the end, write a report under `docs/reports/2026-07-08/code-review-follow-up/`.
9. Do not claim completion unless the verification commands were actually run.

Report format:

- Batch name
- Tasks executed
- Files changed
- Tests added or updated
- Verification commands run
- Pass/fail result
- Failure classification, if any
- Remaining risks
- Whether it is safe to proceed to the next batch

# Batch A: Task 01 — Characterization Tests

## Task file

- `docs/plans/code-review-follow-up/tasks/task-01-characterization-tests.md`

## Goal

Lock current behavior before any production code changes. This batch is tests-only unless a tiny test utility is required.

## Execution instructions

1. Inspect the task file and existing focused unit tests.
2. Add characterization tests for the highest-risk findings first:
   - authored vs generated script ownership
   - generated image path containment
   - legacy fallback labeling
   - missing scene audio behavior
   - subtitle path escaping
   - absolute shot source rejection
   - malformed provider output
   - short alias identity collisions
   - upload manifest-first selection
   - remote invalid result handling
3. Use temporary workspaces and fake clients only.
4. Do not call real OpenAI, FFmpeg, remote hosts, or YouTube.
5. Do not change production behavior in this batch.
6. If a characterization test exposes a current defect, keep the test and classify the failure in the report. Do not silently change source code to make the test pass unless the change is trivial test scaffolding.

## Allowed files

Prefer focused test files only, especially:

- `packages/shared/src/episode-filesystem.unit.test.ts`
- `apps/cli/src/story-full-rewrite-command.unit.test.ts`
- `packages/story-localization/src/story-localization.unit.test.ts`
- `packages/image-generation/src/image-batch-service.unit.test.ts`
- `packages/image-generation/src/image-batch-planner.unit.test.ts`
- `packages/rendering/src/index.unit.test.ts`
- `packages/youtube-upload/src/index.unit.test.ts`
- `apps/cli/src/render-remote-shell.unit.test.ts`

## Verification

Run focused tests for every changed test file:

```bash
pnpm test:focused -- <changed-test-file>
git diff --check -- <changed-paths>
```

## Required report

Create:

```text
docs/reports/2026-07-08/code-review-follow-up/batch-a-task-01-characterization-tests.md
```

The report must state whether it is safe to proceed to Batch B.

## Final Codex response

Return:

- changed files
- tests added
- exact commands run
- failing tests, if any
- current defect classifications, if any
- safe/not safe to proceed
