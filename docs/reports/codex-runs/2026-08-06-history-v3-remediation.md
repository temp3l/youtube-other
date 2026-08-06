# History V3 remediation run

Summary: added an opt-in V3 history planner and redacted review-bundle exporter; regenerated plans and compact ZIPs for episodes 02–04.

Changed: `packages/history/src/visual-planner-v3.ts`, `history-review-bundle-v3.ts`, exports, History CLI wiring/tests, V3 plan artifacts, and `artifacts/chatgpt-review/`.

Checks: `pnpm --filter @mediaforge/history typecheck`; History build; CLI typecheck/build; focused Vitest (9 passed); targeted ESLint; ZIP integrity checks (4 passed).

Risks: V3 has estimated timing only, so all three plans remain non-approvable; factual source references are unresolved. Full-suite tests, property tests, LLM integration, and measured-audio reconciliation remain follow-up work.
