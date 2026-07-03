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

# Tasks 17 + 18 — Tests, fixtures, documentation, and operations

## Model recommendation

Minimum: GPT-5.4 mini
Best: GPT-5.4

## Assigned tasks

- `docs/plans/remove-legacy-and-normalize-paths/tasks/17-update-tests-and-fixtures.md`
- `docs/plans/remove-legacy-and-normalize-paths/tasks/18-update-documentation-and-operations.md`

These cleanup tasks are safe to batch after Tasks 09–16 are complete.

## Phase 1 — Tests and fixtures

Classify tests as:

- active Dark Truth protection;
- legacy-only;
- shared behavior;
- stale layout assumption;
- migration coverage;
- obsolete;
- uncertain.

Then:

- update active tests to use the central resolver;
- update fixtures to canonical paths;
- remove only proven legacy-only tests;
- preserve migration-tool and rejection coverage;
- prefer semantic assertions over snapshots;
- do not weaken tests.

## Phase 2 — Documentation and operations

Update only relevant documentation:

- canonical full and Short script layout;
- resolver behavior and errors;
- supported CLI commands;
- migration utility and dry-run/write policy;
- rollback policy;
- manual data archival/cleanup;
- active architecture and operational runbooks;
- environment examples.

Remove obsolete pipeline and command documentation. Re-render diagrams only when their source changed and repository instructions permit it.

## Validation

```bash
pnpm test:focused -- packages/shared/src/episode-filesystem.unit.test.ts
pnpm test:focused -- apps/cli/src/index.unit.test.ts
rg "script.md|en/full/script.md|@mediaforge/pipeline|createPipeline|legacy" docs .env.example
```

Classify every remaining documentation match rather than blindly replacing all `script.md` text.
