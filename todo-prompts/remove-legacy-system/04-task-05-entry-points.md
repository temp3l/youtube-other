# Codex Implementation Prompt

## Repository context

The implementation plan is located at:

```text
docs/plans/remove-legacy-and-normalize-paths/
```

Before changing code, read:

- `docs/plans/remove-legacy-and-normalize-paths/00-executive-summary.md`
- `docs/plans/remove-legacy-and-normalize-paths/16-risk-register.md`
- `docs/plans/remove-legacy-and-normalize-paths/18-implementation-order.md`
- `docs/plans/remove-legacy-and-normalize-paths/19-final-cleanup-checklist.md`
- every task file assigned in this prompt
- `AGENTS.md` and all repository-local instruction files

## Operating rules

Act as a senior TypeScript monorepo engineer performing a production-critical refactor.

- Work only on the tasks assigned in this prompt.
- Preserve active Dark Truth full-video and Short behavior.
- Keep strict TypeScript safety; avoid `any`, unsafe casts, duplicated schemas, and unvalidated path strings.
- Do not make paid OpenAI, image, speech, transcription, rendering, or other provider calls.
- Use mocks, fixtures, dry runs, and deterministic local tests.
- Do not weaken assertions or delete tests merely to make the suite pass.
- Do not update unrelated dependencies or reformat unrelated files.
- Do not delete production data.
- Do not silently resolve divergent files, ambiguous paths, external contracts, or migration collisions.
- Respect every human-review or rollout gate in the task documents.
- Inspect current code and searches before trusting assumptions in the plan.
- Do not commit unless repository instructions explicitly require it.

## Required workflow

1. Check the current branch and working tree.
2. Read all assigned task documents and relevant architecture documents.
3. Search for all affected imports, call sites, tests, fixtures, configuration, and documentation.
4. Write a concise implementation checklist in the Codex session.
5. Implement in the sequence specified below.
6. Run focused validation after each phase.
7. Stop rather than guessing when a stated approval or manual-review gate is missing.

## Final report

Report:

- files changed;
- behavior preserved and intentionally changed;
- validation commands and outcomes;
- searches performed and remaining matches;
- skipped checks and reasons;
- unresolved risks or required human decisions;
- the next safe task or batch.

# Task 05 — CLI, API, and worker entry points

## Model recommendation

Minimum: GPT-5.4
Best: GPT-5.5

## Assigned task

- `docs/plans/remove-legacy-and-normalize-paths/tasks/05-refactor-cli-workers-and-api-entry-points.md`

## Goal

Ensure all active runtime entry points use the new application use cases.

## Requirements

- Inventory CLI, API, worker, scheduled-job, and script entry points.
- Replace API boot through `@mediaforge/pipeline` with active config/application health.
- Route active CLI and worker handlers through typed use cases.
- Keep `--episode`, `--language`, and `--variant` explicit.
- Do not introduce silent defaults.
- Identify legacy public commands, but do not remove them unless approval is already explicit in repository planning.
- Where approval is absent, preserve only the minimum transitional boundary and report the decision needed for Task 09.
- Preserve startup failures, health behavior, and logging.
- Remove dependencies only when imports are actually gone; do not delete the pipeline package yet.

## Validation

```bash
pnpm --filter @mediaforge/api typecheck
pnpm --filter @mediaforge/cli typecheck
pnpm test:focused -- apps/cli/src/index.unit.test.ts
```

Run focused tests for any worker or API modules changed.
