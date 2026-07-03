# Execution Prompt - Task 06 Cross-Manifest Integrity Validator

You are working in the existing TypeScript pnpm monorepo.

Read and follow:

- `AGENTS.md`
- `docs/plans/post-refactor-stability/tasks/task-06-cross-manifest-integrity-validator.md`

Goal:

Add cross-manifest referential-integrity validation after Tasks 03, 04, and 05 are complete. The validator must inspect only artifacts that exist in the current architecture and must avoid package dependency cycles.

Before editing:

- Inspect current repo state with `git status --short`.
- Confirm Tasks 03, 04, and 05 are complete or that their final contracts are available.
- Inspect package `package.json` dependency graph before choosing placement.
- Inspect current schemas and artifacts before defining exact validation cases.
- Use targeted file reads and avoid broad generated-tree searches.

Constraints:

- Make no paid provider calls.
- Do not generate or regenerate media artifacts.
- Do not add a monolithic validator when independent validators are appropriate.
- Do not reintroduce removed legacy pipeline behavior.
- Avoid unrelated refactors.
- Commit only if the user explicitly asks.

Implementation requirements:

- Choose placement that avoids dependency cycles. Do not put domain-aware validation in `@mediaforge/shared`.
- Add independent validators for actual artifact groups.
- Validate source identity, scene references, visual/shot references, image paths, narration references, render references, metadata references, schema versions, language, variant, and path safety where present.
- Wire results into `episode validate`.
- Add fixture coverage for valid and negative cases, adjusted to actual schemas.
- Update the task document with implementation evidence only if that is the repository convention used by the session.

Focused validation:

```bash
pnpm test:focused -- apps/cli/src/episode-commands.unit.test.ts
pnpm --filter @mediaforge/cli typecheck
```

If a new test file is added:

```bash
pnpm test:focused -- apps/cli/src/<new-validator>.unit.test.ts
```

If schema packages are changed:

```bash
pnpm --filter @mediaforge/domain typecheck
pnpm --filter @mediaforge/speech typecheck
pnpm --filter @mediaforge/metadata typecheck
pnpm --filter @mediaforge/rendering typecheck
pnpm --filter @mediaforge/visual-planning typecheck
```

Stop and report if any stop condition in the task document is hit, especially a dependency cycle, unsupported actual schema, broad fixture churn, or any need for paid calls.

Final report:

- changed files
- tests run
- residual risks
- follow-up work
- confirmation that no paid calls were made
