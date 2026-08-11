# Episode ChatGPT Review Pack CLI

Date: 2026-08-11

## Changed files

- `apps/cli/src/episode-review-pack.ts`: added bounded episode evidence discovery, secret-aware copying, normalized ffprobe capture, temporary staging, ZIP-only output at `episodes/reviews/`, and archive validation.
- `apps/cli/src/episode-review-pack.unit.test.ts`: added offline media-exclusion, probe-failure, ZIP, and command-registration tests.
- `apps/cli/src/episode-commands.ts`: registered `episode review-pack`.
- `docs/development/commands.md`: documented command syntax, shared review-ZIP output, exclusions, and local tool requirements.
- `.gitignore`: explicitly ignored shared `episodes/reviews/` output.

## Tests and checks

- `pnpm test:focused -- apps/cli/src/episode-review-pack.unit.test.ts`: passed, 3 tests.
- `pnpm --filter @mediaforge/cli typecheck`: passed.
- `git diff --check`: passed before final report creation.
- `pnpm mediaforge -- episode review-pack ./episodes/l05-s01-you-dont-need-a-publisher/ --json`: after the focused CLI build, emitted the intended JSON result and generated a ZIP-only `READY` pack in `episodes/reviews/` with 60 included files and 16 successful media probes.

## Risks remaining

- Media quality that ffprobe cannot observe still requires listening/viewing outside ChatGPT.
- Corrupt media is recorded as a probe failure and yields a `PARTIAL` pack.
- ZIP creation requires local `zip` and `unzip` executables.

## Follow-up tasks

- Add optional derived contact sheets only if visual frame evidence is later required; do not add raw video payloads.
