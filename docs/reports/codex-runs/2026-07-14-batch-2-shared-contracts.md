# Batch 2 Shared Contracts and Error Taxonomy

## Changed files

- `packages/domain/src/index.ts`, `workflow-contracts.ts`, and focused tests.
- New `packages/workflow-engine/` package, tests, and lockfile importer.
- Batch status in `docs/refactor/02-safe-implementation-batches.md` and audit README.

## Tests/checks run and results

- Domain focused Vitest: 9 passed.
- Workflow-engine focused Vitest: 10 passed.
- Domain build: passed.
- Domain and workflow-engine typecheck: passed after correcting two exact-optional fields.
- Targeted ESLint: passed; targeted Prettier write/check and `git diff --check`: passed.

## Risks remaining

- No production caller uses the additive contracts yet; repository-wide validation was not run.
- Artifact kinds may require versioned extension as Batch 3 characterizes historical paths.

## Follow-up tasks

- Begin Batch 3 canonical artifact repository and resolver characterization.
