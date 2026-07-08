# Batch A — Characterization Tests Only

## Copy/paste prompt for Codex

You are implementing the first safe batch of the code-review follow-up plan.

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
- `docs/audits/code-review/test-gap-report.md`
- `docs/plans/code-review-follow-up/implementation-plan.md`
- `docs/plans/code-review-follow-up/tasks/task-01-characterization-tests.md`

## Batch scope

Implement **Task 01 — Characterization Tests** only.

This batch must lock current behavior before path, manifest, render, provider, remote, and legacy changes. Do not make production behavior changes except tiny test-helper/fake-provider support that is impossible to avoid.

## Priority test coverage

Add or update focused tests for:

1. Authored vs generated script path ownership:
   - canonical authored full scripts
   - generated runtime narration scripts
   - legacy `script.md` compatibility paths marked as legacy/generated, not canonical authored source

2. Generated image filename containment:
   - reject traversal such as `../x.png`
   - reject absolute filenames
   - reject nested paths unless an existing resolver explicitly permits portable relative paths
   - assert resolved output remains under `shared/images/generated` or `shared/short/images/generated`

3. Render input safety:
   - missing scene audio should be classified as an upstream-stage failure, not silently synthesized
   - subtitle/caption paths with FFmpeg filter metacharacters are covered by tests
   - absolute external shot source images are covered by tests

4. Provider and manifest boundary safety:
   - malformed image batch provider body
   - malformed scene generation manifest
   - malformed short scene manifest
   - upload selection prefers a manifest-owned artifact over stale scanned files

5. Remote rendering safety:
   - invalid remote job/result JSON is rejected or classified
   - partial remote result behavior is covered by a local fake/harness

6. Localization / image reuse identity:
   - short/shared portrait alias collision when visual intent differs
   - `pt` support mismatch is either characterized or explicitly documented as an unsupported-locale boundary

## Implementation rules

- Prefer passing characterization tests for existing behavior.
- For desired hardening behavior that currently fails and belongs to later tasks, use `it.todo` or a clearly skipped test with the CR ID, current behavior, desired behavior, and owning task.
- Do not silently weaken assertions to make current bugs look acceptable.
- Do not change production code to satisfy hardening expectations in this batch.
- Use temporary workspaces and fake providers. No live OpenAI, YouTube, FFmpeg production render, SSH, rsync, or remote render.

## Likely test files

- `packages/shared/src/episode-filesystem.unit.test.ts`
- `apps/cli/src/story-full-rewrite-command.unit.test.ts`
- `packages/story-localization/src/story-localization.unit.test.ts`
- `packages/image-generation/src/image-batch-service.unit.test.ts`
- `packages/image-generation/src/image-batch-planner.unit.test.ts`
- `packages/rendering/src/index.unit.test.ts`
- `packages/youtube-upload/src/index.unit.test.ts`
- `apps/cli/src/render-remote-shell.unit.test.ts`

## Verification

Run only focused changed test files, for example:

```bash
pnpm test:focused -- packages/shared/src/episode-filesystem.unit.test.ts
pnpm test:focused -- packages/image-generation/src/image-batch-service.unit.test.ts
pnpm test:focused -- packages/rendering/src/index.unit.test.ts
pnpm test:focused -- packages/youtube-upload/src/index.unit.test.ts
```

Do not run broad test/build/typecheck commands.

## Required final response

Report:
- changed test files
- CR IDs now covered
- focused commands run and result
- tests left as `todo`/skipped with exact owning future task
- any failures classified as current defects
- path of the written implementation report

Stop after this batch.
