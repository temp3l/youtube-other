# Execution Prompt - Task 05 Episode Validation Semantics

You are working in the existing TypeScript pnpm monorepo.

Read and follow:

- `AGENTS.md`
- `docs/plans/post-refactor-stability/tasks/task-05-episode-validation-semantics.md`

Goal:

Separate `episode dry-run` from `episode validate`. Dry-run must describe intended work. Validate must inspect existing artifacts and must not report itself as a dry-run.

Before editing:

- Inspect current repo state with `git status --short`.
- Confirm Task 04 is complete or that its artifact ownership decision is available.
- Inspect `apps/cli/src/episode-commands.ts`, `apps/cli/src/episode-commands.unit.test.ts`, `apps/cli/src/shots.ts`, and relevant exit-code handling.

Constraints:

- Make no paid provider calls.
- Do not implement Task 06 cross-manifest validation here.
- Do not remove dry-run behavior.
- Do not use `--no-visual-retention` as final acceptance proof.
- Avoid unrelated refactors.
- Commit only if the user explicitly asks.

Implementation requirements:

- Implement a typed validation report and stable result states.
- Validate canonical paths, schemas, language, variant, source identity, and legacy fallback attempts at this layer.
- Inspect existing CLI exit-code conventions before defining invalid-result exit behavior.
- Ensure `episode validate` output does not include `dryRun: true`.
- Add or update focused tests.
- Update the task document with implementation evidence only if that is the repository convention used by the session.

Focused validation:

```bash
pnpm test:focused -- apps/cli/src/episode-commands.unit.test.ts
pnpm test:focused -- apps/cli/src/shot-commands.unit.test.ts
pnpm --filter @mediaforge/cli typecheck
```

Zero-cost validation cells after implementation:

```bash
node apps/cli/bin/mediaforge.js episode validate --episode 022-the-whistler-in-the-woods --language en --artifact full --json
node apps/cli/bin/mediaforge.js episode validate --episode 022-the-whistler-in-the-woods --language de --artifact full --json
node apps/cli/bin/mediaforge.js episode validate --episode 022-the-whistler-in-the-woods --language en --artifact short --json
node apps/cli/bin/mediaforge.js episode validate --episode 022-the-whistler-in-the-woods --language de --artifact short --json
```

Stop and report if any stop condition in the task document is hit, especially conflicting exit-code conventions, unresolved artifact ownership, or any need for paid calls.

Final report:

- changed files
- tests run
- residual risks
- follow-up work
- confirmation that no paid calls were made
