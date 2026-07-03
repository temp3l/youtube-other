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

# Tasks 11 + 12 + 13 — Legacy generation, shared abstractions, API/events/queues

## Model recommendation

Minimum: GPT-5.4
Best: GPT-5.5

## Assigned tasks

- `docs/plans/remove-legacy-and-normalize-paths/tasks/11-remove-legacy-generation-components.md`
- `docs/plans/remove-legacy-and-normalize-paths/tasks/12-simplify-shared-abstractions.md`
- `docs/plans/remove-legacy-and-normalize-paths/tasks/13-remove-legacy-api-events-and-queues.md`

This batch is safe only after Tasks 09 and 10 are complete. Work in three reviewable phases.

## Phase 1 — Classify and remove legacy generation components

Classify every candidate as:

- active;
- test-only;
- legacy-only;
- uncertain.

Remove only proven legacy-only helpers. Preserve:

- active sync and batch image strategies;
- active remote rendering;
- active narration staging;
- current provider-specific implementations used through application use cases.

Do not replace removed orchestration with direct provider shortcuts.

## Phase 2 — Simplify shared abstractions

- Remove compatibility abstractions with no active consumer.
- Preserve validation that rejects legacy bad inputs such as `sp`.
- Remove stale generated-image, response-schema, and compatibility-path concepts only after searches prove they are unused.
- Rename interfaces only when it materially improves the active Dark Truth model.
- Avoid broad cosmetic renaming.

## Phase 3 — API, events, queues, and workflow contracts

- Search identifiers in all casing styles.
- Remove legacy-only API/event/queue/workflow contracts.
- Preserve active story workflow manifests unless replaced.
- Treat uncertain external contracts as blockers rather than deleting blindly.
- Document any remaining externally visible identifier.

## Validation

```bash
rg "generate-openai|original-transcript|audio/script-source|legacyGenerated" apps packages
rg "legacyGenerated|legacy-mixed|story-workflow-legacy" packages apps
rg "queue|event|workflow|createPipeline|pipeline_run|step_runs" apps packages docs
pnpm test:focused -- apps/cli/src/index.unit.test.ts
pnpm test:focused -- packages/shared/src/episode-filesystem.unit.test.ts
pnpm --filter @mediaforge/api typecheck
```

Run typechecks for all affected media and shared packages.
