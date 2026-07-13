# Release acceptance implementation report

- Source plan: `docs/plans/linux-math-renderer/01-release-acceptance.md`
- Date: 2026-07-13

## Summary and files changed

Gate 1 is accepted. `packages/educational-renderer/package.json` declares Node/pnpm assumptions and package-local clean-build, archive-acceptance, and CI-contract scripts. `scripts/build.mjs` removes only generated `dist` and build-info state. `scripts/package-acceptance.mjs` packs to `/tmp`, installs offline into a fresh consumer, and checks exports, declarations, linked bin, help, preview rendering, and FFprobe streams. `pnpm-lock.yaml` gained only the package importer through pnpm.

## Completion

- Completed: Gate 1, clean build layout, archive file/mode checks, lock importer, typecheck and lint.
- Partial: Gate 3 has deterministic fault-injection and lock tests, but no child-process kill test.
- Not completed: Gate 2 spawned CLI/ENOSPC acceptance; Gate 3 real process-death acceptance; Gate 4 isolated CI (the repository has no workflow directory).
- Deviation: did not add an unvalidated CI workflow or brittle compiled-source test harness.

## Checks and results

- `pnpm --filter @mediaforge/educational-renderer build && pnpm --filter @mediaforge/educational-renderer test:package`: exit 0.
- `pnpm --filter @mediaforge/educational-renderer typecheck`: exit 0.
- `pnpm --filter @mediaforge/educational-renderer lint`: exit 0.
- `pnpm install --frozen-lockfile --offline`: exit 0; `git diff --check`: exit 0.

## Risks and next steps

Complete spawned CLI and process-death tests before release. CI requires a repository workflow policy/location; the package `ci` command is the documented contract.
