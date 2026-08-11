# Typed semantic remediation wiring

Date: 2026-08-11

## Summary

Semantic remediation now carries a resolved typed visual mechanism and compatible typed action owner. `SEMANTIC_EXTRACTION` no longer re-infers mechanisms from advisor prose or copies the rejected mechanism; it routes through the existing remediation advisor. Invalid mechanism/owner pairs fail as remediation-unavailable before regeneration. Schema/instruction versions were bumped, invalidating only remediation-advisor cache identity.

## Changed files

- `packages/strategic-reinvention/src/positioning-visual-contracts.ts`
- `packages/strategic-reinvention/src/source-grounded-visual-qa.ts`
- `packages/strategic-reinvention/src/veronica-pre-image-semantic-gate.ts`
- Focused unit/integration tests for those modules
- This report

## Checks

- Source-grounded QA unit: 37 passed.
- Semantic-gate targeted unit: 2 passed.
- Remediation propagation integration: 1 passed.
- Strategic-reinvention typecheck, focused ESLint, and build: passed.

## Live verification

One bounded cached run made 4 new calls: 1 `gpt-5.4-mini`/low and 3 `gpt-5.6-terra`/medium. V01 advanced past `UNRESOLVED` with `work-expertise-separation`. The run then stopped at a newly exposed D01 mechanism/owner mismatch. The final typed compatibility fix was not rerun live. Episode cumulative usage is 11 calls and `$0.106068`; sequence QA did not run.

## Risk

Final owner/mechanism compatibility requires one future bounded live verification before production readiness can be claimed.
