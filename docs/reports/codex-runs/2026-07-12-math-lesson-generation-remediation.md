# Math lesson generation remediation

- Summary: Implemented R-005 with a strict fixture-backed generation port; explicit pacing, complexity, representation, and transfer semantics; structural near-duplicate and repeated-challenge rejection; approved number, geometry, and data candidates; and capability-filtered batch creation.
- Changed paths: `packages/math-education/src/{domain,lesson,orchestration}/`, package exports, `apps/cli/src/math-commands*`, math audits, and plan report.
- Tests: lesson/domain/planner/pipeline unit tests 13 passed; Python-backed simulation verified three candidates; CLI tests 3 passed; math package typecheck passed; Prettier and `git diff --check` passed.
- Commit: none; baseline `ac21261`.
- Risks: R-005 awaits independent acceptance. Localization text remains generic/place-value-oriented until R-006, although locked facts and verification remain correct. Only three skills are approved; all others are explicitly excluded. No paid provider or publishing action ran.
