# Codex Prompt — Batch 04: Episode Validation Semantics

You are working in the existing TypeScript pnpm monorepo.

Read and follow:

- `AGENTS.md`
- `docs/plans/post-refactor-stability/tasks/task-05-episode-validation-semantics.md`

Do not begin unless Task 04 is complete and its shot-plan ownership/status contract is available.

## Objective

Separate the commands semantically:

- `episode dry-run` describes intended work;
- `episode validate` performs read-only inspection of existing artifacts.

## Before editing

1. Run `git status --short`; preserve unrelated changes.
2. Review the merged contracts from Tasks 02–04.
3. Inspect:
   - `commandEpisodeDryRun`
   - `prepareEpisodeLanguage`
   - `commandEpisodeValidate`
   - command registration
   - CLI unit tests
   - shot validation and existing exit-code conventions.

## Implementation requirements

Create a readonly typed validation report with discriminated result states and stable validation codes.

At this layer, validate only the appropriate single-artifact/readiness concerns:

- canonical authored source location;
- resolver source identity/hash;
- expected language;
- expected variant;
- required manifest/artifact presence;
- package-local schema parsing;
- visual-retention status from Task 04;
- stale/legacy fallback attempts;
- root-contained paths.

Do not implement Task 06 cross-manifest referential integrity here.

Additional requirements:

- `episode validate` must not call `commandEpisodeDryRun`;
- validation must be read-only;
- output must not contain `dryRun: true`;
- valid returns exit 0 and invalid returns exit 1 unless an established CLI convention requires otherwise;
- parsing/path failures must become typed validation results where safe rather than unstructured crashes;
- add focused tests for valid, missing, stale identity, wrong language, wrong variant, legacy fallback, and path escape.

## Constraints

- No paid calls or generation.
- Preserve dry-run behavior.
- No `--no-visual-retention` acceptance path.
- No Task 06 implementation.
- No broad refactor.
- Do not commit unless explicitly requested.

## Validation

```bash
pnpm test:focused -- apps/cli/src/episode-commands.unit.test.ts
pnpm test:focused -- apps/cli/src/shot-commands.unit.test.ts
pnpm --filter @mediaforge/cli typecheck
```

Run the four zero-cost validation cells from the task document. Report real invalid statuses rather than mutating episode data merely to make them pass.

## Stop conditions

Stop if:

- Task 04 ownership is unresolved;
- exit-code conventions materially conflict;
- a dependency cycle appears;
- implementing validation requires unrelated architecture changes;
- paid execution or authored-content overwrite is required.

## Final response

Report:

- changed files;
- semantic difference between dry-run and validate;
- validation result/codes;
- focused tests and four-cell results;
- residual risks;
- Task 06 handoff notes;
- confirmation that no paid calls were made.
