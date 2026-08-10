# V3.6 candidate gap inventory

Summary: Added deterministic, claim-scoped Phase 2.9 inventory tooling for the frozen same-eight Phase 2.8 run. It records and validates all 12 gaps, fixed classifications, direct-projector eligibility, validator compatibility, risk controls, and a compact review ZIP. No candidate projector, V3.5 behavior, grounding, structured-claim, taxonomy, or validator semantics changed.

Changed paths: `packages/history/src/v36/candidate-gap-inventory-v36.ts`, its focused test, `packages/history/src/index.ts`, and `scripts/generate-history-v36-candidate-gap-inventory-review.ts`.

Tests/checks: History typecheck preflight and final typecheck passed. Focused inventory tests (2) passed. Phase 2.8 projector/native tests and 45-fixture golden relation coverage passed (70 tests). Targeted ESLint, repeat/hash, artifact checksums, and ZIP integrity are recorded by the final review artifact.

Risks/follow-up: One asserted `transforms` atom is mechanically eligible for a future causal candidate projector; four gaps require native structure, and the remainder must not be forced into projection. No Phase 2.10 work was performed.
