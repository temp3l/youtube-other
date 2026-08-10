# History V3.6 process/temporal candidate projection

Summary: Added claim-local `process-sequence -> process` and `precedes -> temporal-sequence` candidate projection with exact atomic/structured lineage, fail-closed modality handling, and non-authoritative process grouping metadata. Corrected V3.5 annotated-tag provenance to distinguish the tag object from its peeled commit. Same-eight results: candidates 45→49, validated 23→27, process 0→2, temporal 0→2, candidate gaps 16→12. V3.5, StructuredClaim/atomic semantics, relation identity/evidence, and the validator are unchanged.

Changed paths: `packages/history/src/v36/{atomic-relation-candidate-projector,representative-shadow-extraction,native-structured-claim-experiment,review-provenance}*`, focused V3.6 tests, `packages/history/src/index.ts`, two V3.6 docs, and Phase 2.7/2.8 review generators.

Tests/checks: History typecheck passed; 115 focused tests passed, including 45 golden fixtures; targeted ESLint passed; same-eight deterministic hashes matched; all safety invariants were zero; provenance schema, checksums, and ZIP integrity passed.

Commit: `83b352380fb913a1792a174cc5925936bab55ea2`; tag `history-v3.6-process-temporal-candidate-baseline`.

Artifact: `artifacts/shadow/history-v3.6/history-v3.6-process-temporal-candidate-review-20260809T155632Z.zip` (`ae4121ed39c4796ab00d09b0d42d9e3f0d2740dea4ecf563e621cb0b94558e5e`).

Risks/follow-up: 12 unrelated candidate-projection gaps remain. Next: design a bounded Phase 2.9 decision for those non-process/non-temporal gaps.
