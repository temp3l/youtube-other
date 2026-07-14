# M2-007 data and diagrams

Summary: Added two pending-review German standard lessons with hashed datasets,
strict raw/tally reconciliation, exact chart derivation, per-cell/axis/bar fact
lineage, and an accessible dataset-bound bar-chart renderer. Production remains
review-evidence gated; probability is outside the slice.

Changed paths: math-education domain/artifact schemas, data content and wiring,
capabilities/localization/glossary, Python verifier, math-rendering component and
provider binding, two focused tests, and the M2-007 review packet.

Tests: data lesson/verifier file (1 passed); semantic bar-chart renderer file
(2 passed); `pnpm --filter @mediaforge/math-education typecheck` (passed).

Commit hash: not committed.

Unresolved risks: external curriculum/editorial review and registered evidence
remain outstanding; math-rendering package typecheck and provider/media rendering
were not run.
