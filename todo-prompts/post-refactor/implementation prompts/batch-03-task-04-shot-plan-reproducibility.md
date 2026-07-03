# Codex Prompt — Batch 03: Shot-Plan Reproducibility

You are working in the existing TypeScript pnpm monorepo.

Read and follow:

- `AGENTS.md`
- `docs/plans/post-refactor-stability/tasks/task-04-shot-plan-reproducibility.md`
- relevant visual-retention architecture/default documents referenced by that task.

## Objective

Make shot-plan creation and validation deterministic, zero-cost, path-safe, and reproducible for:

- `en/full`
- `de/full`
- `en/short`
- `de/short`

## Before editing

1. Run `git status --short`; preserve unrelated changes.
2. Confirm and account for the latest resolver identity changes from Tasks 02–03.
3. Inspect:
   - `apps/cli/src/shots.ts`
   - `apps/cli/src/shot-commands.unit.test.ts`
   - `packages/visual-planning/src/shot-planner.ts`
   - `packages/visual-planning/src/shot-validation.ts`
   - legacy shot-plan handling
   - resolver-owned path helpers.
4. Inspect episode 022 only through targeted reads/finds. Do not scan broad generated trees.

## Required design decision

Before creating production episode artifacts, determine and document whether shot plans are:

1. committed source assets;
2. reproducible derived artifacts; or
3. ephemeral outputs.

Prefer reproducible derived artifacts unless current architecture/docs clearly establish another owner. Do not commit episode 022 artifacts while ownership remains unresolved.

## Implementation requirements

- Add a deterministic zero-cost planning/reproduction path.
- Use resolver-owned canonical paths.
- Return a typed discriminated result with stable codes for:
  - valid;
  - missing artifact;
  - invalid schema;
  - stale source identity;
  - broken reference.
- Validate root containment for artifact and referenced image/scene paths.
- Add deterministic temporary-workspace tests for all four cells.
- Add negative fixtures for stale identity, broken reference, invalid schema, and path escape.
- Preserve readonly schema-derived result data.
- Do not hide failures behind generic exceptions.
- Do not use `--no-visual-retention` as proof.

## Constraints

- No provider calls.
- No image, narration, transcription, metadata, render, or video generation.
- No broad fixture churn.
- No unrelated validation work from Tasks 05 or 06.
- Do not commit unless explicitly requested.

## Validation

```bash
pnpm test:focused -- apps/cli/src/shot-commands.unit.test.ts
pnpm test:focused -- packages/visual-planning/src/shot-planner.unit.test.ts
pnpm test:focused -- packages/visual-planning/src/shot-validation.unit.test.ts
pnpm --filter @mediaforge/cli typecheck
pnpm --filter @mediaforge/visual-planning typecheck
```

Run shared resolver tests/typecheck if shared path helpers change.

Then run the four zero-cost shot-validation cells from the task document. Report their exact statuses; do not alter authored content just to force green results.

## Stop conditions

Stop if:

- artifact ownership cannot be resolved;
- more than three production artifacts need manual edits;
- a dependency cycle appears;
- broad generated churn occurs;
- paid generation is required.

## Final response

Report:

- artifact ownership decision;
- changed files;
- validation state model/codes;
- tests and four-cell results;
- residual risks;
- follow-up work;
- confirmation that no paid calls were made.
