# Codex Prompt — Batch 05: Cross-Manifest Integrity Validation

You are working in the existing TypeScript pnpm monorepo.

Read and follow:

- `AGENTS.md`
- `docs/plans/post-refactor-stability/tasks/task-06-cross-manifest-integrity-validator.md`

Do not begin unless Tasks 03, 04, and 05 are complete, merged, and validated.

## Objective

Add zero-cost cross-manifest referential-integrity validation and integrate it with the stable `episode validate` report from Task 05.

## Before editing

1. Run `git status --short`; preserve unrelated changes.
2. Inspect final source descriptor, shot-validation, and episode-validation contracts.
3. Inspect package dependency graphs before selecting placement.
4. Inventory only actual current artifact schemas and paths using targeted reads.
5. Do not assume a planned manifest exists; verify it before implementing a validator.

## Placement rules

Prefer CLI-local/high-level validation unless an existing high-level package already owns the required dependencies.

Never place domain-aware validation in `@mediaforge/shared`.

Do not introduce a package cycle.

## Implementation requirements

Build small independent validators for artifact groups that actually exist, such as:

- source identity and story/localization output;
- scene plan;
- shot/visual plan;
- image manifest/assets;
- narration manifest/segments;
- render manifest/inputs;
- metadata;
- checkpoint/resume state.

For each applicable group:

- parse with existing schema-derived types;
- canonically resolve every referenced path under approved roots;
- reject path escapes and unsupported schema versions;
- compare language, variant, source identity/hash, scene IDs, image references, narration segment IDs, render inputs, and metadata references where exposed;
- return stable typed codes compatible with Task 05;
- avoid logging full manifests or generated text.

Aggregate results into `episode validate` without turning the implementation into one monolithic validator.

## Required tests

Use temporary workspaces/small fixtures for:

- valid `full/en`;
- valid `short/de`;
- missing scene;
- wrong language;
- wrong variant;
- stale source identity;
- unsupported schema version;
- path escape;
- missing image asset;
- unknown narration segment.

Add render, metadata, shot-source, and checkpoint cases only when current schemas support them.

## Constraints

- No provider calls.
- No media generation/regeneration.
- No legacy pipeline fallback.
- No broad fixture migration.
- No unrelated schema redesign.
- Do not commit unless explicitly requested.

## Validation

```bash
pnpm test:focused -- apps/cli/src/episode-commands.unit.test.ts
pnpm test:focused -- apps/cli/src/<new-validator-test-file>.unit.test.ts
pnpm --filter @mediaforge/cli typecheck
```

Run relevant package tests/typechecks only for packages actually changed.

## Stop conditions

Stop if:

- placement creates a dependency cycle;
- actual schemas materially contradict required cases;
- more than three unrelated fixtures require edits;
- broad architecture/schema changes are necessary;
- generated churn or paid execution is required.

## Final response

Report:

- validator placement rationale;
- artifact groups implemented and deliberately omitted;
- stable codes added/reused;
- changed files;
- tests/typechecks;
- residual risks;
- confirmation that no paid calls were made.
