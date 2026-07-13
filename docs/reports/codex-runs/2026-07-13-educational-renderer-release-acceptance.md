# Educational renderer release acceptance

Date: 2026-07-13

## Changed files

- `packages/educational-renderer/package.json`
- `packages/educational-renderer/scripts/build.mjs`
- `packages/educational-renderer/scripts/package-acceptance.mjs`
- `pnpm-lock.yaml`
- Release-acceptance reports

## Checks and results

- Lockfile-only filtered offline install: exit 0; only the package importer changed.
- Clean build plus packed consumer: exit 0; archive, offline fresh install, exports, strict declarations, linked bin/help, preview render, and FFprobe video/audio/subtitle checks pass.
- Typecheck, lint, frozen offline lockfile verification, and `git diff --check`: exit 0.

## Risks and follow-up

Gate 1 is accepted. Spawned CLI ENOSPC and real process-death recovery acceptance remain incomplete; no CI workflow exists to extend. No committed artifacts, episode assets, production CLI, or pipeline integration were changed.
