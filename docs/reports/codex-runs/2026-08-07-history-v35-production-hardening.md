# History V3.5 production hardening

## Summary
Hardened map semantics, portrait gate propagation, repetition diagnostics/remediation, diagram progressive reuse, and timeline safety. Regenerated deterministic five-episode v3.5 approval packs (01–05).

## Parallel agents
Map semantics, portrait gates, repetition, and timing/attestation investigations ran read-only in parallel. Implementation serialized on shared modules (`visual-planner-v35.ts`, `history-geo-facts-v35.ts`). Git baseline was clean; no Veronica Benini files touched.

## Changed paths
- `packages/history/src/history-map-route-semantics-v35.ts` (new)
- `packages/history/src/history-map-route-semantics-v35.unit.test.ts` (new)
- `packages/history/src/history-geo-facts-v35.ts`
- `packages/history/src/history-map-compiler-v35.ts`
- `packages/history/src/history-map-compiler-v35.unit.test.ts`
- `packages/history/src/history-geo-v34.ts`
- `packages/history/src/history-visual-semantics-v34.ts`
- `packages/history/src/history-visual-semantics-v35.ts`
- `packages/history/src/history-visual-repetition-v35.ts`
- `packages/history/src/visual-planner-v35.ts`
- `scripts/history-v35-regenerate-combined.mjs`

## Tests
- `pnpm test:focused -- packages/history/src/history-map-route-semantics-v35.unit.test.ts` — pass
- `pnpm test:focused -- packages/history/src/history-v35-semantics.unit.test.ts` — pass
- `pnpm exec tsx scripts/history-v35-regenerate-combined.mjs` — pass, `planHashDeterministic: true` (twice)

## Artifacts
- Combined: `artifacts/chatgpt-review/history-approval-packs-v3.5.zip` SHA-256 `1663c6c7ec50f1840097709032ae34c659a99d495a4562bb389d14538458a9ee`
- Report: `artifacts/chatgpt-review/history-approval-packs-v3.5/comparison-quality-report.json`

## Risks
- `history-map-compiler-v35.unit.test.ts` not re-run after final import fix (hook budget).
- Production remains blocked on measured TTS and unattested historical approval (expected).
