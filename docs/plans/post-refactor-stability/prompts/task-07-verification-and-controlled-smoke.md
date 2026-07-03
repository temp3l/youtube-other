# Execution Prompt - Task 07 Verification And Controlled Smoke

You are working in the existing TypeScript pnpm monorepo.

Read and follow:

- `AGENTS.md`
- `docs/development/codex-verification-guardrails.md`
- `docs/plans/post-refactor-stability/tasks/task-07-verification-and-controlled-smoke.md`

Goal:

Run staged verification after Tasks 01 through 06 are complete. This task is validation-focused and must not introduce feature work.

Before running commands:

- Inspect current repo state with `git status --short`.
- Identify changed packages and directly affected test files.
- Confirm broad verification is explicitly authorized before running repo-wide typecheck, lint, tests, or build.
- Confirm provider credentials, upload commands, and remote rendering will not be invoked.

Constraints:

- Make no paid provider calls during zero-cost verification.
- Do not execute paid smoke unless the user explicitly authorizes it in this session.
- Do not run YouTube upload.
- Do not run remote rendering unless explicitly approved.
- Do not use `--no-visual-retention` as final visual-retention proof.
- Do not implement feature fixes in this task unless the user explicitly re-scopes it.
- Commit only if the user explicitly asks.

Staged zero-cost verification:

```bash
pnpm test:focused -- packages/story-localization/src/story-localization.unit.test.ts
pnpm test:focused -- packages/shared/src/episode-filesystem.unit.test.ts
pnpm test:focused -- apps/cli/src/episode-commands.unit.test.ts
pnpm test:focused -- apps/cli/src/shot-commands.unit.test.ts
pnpm test:focused -- packages/visual-planning/src/shot-planner.unit.test.ts
pnpm test:focused -- packages/visual-planning/src/shot-validation.unit.test.ts
pnpm --filter @mediaforge/story-localization typecheck
pnpm --filter @mediaforge/shared typecheck
pnpm --filter @mediaforge/cli typecheck
pnpm --filter @mediaforge/visual-planning typecheck
```

Broad verification, only after explicit human authorization:

```bash
pnpm typecheck
pnpm lint
pnpm test
pnpm build
```

Four dry-run cells:

```bash
node apps/cli/bin/mediaforge.js episode dry-run --episode 022-the-whistler-in-the-woods --language en --artifact full --json
node apps/cli/bin/mediaforge.js episode dry-run --episode 022-the-whistler-in-the-woods --language de --artifact full --json
node apps/cli/bin/mediaforge.js episode dry-run --episode 022-the-whistler-in-the-woods --language en --artifact short --json
node apps/cli/bin/mediaforge.js episode dry-run --episode 022-the-whistler-in-the-woods --language de --artifact short --json
```

Four validation cells:

```bash
node apps/cli/bin/mediaforge.js episode validate --episode 022-the-whistler-in-the-woods --language en --artifact full --json
node apps/cli/bin/mediaforge.js episode validate --episode 022-the-whistler-in-the-woods --language de --artifact full --json
node apps/cli/bin/mediaforge.js episode validate --episode 022-the-whistler-in-the-woods --language en --artifact short --json
node apps/cli/bin/mediaforge.js episode validate --episode 022-the-whistler-in-the-woods --language de --artifact short --json
```

Four shot-validation cells:

```bash
node apps/cli/bin/mediaforge.js shots validate --episode 022-the-whistler-in-the-woods --locale en --variant full --format json
node apps/cli/bin/mediaforge.js shots validate --episode 022-the-whistler-in-the-woods --locale de --variant full --format json
node apps/cli/bin/mediaforge.js shots validate --episode 022-the-whistler-in-the-woods --locale en --variant short --format json
node apps/cli/bin/mediaforge.js shots validate --episode 022-the-whistler-in-the-woods --locale de --variant short --format json
```

Controlled smoke:

- Document a no-upload smoke plan.
- Do not execute paid smoke unless explicitly authorized.
- If paid smoke is authorized, use an isolated output root and cost controls.
- YouTube upload remains prohibited unless the user explicitly scopes a separate upload task.

Stop and report if any stop condition in the task document is hit, especially unrelated broad failures, need for paid execution, upload requirement, remote render requirement, or reliance on `--no-visual-retention`.

Final report:

- changed files
- tests run
- residual risks
- follow-up work
- confirmation that no unintended paid calls were made
- confirmation that upload and remote render were not run
