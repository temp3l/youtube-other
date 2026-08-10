# V3.6 policy-response admission contract

Summary: Added a proof-backed policy-response candidate and independent admission assessor for the sole validated Black Death proof. The candidate preserves uncertain/attempted premise modalities, but admission is correctly blocked because the current relation contract has no modality fields.

Changed paths: candidate/admission module and tests, public export, generated candidate schema, architecture note, review generator, and this report.

Tests/checks: History typecheck; 84 focused tests including 45 golden fixtures, Phase 2.12 projector and Phase 2.13 proof regressions; 12 individual admission-negative controls; targeted ESLint; diff check passed.

Risks/follow-up: No relation candidate is emitted. A future relation-contract decision would need explicit per-premise modality representation; relation validator, taxonomy, and V3.5 remain unchanged.
