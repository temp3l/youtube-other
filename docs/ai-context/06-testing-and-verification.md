# AI Context: Testing And Verification

## Install

- `pnpm install --frozen-lockfile`

## Common Commands

- Focused test: `pnpm test:focused -- <test-file>`
- Unit tests: `pnpm test:unit`
- Integration tests: `pnpm test:integration`
- E2E tests: `pnpm test:e2e`
- Full test suite: `pnpm test`
- Lint: `pnpm lint`
- Affected lint: `pnpm lint:affected`
- Typecheck: `pnpm typecheck`
- Affected typecheck: `pnpm typecheck:affected`
- Build: `pnpm build`

## Preferred Verification Pattern

- Docs-only task: path existence plus `git diff --check -- <changed-docs>`.
- Single source file: directly affected `*.unit.test.ts`, then package typecheck.
- CLI command change: focused CLI test plus affected package typecheck.
- Cross-package behavior: focused tests for each touched package, then one affected-package typecheck.

Do not run broad test/build/lint/typecheck unless explicitly authorized.

## Safe No-Paid CLI Checks

- `pnpm mediaforge -- episode dry-run --episode <id> --language en --artifact full --json`
- `pnpm mediaforge -- episode validate --episode <id> --language en --artifact full --json`
- `pnpm mediaforge -- stories pipeline --episode <id> --dry-run --json`
- `pnpm mediaforge -- render <id> --dry-run --profile youtube`
- `pnpm mediaforge -- thumbnails generate --episode-slug <id> --dry-run --json`

Prefer temporary output roots for experiments, for example `--output-root /tmp/mediaforge-<task>`.

## Known Slow Or Risky Checks

- Full `pnpm test`, `pnpm build`, full lint/typecheck are broad.
- Remote render commands require remote configuration.
- Provider-backed image, TTS, transcription, metadata, story generation, and YouTube upload can cost money or require secrets.
- `episode validate` and `shots validate` against repository episode `022-the-whistler-in-the-woods` are currently known to fail on stale/invalid artifacts per the 2026-07-07 smoke report.

## Verification Budget

Follow `AGENTS.md`: directly affected tests first, no unchanged failing reruns, at most three distinct test commands for one implementation context unless explicitly authorized.
