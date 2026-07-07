# Task 07 Verification And Controlled Smoke Evidence

## 2026-07-07 Rerun Note

Current rerun evidence is recorded in
`docs/reports/2026-07-07/post-refactor-task-07-controlled-smoke.md`.
Focused tests and required package typechecks passed after a stale CLI migration
fixture budget fix and a CLI `process.env` type-only fix. The four dry-run
cells passed. The four `episode validate` cells still fail on stale repository
episode artifacts (`SOURCE_IDENTITY_MISSING`, `MISSING_ARTIFACT`). The four
`shots validate` cells run without `--no-visual-retention` but fail on stale or
invalid shot-plan artifacts (`STALE_SOURCE_IDENTITY` or validation errors). No
paid provider, upload, or remote render command was run.

Date: 2026-07-03

Scope:

- Changed tracked package: `@mediaforge/cli`.
- Required Task 07 packages checked: `@mediaforge/story-localization`, `@mediaforge/shared`, `@mediaforge/cli`, `@mediaforge/visual-planning`.
- Directly affected tests: story localization routing, authored script resolver identity, episode validation, shot commands, shot planning, shot validation, cross-manifest validator.
- Zero-cost confirmation: commands used local tests, TypeScript checks, `episode dry-run`, `episode validate`, and `shots validate`. No provider generation, YouTube upload, remote render, or paid smoke command was run.

## Verification Matrix

| Stage | Command | Exit | Result | Package | Episode / Language / Variant | Validation code | Notes |
| --- | --- | ---: | --- | --- | --- | --- | --- |
| 1 | `pnpm test:focused -- packages/story-localization/src/story-localization.unit.test.ts` | 0 | passed | `@mediaforge/story-localization` | n/a | n/a | 41 tests passed. |
| 1 | `pnpm test:focused -- packages/shared/src/episode-filesystem.unit.test.ts` | 0 | passed | `@mediaforge/shared` | n/a | n/a | 18 tests passed. |
| 1 | `pnpm test:focused -- apps/cli/src/episode-commands.unit.test.ts` | 0 | passed | `@mediaforge/cli` | n/a | n/a | 25 tests passed. |
| 1 | `pnpm test:focused -- apps/cli/src/shot-commands.unit.test.ts` | 0 | passed | `@mediaforge/cli` | n/a | n/a | 8 tests passed. |
| 1 | `pnpm test:focused -- packages/visual-planning/src/shot-planner.unit.test.ts` | 0 | passed | `@mediaforge/visual-planning` | n/a | n/a | 9 tests passed. |
| 1 | `pnpm test:focused -- packages/visual-planning/src/shot-validation.unit.test.ts` | 0 | passed | `@mediaforge/visual-planning` | n/a | n/a | 9 tests passed. |
| 1 | `pnpm test:focused -- apps/cli/src/episode-cross-manifest-validator.unit.test.ts` | 0 | passed | `@mediaforge/cli` | n/a | n/a | 9 tests passed. |
| 2 | `pnpm --filter @mediaforge/story-localization typecheck` | 0 | passed | `@mediaforge/story-localization` | n/a | n/a | Changed-package matrix requirement. |
| 2 | `pnpm --filter @mediaforge/shared typecheck` | 0 | passed | `@mediaforge/shared` | n/a | n/a | Changed-package matrix requirement. |
| 2 | `pnpm --filter @mediaforge/cli typecheck` | 0 | passed | `@mediaforge/cli` | n/a | n/a | Directly changed package. |
| 2 | `pnpm --filter @mediaforge/visual-planning typecheck` | 0 | passed | `@mediaforge/visual-planning` | n/a | n/a | Changed-package matrix requirement. |
| 3 | `node apps/cli/bin/mediaforge.js episode dry-run --episode 022-the-whistler-in-the-woods --language en --artifact full --json` | 0 | passed | `@mediaforge/cli` | `022` / `en` / `full` | n/a | Reported `dryRun: true`, expected for dry-run. |
| 3 | `node apps/cli/bin/mediaforge.js episode dry-run --episode 022-the-whistler-in-the-woods --language de --artifact full --json` | 0 | passed | `@mediaforge/cli` | `022` / `de` / `full` | n/a | Reported `dryRun: true`, expected for dry-run. |
| 3 | `node apps/cli/bin/mediaforge.js episode dry-run --episode 022-the-whistler-in-the-woods --language en --artifact short --json` | 0 | passed | `@mediaforge/cli` | `022` / `en` / `short` | n/a | Reported `dryRun: true`, expected for dry-run. |
| 3 | `node apps/cli/bin/mediaforge.js episode dry-run --episode 022-the-whistler-in-the-woods --language de --artifact short --json` | 0 | passed | `@mediaforge/cli` | `022` / `de` / `short` | n/a | Reported `dryRun: true`, expected for dry-run. |
| 3 | `node apps/cli/bin/mediaforge.js episode validate --episode 022-the-whistler-in-the-woods --language en --artifact full --json` | 1 | failed | `@mediaforge/cli` | `022` / `en` / `full` | `SOURCE_IDENTITY_MISSING`, `MISSING_ARTIFACT` | Status `invalid`; no `dryRun: true` reported. |
| 3 | `node apps/cli/bin/mediaforge.js episode validate --episode 022-the-whistler-in-the-woods --language de --artifact full --json` | 1 | failed | `@mediaforge/cli` | `022` / `de` / `full` | `SOURCE_IDENTITY_MISSING`, `MISSING_ARTIFACT` | Status `invalid`; no `dryRun: true` reported. |
| 3 | `node apps/cli/bin/mediaforge.js episode validate --episode 022-the-whistler-in-the-woods --language en --artifact short --json` | 1 | failed | `@mediaforge/cli` | `022` / `en` / `short` | `SOURCE_IDENTITY_MISSING`, `MISSING_ARTIFACT` | Status `invalid`; no `dryRun: true` reported. |
| 3 | `node apps/cli/bin/mediaforge.js episode validate --episode 022-the-whistler-in-the-woods --language de --artifact short --json` | 1 | failed | `@mediaforge/cli` | `022` / `de` / `short` | `SOURCE_IDENTITY_MISSING`, `MISSING_ARTIFACT` | Status `invalid`; no `dryRun: true` reported. |
| 3 | `node apps/cli/bin/mediaforge.js shots validate --episode 022-the-whistler-in-the-woods --locale en --variant full --format json` | 1 | failed | `@mediaforge/cli` | `022` / `en` / `full` | `MISSING_ARTIFACT` | Status `not-written`; missing `shot-plan.full.en.json`; no bypass flag used. |
| 3 | `node apps/cli/bin/mediaforge.js shots validate --episode 022-the-whistler-in-the-woods --locale de --variant full --format json` | 1 | failed | `@mediaforge/cli` | `022` / `de` / `full` | `MISSING_ARTIFACT` | Status `not-written`; missing `shot-plan.full.de.json`; no bypass flag used. |
| 3 | `node apps/cli/bin/mediaforge.js shots validate --episode 022-the-whistler-in-the-woods --locale en --variant short --format json` | 1 | failed | `@mediaforge/cli` | `022` / `en` / `short` | `MISSING_ARTIFACT` | Status `not-written`; missing `shot-plan.short.en.json`; no bypass flag used. |
| 3 | `node apps/cli/bin/mediaforge.js shots validate --episode 022-the-whistler-in-the-woods --locale de --variant short --format json` | 1 | failed | `@mediaforge/cli` | `022` / `de` / `short` | `MISSING_ARTIFACT` | Status `not-written`; missing `shot-plan.short.de.json`; no bypass flag used. |
| 4 | `pnpm typecheck` | n/a | not run | workspace | n/a | n/a | Authorization required for broad verification. |
| 4 | `pnpm lint` | n/a | not run | workspace | n/a | n/a | Authorization required for broad verification. |
| 4 | `pnpm test` | n/a | not run | workspace | n/a | n/a | Authorization required for broad verification. |
| 4 | `pnpm build` | n/a | not run | workspace | n/a | n/a | Authorization required for broad verification. |

## Controlled No-Upload Smoke Plan

Do not execute this plan without separate human approval.

Plan:

1. Use isolated output root `/tmp/mediaforge-task-07-smoke-022-en-full`.
2. Run one minimal cell only: episode `022-the-whistler-in-the-woods`, language `en`, variant `full`.
3. Set explicit cost ceiling before execution: maximum one provider-backed generation pass, hard cap `USD 1.00`; abort if the CLI cannot enforce or pre-estimate the ceiling.
4. Disable YouTube upload: do not run `youtube upload` or any `metadata:youtube` upload path.
5. Disable remote render: keep `REMOTE_RENDER_ENABLED=false`; remote render requires separate approval.
6. Capture evidence: command, environment flags, exit code, generated manifest paths, validation report paths, cost telemetry, and post-run `git status --short`.
7. Cleanup: remove only the isolated `/tmp/mediaforge-task-07-smoke-022-en-full` output root after evidence is copied into the approved evidence location.
8. Roll back/abort if cost exceeds ceiling, upload is requested, remote render is requested, authored episode content would be overwritten, validation requires `--no-visual-retention`, or more than one cell is needed.

## Residual Risks

- Episode `022` artifacts are stale against the Task 05/06 validation contract: generation manifests do not record resolver source identity.
- Visual-retention shot-plan artifacts are absent for all four checked language/variant cells.
- Broad workspace checks were not run because this session did not include explicit broad-verification authorization.
