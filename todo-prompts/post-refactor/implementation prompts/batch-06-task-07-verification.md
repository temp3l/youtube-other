# Codex Prompt — Batch 06: Final Verification and Controlled Smoke Plan

You are working in the existing TypeScript pnpm monorepo.

Read and follow:

- `AGENTS.md`
- `docs/development/codex-verification-guardrails.md`
- `docs/plans/post-refactor-stability/tasks/task-07-verification-and-controlled-smoke.md`

Do not begin unless Tasks 01–06 are complete.

## Objective

Perform staged zero-cost verification and produce evidence. Do not add feature work or silently fix failures.

## Before commands

1. Run `git status --short`.
2. Identify all changed packages and directly affected tests.
3. Confirm no command will invoke provider credentials, uploads, remote rendering, or paid generation.
4. Inspect repository verification guardrails.

## Stage 1 — Focused verification

Run the focused tests from Tasks 01–06, including any newly added validator test.

At minimum:

```bash
pnpm test:focused -- packages/story-localization/src/story-localization.unit.test.ts
pnpm test:focused -- packages/shared/src/episode-filesystem.unit.test.ts
pnpm test:focused -- apps/cli/src/episode-commands.unit.test.ts
pnpm test:focused -- apps/cli/src/shot-commands.unit.test.ts
pnpm test:focused -- packages/visual-planning/src/shot-planner.unit.test.ts
pnpm test:focused -- packages/visual-planning/src/shot-validation.unit.test.ts
```

## Stage 2 — Changed-package typechecks

```bash
pnpm --filter @mediaforge/story-localization typecheck
pnpm --filter @mediaforge/shared typecheck
pnpm --filter @mediaforge/cli typecheck
pnpm --filter @mediaforge/visual-planning typecheck
```

Also typecheck any other changed package.

## Stage 3 — CLI matrix

Run all 12 zero-cost cells from Task 07:

- four `episode dry-run`;
- four `episode validate`;
- four `shots validate`.

Requirements:

- validation output must not report `dryRun: true`;
- final shot proof must not use `--no-visual-retention`;
- capture command, exit code, language, variant, status, and validation codes;
- do not modify authored content to manufacture passing output.

## Stage 4 — Broad checks

Do not run these unless the user has explicitly authorized broad verification in the current session:

```bash
pnpm typecheck
pnpm lint
pnpm test
pnpm build
```

When authorization is absent, record them as “not run — authorization required,” not as failures.

## Controlled smoke plan

Document, but do not execute, a no-upload paid smoke plan containing:

- isolated output root;
- one minimal language/variant cell;
- explicit cost ceiling;
- disabled upload;
- disabled remote render unless separately approved;
- cleanup/evidence steps;
- rollback conditions.

Do not make paid calls in this batch.

## Stop conditions

Stop and report without fixing if:

- focused or broad commands expose unrelated failures;
- paid execution is needed;
- upload or remote rendering is required;
- verification depends on `--no-visual-retention`;
- authored content would need deletion/overwrite.

## Final response

Provide a verification table with:

- command;
- exit code;
- result;
- package;
- episode/language/variant;
- validation code;
- notes.

Also report:

- changed files/evidence docs;
- broad commands run or not run;
- controlled smoke plan location;
- residual risks;
- confirmation that no paid calls, upload, or remote render occurred.
