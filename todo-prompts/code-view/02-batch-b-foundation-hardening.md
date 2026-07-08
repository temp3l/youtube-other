# Batch B — Foundation Hardening: Paths, Manifests, Telemetry, Type Boundaries

## Copy/paste prompt for Codex

You are implementing the second safe batch of the code-review follow-up plan. Batch A must already be complete or explicitly accepted.

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
- `docs/audits/code-review/path-filesystem-audit.md`
- `docs/audits/code-review/type-safety-audit.md`
- `docs/audits/code-review/security-provider-boundary-review.md`
- `docs/audits/code-review/test-gap-report.md`
- `docs/plans/code-review-follow-up/implementation-plan.md`
- `docs/plans/code-review-follow-up/tasks/task-02-path-resolution-hardening.md`
- `docs/plans/code-review-follow-up/tasks/task-03-manifest-validation-hardening.md`
- `docs/plans/code-review-follow-up/tasks/task-04-type-safety-cleanup.md`

## Batch scope

Implement the safe foundation pieces of Tasks 02, 03, and 04:

1. Path resolution hardening
2. Manifest validation hardening
3. Telemetry redaction and small type-safety cleanup

Work sequentially inside this batch:
1. CR-003 telemetry redaction
2. CR-004 generated image filename containment
3. CR-001/CR-015 path ownership naming
4. CR-009/CR-017/CR-019 schema validation at file/provider/upload boundaries

## Task 04 focus — secret-safe telemetry

Implement telemetry argument redaction before process args are recorded.

Requirements:
- Redact bearer tokens and secret-like values from command args.
- Cover `Authorization: Bearer ...`, API-key style flags, token flags, secret env-like args, and adjacent value patterns.
- Preserve enough non-sensitive command context for debugging.
- Prefer a small pure redaction helper with focused unit tests.
- Replace `z.any()` with `z.unknown()` only where safe and locally covered.

Likely files:
- `packages/process-runner/src/index.ts`
- `packages/observability/src/telemetry.ts`
- `packages/metadata/src/youtube-metadata.ts`
- `packages/image-generation/src/openai-image.ts`
- `packages/domain/src/index.ts`

Focused verification:
```bash
pnpm test:focused -- packages/process-runner/src/index.unit.test.ts
pnpm test:focused -- packages/observability/src/telemetry.unit.test.ts
```

## Task 02 focus — path resolver containment and ownership

Requirements:
- Add or enforce named resolver APIs for:
  - authored scripts
  - generated narration/runtime scripts
  - locale runtime roots
  - shared generated images
  - legacy compatibility paths
- Validate generated shared-image filenames with basename/portable-relative checks.
- Assert containment before returning paths that will be written/read.
- Replace manual `script.md` path construction only where existing or Batch A tests cover behavior.
- Keep legacy compatibility opt-in and labelled. Do not remove legacy support in this batch.

Likely files:
- `packages/shared/src/episode-filesystem.ts`
- `packages/story-localization/src/canonical-full-story.persistence.ts`
- `packages/story-localization/src/story-localization.service.ts`
- `apps/cli/src/story-full-rewrite-command.ts`
- `apps/cli/src/story-localization-commands.ts`
- `packages/story-localization/src/short-rewrite.resolution.ts`

Focused verification:
```bash
pnpm test:focused -- packages/shared/src/episode-filesystem.unit.test.ts
pnpm test:focused -- apps/cli/src/story-full-rewrite-command.unit.test.ts
pnpm test:focused -- packages/story-localization/src/story-localization.unit.test.ts
```

## Task 03 focus — manifest and boundary validation

Requirements:
- Move JSON/file/provider boundaries from casts to `unknown` plus Zod schemas.
- Add owner-owned schemas for:
  - scene generation manifests
  - short scene manifests
  - image batch provider output bodies/lines
  - remote job/result structures if already touched here, otherwise leave remote-specific work for Batch D
  - upload selection inputs/manifests
- Keep filesystem scans only as explicit compatibility fallback APIs with metadata such as `legacyFallbackUsed`.
- Upload selection should prefer manifest-owned video artifacts over stale scanned `.mp4` files.

Likely files:
- `packages/image-generation/src/image-batch-service.ts`
- `packages/image-generation/src/image-batch.schemas.ts`
- `packages/rendering/src/index.ts`
- `packages/youtube-upload/src/index.ts`
- `packages/shared/src/episode-filesystem.ts`

Focused verification:
```bash
pnpm test:focused -- packages/image-generation/src/image-batch-service.unit.test.ts
pnpm test:focused -- packages/rendering/src/index.unit.test.ts
pnpm test:focused -- packages/youtube-upload/src/index.unit.test.ts
```

## Typecheck

After focused tests pass, run at most the most relevant package typecheck, for example:

```bash
pnpm --filter @mediaforge/shared typecheck
```

Only run another package typecheck if the first package was not the main changed package.

## Required final response

Report:
- changed files grouped by task
- CR IDs addressed
- focused tests and typecheck actually run
- any schemas added and boundaries now parsing `unknown`
- any legacy fallbacks still intentionally kept
- any TODOs deferred to Batches C/D/E
- path of the written implementation report

Stop after this batch.
