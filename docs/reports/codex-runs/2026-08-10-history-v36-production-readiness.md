# History V3.6 production readiness

Summary: Added claim-anchored additive shadow visual plans, a disabled-by-default shadow routing seam, same-eight/all-40 census generators, and a compact production-readiness pack. Verdict: `READY_WITH_KNOWN_NONBLOCKING_TERMINAL_CASES`; production remains V3.5.

Changed paths: `packages/history/src/v36/visual-plan-shadow-v36*`, `packages/history/src/index.ts`, `scripts/history-v36-*visual-plan*`, `scripts/generate-history-v36-production-readiness.ts`, `docs/history/v3.6/visual-plan-shadow-boundary-audit.md`, journal, and shadow readiness artifacts.

Tests: focused Vitest 4/4; History typecheck; targeted ESLint; same-eight x2 (34/34 placed); all-40 x2 (103/103 placed); V3.5 hashes; activation rollback; checksums and ZIP integrity. Broad lint wrapper exposed 13 unrelated existing errors because it ignored file filters.

Commit hash: artifact input `8775f81b130bf6d94e4c8cac3968a8fc10734e77`; final readiness commit is identified by tag `history-v3.6-production-readiness-baseline`.

Unresolved risks: all 40 frozen plans require measured TTS/final-audio timing before per-episode production approval. Actual V3.6 production activation requires separate human approval.
