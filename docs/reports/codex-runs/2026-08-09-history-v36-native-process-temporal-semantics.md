# History V3.6 native process/temporal semantics

Summary: Extended the accepted structured-claim boundary with typed `process-sequence` and `precedes` semantics, direct atomic projection, exact source authority, V2 schema/generator/cache invalidation, same-eight evidence fixtures, and a deterministic review artifact. V3.5 and the relation validator are unchanged; provider calls were 0.

Changed paths: `packages/history/src/v36/{structured-claim,structured-claim-enricher,native-structured-claim-*,atomic-claim-*}*`, generated contracts and evidence under `docs/history/v3.6/`, and `scripts/generate-history-v36-native-process-temporal-review.ts`.

Tests: History typecheck preflight/final passed; 109 focused V3.6 tests passed, including 45 golden fixtures; targeted ESLint, JSON/schema generation, same-eight deterministic repeat, invariants, checksums, and ZIP integrity passed.

Commit: `8e40dda55ec1f83162be21907b2194f01c8241c7`; tag `history-v3.6-native-process-temporal-baseline`.

Unresolved risks: Four new process/temporal atomic propositions intentionally remain candidate-projection gaps. Recommended follow-up: Phase 2.8 process/temporal candidate projection only.
