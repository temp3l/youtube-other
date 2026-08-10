# History V3.6 global production activation

Summary: Added typed OFF/CANARY/GLOBAL routing at the live History production-composer seam, fail-closed measured-timing and artifact/hash gates, V3.6 production-plan persistence, reversible manifest routing, and activated GLOBAL. No episodes were regenerated or published.

Changed paths: `packages/history/src/v36/production-{canary-route,composer}-v36*`, `packages/history/src/{task-registry,index}.ts`, `.env.example`, V3.6 routing boundary doc, activation record, and this report.

Tests/checks: focused composer (5/5) and routing (5/5) Vitest; `@mediaforge/history` typecheck; targeted ESLint; V3.5 source isolation; baseline/tag resolution; rollback smoke; diff check.

Results: PASS. Black Death, D-Day, and measured non-canary Napoleon route V3.6 in GLOBAL; missing timing fails `TIMING_MEASUREMENT_REQUIRED`; OFF/CANARY and rollback pass; hard invariants zero.

Commit hashes: routing `c6847c7d14edce5acee1a271fea56daf0e3eecd2`; activation `5b75d3b3a7c3f8a27256c29e0f71e46847cf1406`.

Risks/follow-up: future GLOBAL runs remain intentionally blocked until measured timing and all V3.6 contracts pass. Regeneration/publication requires separate authorization.
