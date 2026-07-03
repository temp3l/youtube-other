# Task 07 - Verification And Controlled Smoke

## Metadata

Task ID: Task 07  
Finding references: F1, F2, F3, F4, F5, F6  
Severity: blocker  
Dependencies: Task 01, Task 02, Task 03, Task 04, Task 05, Task 06  
Can run in parallel with: none  
Must not run concurrently with: any implementation task from this plan  
Likely affected packages: all changed packages from Tasks 01 through 06; primarily `@mediaforge/cli`, `@mediaforge/shared`, `@mediaforge/story-localization`, `@mediaforge/visual-planning`  
Likely affected files: verification report under docs or task evidence, no production code expected  
Estimated risk: medium  
Paid calls allowed: No

## Context

The audit recorded focused verification and blocked status. This task is validation-focused and must not introduce feature work. It should prove the final state after Tasks 01 through 06 and document any controlled smoke plan.

Relevant commands exist in root `package.json`:

- `pnpm test:focused -- <test-file>`
- `pnpm --filter @mediaforge/<package> typecheck`
- `pnpm typecheck`
- `pnpm lint`
- `pnpm test`
- `pnpm build`

Repository guardrails require focused checks first and broad checks only when explicitly authorized.

## Problem Statement

After implementation tasks land, the repo needs a staged verification record that distinguishes zero-cost checks from paid smoke and proves visual retention without permanently bypassing it.

## Goals

- Run staged zero-cost verification after implementation tasks.
- Document broad verification commands and results when authorized.
- Run four dry-run cells, four validation cells, and four shot-validation cells.
- Document a controlled no-upload smoke plan.
- Explicitly distinguish zero-cost verification from paid smoke requiring human authorization.
- Confirm no unintended paid calls occurred.

## Non-Goals

- Do not add feature work.
- Do not fix new failures in this task unless the user explicitly re-scopes it.
- Do not execute paid smoke without explicit authorization.
- Do not run YouTube upload.
- Do not run remote rendering without explicit authorization.
- Do not use `--no-visual-retention` as final visual-retention proof.

## Required Implementation Analysis

Before running broad commands:

- Read `AGENTS.md` and `docs/development/codex-verification-guardrails.md`.
- Inspect changed files since the implementation batch started.
- Identify directly affected test files.
- Confirm broad verification is explicitly authorized before running repo-wide typecheck, lint, tests, or build.
- Confirm provider credentials and upload commands will not be invoked.

## Implementation Steps

1. Run focused tests for changed behavior first.
2. Run changed-package typechecks.
3. If explicitly authorized, run repository-wide typecheck.
4. If explicitly authorized, run lint.
5. If explicitly authorized, run tests.
6. If explicitly authorized, run build.
7. Run four zero-cost `episode dry-run` cells.
8. Run four zero-cost `episode validate` cells.
9. Run four zero-cost `shots validate` cells.
10. Document a controlled paid smoke plan, but do not execute it without explicit authorization.
11. Confirm no YouTube upload, remote render, or paid provider calls occurred.

## Type-Safety Requirements

No production code is expected. If report tooling is added:

- No unnecessary `any`.
- Use readonly result data where appropriate.
- Use stable command/result statuses.

## Observability Requirements

Verification reports should include:

- command
- exit code
- affected package
- episodeSlug
- language
- variant
- artifactType
- validationCode where applicable

Do not include secrets or large manifests.

## Security And Path-Safety Requirements

- Use isolated output roots for any smoke plan.
- Do not write outside approved roots.
- Do not delete or overwrite authored content.
- Do not run upload commands.
- Do not run remote rendering without authorization.

## Tests

Staged verification:

1. Focused tests from Tasks 01 through 06.
2. Changed-package typechecks.
3. Repository-wide typecheck with authorization.
4. Lint with authorization.
5. Tests with authorization.
6. Build with authorization.
7. Four dry-run cells.
8. Four validation cells.
9. Four shot-validation cells.
10. Controlled no-upload smoke plan.

## Validation Commands

Focused examples, adjusted to changed files:

```bash
pnpm test:focused -- packages/story-localization/src/story-localization.unit.test.ts
pnpm test:focused -- packages/shared/src/episode-filesystem.unit.test.ts
pnpm test:focused -- apps/cli/src/episode-commands.unit.test.ts
pnpm test:focused -- apps/cli/src/shot-commands.unit.test.ts
pnpm test:focused -- packages/visual-planning/src/shot-planner.unit.test.ts
pnpm test:focused -- packages/visual-planning/src/shot-validation.unit.test.ts
```

Changed-package typechecks:

```bash
pnpm --filter @mediaforge/story-localization typecheck
pnpm --filter @mediaforge/shared typecheck
pnpm --filter @mediaforge/cli typecheck
pnpm --filter @mediaforge/visual-planning typecheck
```

Broad commands, only with explicit human authorization:

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

## Acceptance Criteria

- [ ] Focused tests pass.
- [ ] Changed-package typechecks pass.
- [ ] Broad checks are either passed with authorization or explicitly not run.
- [ ] Four dry-run cells pass.
- [ ] Four validation cells pass and do not report `dryRun: true`.
- [ ] Four shot-validation cells pass without `--no-visual-retention`.
- [ ] Controlled no-upload smoke plan is documented.
- [ ] No paid provider calls occurred unless separately authorized for smoke.
- [ ] YouTube upload was not run.
- [ ] Remote rendering was not run unless explicitly approved.

## Stop Conditions

Stop and report if:

- A broad command exposes unrelated failures.
- Paid execution would be required for verification.
- YouTube upload or remote render would be needed.
- Final visual-retention proof would require `--no-visual-retention`.
- Validation would require deleting or overwriting authored content.
- Broad generated-file churn appears.

## Commit Guidance

Suggested message:

```text
chore(validation): record post-refactor verification matrix
```

Include only verification evidence or report docs. Do not include feature fixes in this task.
