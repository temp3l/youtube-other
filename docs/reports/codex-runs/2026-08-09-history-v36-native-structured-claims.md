# History V3.6 native structured claims

Summary: Added deterministic native V3.6 proposition generation at the canonical claim boundary, a separately persisted/fingerprinted sidecar cache, native-first compatibility merge, the same eight representative fixtures, miss classification, and review artifact generation. V3.5 serialization and the V3.6 relation validator are unchanged. Live provider/LLM calls: 0.

Changed paths: `packages/history/src/v36/native-*`, `structured-claim-enricher-v36.ts`, `representative-shadow-extraction-v36.ts`, History exports, `scripts/generate-history-v36-native-structured-claims-review.ts`, and `docs/history/v3.6/structured-claim-architecture.md`.

Tests/checks: Phase 2.5 and final History typechecks passed; 102 focused V3.6 tests passed, including 45 golden fixtures; targeted ESLint and `git diff --check` passed; artifact checksums/ZIP integrity and deterministic repeat hash passed.

Results: 749 claims; 17 native claims; 18 native and 19 fallback propositions. Atomic 29→37; insufficient structure 70→61 (−9, 12.86%); candidates 42→45; validated relations 19→23. All hard invariants: 0. Historical all-40 native coverage remains unavailable; compatibility metrics remain unchanged.

Commit/tag: `3e3b99f0de99bfa9f75aa9262b0827b3424bdb64`, `history-v3.6-native-structured-claims-baseline`.

Artifact: `artifacts/shadow/history-v3.6/history-v3.6-native-structured-claims-review-20260809T143011Z.zip`; SHA-256 `4c788aecdb85153a651ee6d2903ee68585ac9eecbebecd2d3ec437f0cfa92937`.

Risk/follow-up: Pure process/temporal projection remains downstream work; do not add cross-claim proof here.
