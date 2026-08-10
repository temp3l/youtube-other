# Codex run: V3.6 policy-response modality contract

## Changed files

- `packages/history/src/v36/explanatory-relation-v36.ts`, validator, golden adapter, bounded-LLM packet version, exports
- `packages/history/src/v36/policy-response-modality-contract-v36.ts` and focused tests
- V3.6 relation schema/contract docs, decision matrix/report, architecture/migration docs
- `scripts/generate-history-v36-policy-response-modality-review.ts`

## Tests/checks

- Preflight History typecheck: PASS
- Preflight Phase 2.13/2.14 and 45 golden fixtures: PASS
- Focused prototype: PASS (11)
- Focused affected suite: PASS (9 files, 125 tests)
- Final History typecheck: PASS
- Targeted ESLint: PASS
- Schema generation, deterministic same-eight repeat, no-admission controls: PASS

## Results

Option A selected. Relation schema V3 represents `uncertain/attempted` losslessly; V2 relations remain valid with deterministic `asserted/asserted` semantics and unchanged IDs/fingerprints. Production admission stays blocked. Candidates remain 52, validated relations 30, gaps 9. No provider/LLM calls.

## Risks/follow-up

Production cross-claim admission and validator evidence composition remain intentionally unimplemented. Recommended next task: design the bounded proof-to-validator evidence bridge before admission.
