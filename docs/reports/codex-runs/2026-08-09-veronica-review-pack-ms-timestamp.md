# Veronica review-pack millisecond timestamp

Summary: Added `generatedAtMs` Unix epoch milliseconds to the Veronica positioning bulk review envelope and CLI result. The timestamp is observational and excluded from deterministic plan/cache fingerprints and `reviewPackHash`.

Changed files: positioning visual result contract/planner/test, V2 positioning visual documentation, regenerated `content-packs/veronica-content-pack-1/visual-review/bulk-visual-review.json`, and its review ZIP.

Tests/checks: focused planner Vitest 12/12 pass; strategic-reinvention typecheck pass; targeted ESLint pass; regenerated pack field inspection pass (`generatedAtMs` `1786304544325`); ZIP integrity pass (`2edf3a53…d4aac`); `git diff --check` pass.

Risks/follow-up: review JSON bytes now intentionally differ across generations while semantic hashes and plan bytes remain stable. Commit: none (`7c87abc7886555587559bd1e018587ba6a8f90df`).
