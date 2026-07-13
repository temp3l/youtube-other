# A-008 release gates

Summary: prepared A-008 evidence under explicit user gate override. Full C01-H04 matrix
was not green: 86 matrix cells identified; focused evidence passed for verifier,
localization, observability, affected build, packaged CLI, math curriculum validate/import,
and story/horror command startup. Remaining cells are skipped, not accepted.

Changed paths: this report and
`docs/reports/2026-07-13/math-genre-test-matrix-implementation-report.md`.

Commands: affected build for observability/math-education/CLI passed; `pnpm
test:cli-packaged` passed. Earlier same-run focused checks passed: Python verifier 48,
TS domain 6, adapter integration 17, observability 3, localization 9,
math-education typecheck.

Matrix: pass evidence 18 cells; skipped/unverified 68 cells; quarantines none.

Commit: not committed.

Risks: broad repo format/lint/typecheck/test, render/FFmpeg, full E2E simulation matrix,
publish gates, and H02/H03 regression suites were not run. A-008 is not release-accepted.
