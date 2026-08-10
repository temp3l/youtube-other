# Veronica review-pack millisecond filenames

Summary: Added the envelope's Unix epoch-millisecond `generatedAtMs` to generated Veronica bulk review JSON filenames and regenerated the fixture ZIP with the same timestamp. The fixed JSON path remains a byte-identical latest-pack compatibility alias.

Changed files: positioning result contract/planner/test, V2 artifact documentation, regenerated review JSON, and timestamped ZIP.

Tests/checks: focused planner Vitest 12/12 pass; strategic-reinvention typecheck pass; targeted ESLint pass; filename/envelope equality inspection pass (`1786304678297`); ZIP integrity pass (`cfb591d0…4166`); `git diff --check` pass.

Risks/follow-up: timestamped JSON files intentionally accumulate by generation; semantic hashes and plan filenames remain stable. Commit: none (`7c87abc7886555587559bd1e018587ba6a8f90df`).
