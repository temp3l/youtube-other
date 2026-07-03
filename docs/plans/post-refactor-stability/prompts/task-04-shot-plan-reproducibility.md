# Execution Prompt - Task 04 Shot-Plan Reproducibility

You are working in the existing TypeScript pnpm monorepo.

Read and follow:

- `AGENTS.md`
- `docs/plans/post-refactor-stability/tasks/task-04-shot-plan-reproducibility.md`

Goal:

Make visual-retention shot-plan validation reproducible without paid provider calls, while resolving whether shot plans are committed source assets, reproducible derived artifacts, or ephemeral outputs.

Before editing:

- Inspect current repo state with `git status --short`.
- Inspect `apps/cli/src/shots.ts`, `apps/cli/src/shot-commands.unit.test.ts`, `packages/visual-planning/src/shot-planner.ts`, `packages/visual-planning/src/shot-validation.ts`, and `packages/shared/src/episode-filesystem.ts`.
- Inspect only relevant visual-retention docs and targeted episode 022 paths.
- Do not broadly search generated trees.

Constraints:

- Make no paid provider calls.
- Do not generate paid AI images, narration, transcription, metadata, or video.
- Do not commit episode 022 artifacts until artifact ownership is explicitly decided.
- Do not use `--no-visual-retention` as final acceptance proof.
- Avoid unrelated refactors.
- Commit only if the user explicitly asks.

Implementation requirements:

- Support `en/full`, `de/full`, `en/short`, and `de/short`.
- Provide precise statuses for valid, missing artifact, invalid schema, stale source identity, and broken reference.
- Use deterministic fixtures and temporary workspaces for tests.
- Use canonical resolver-owned paths.
- Add path-safety coverage where manifests or image paths are read.
- Update the task document with implementation evidence only if that is the repository convention used by the session.

Focused validation:

```bash
pnpm test:focused -- apps/cli/src/shot-commands.unit.test.ts
pnpm test:focused -- packages/visual-planning/src/shot-planner.unit.test.ts
pnpm test:focused -- packages/visual-planning/src/shot-validation.unit.test.ts
pnpm --filter @mediaforge/cli typecheck
pnpm --filter @mediaforge/visual-planning typecheck
```

Zero-cost CLI cells after implementation:

```bash
node apps/cli/bin/mediaforge.js shots validate --episode 022-the-whistler-in-the-woods --locale en --variant full --format json
node apps/cli/bin/mediaforge.js shots validate --episode 022-the-whistler-in-the-woods --locale de --variant full --format json
node apps/cli/bin/mediaforge.js shots validate --episode 022-the-whistler-in-the-woods --locale en --variant short --format json
node apps/cli/bin/mediaforge.js shots validate --episode 022-the-whistler-in-the-woods --locale de --variant short --format json
```

Stop and report if any stop condition in the task document is hit, especially unresolved artifact ownership, broad generated-file churn, or any need for paid generation.

Final report:

- changed files
- tests run
- residual risks
- follow-up work
- confirmation that no paid calls were made
