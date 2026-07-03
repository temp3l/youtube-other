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

# Task 20 — Final repository cleanup and validation

## Model recommendation

Minimum: GPT-5.5
Best: GPT-5.5 with high reasoning

## Assigned task

- `docs/plans/remove-legacy-and-normalize-paths/tasks/20-final-repository-cleanup-and-validation.md`

## Goal

Perform the final gate only. Do not introduce features or broad refactors.

## Required work

1. Run all mandatory stale-reference searches.
2. Classify every remaining match as:
   - active and intentional;
   - migration-tool detection;
   - historical documentation intentionally retained;
   - false positive;
   - defect requiring cleanup.
3. Fix only defects within this plan.
4. Run focused unit tests and affected package typechecks.
5. Run the episode migration tool in dry-run mode.
6. Validate episode 022 English and German through full and Short dry-run/validation-only setup where supported.
7. Confirm no paid API calls are required or executed.
8. Produce final migration, release, and rollback notes.
9. Confirm the working tree contains no accidental generated artifacts, caches, credentials, or unrelated formatting.

## Validation

At minimum:

```bash
rg "script.md|en/full/script.md|de/full/script.md|@mediaforge/pipeline|createPipeline|legacy" .
pnpm test:focused -- packages/shared/src/episode-filesystem.unit.test.ts
pnpm test:focused -- apps/cli/src/index.unit.test.ts
pnpm --filter @mediaforge/cli typecheck
pnpm --filter @mediaforge/api typecheck
```

Also run the affected package typechecks and the migration dry-run. Do not start broad expensive test/build commands unless authorized by repository instructions.

## Final report requirements

Include:

- every remaining stale-search match and its classification;
- exact validation commands and results;
- episode 022 English/German full/Short status;
- release notes;
- rollback steps;
- known residual risks;
- explicit merge readiness verdict.
