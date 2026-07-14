# Natural Educational Speech

Date: 2026-07-13  
Commit: working tree on `b67dd63` (not committed)

## Summary

Added the default `education-natural-teacher` profile, localized instructions/voices, semantic teaching beats, mathematical spoken-text normalization, versioned pronunciation dictionaries, structured pauses, conservative deterministic FFmpeg assembly, candidates, complete cache identity, bounded retries, workflow/resume telemetry, board synchronization, dry-run CLI, and EN/DE comparison fixtures. Generic and Dark Truth defaults remain unchanged.

## Changed paths

`packages/speech/src/*educational*`, speech request/cache/assembly/profile exports; `packages/math-education/src/{lesson,orchestration}`; `packages/educational-renderer`; `packages/config`; `apps/cli/src/math-commands.ts`; `config/speech-profiles`; `fixtures/educational-speech`; relevant architecture/CLI/config/error docs; package manifests/lockfile.

## Checks and results

Focused speech unit before final pause assertions: 8 passed. Fake-provider integration: 1 passed. Full build and final affected builds: passed. Final additions passed feature ESLint, diff/JSON/path checks, direct boundary checks, EN/DE read-only dry-runs, and a mock-provider real-FFmpeg smoke (48 kHz mono, final pause retained). Full unit gate: 1,153 passed, 50 unrelated failures, 5 todo; integration/e2e did not start. Full lint found 12 baseline errors; two touched-file errors were repaired and 10 unrelated errors remain.

## Risks and follow-up

Paid OpenAI listening was not run. Repair baseline image/story/rendering fixtures and lint, rerun broad validation, then perform the documented same-voice EN/DE listening comparison.
