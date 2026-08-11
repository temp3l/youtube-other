# Episode OpenAI cost summaries

Date: 2026-08-11
Commit: `c4e786f` baseline; no commit created.

Summary: Every episode-local terminal OpenAI debug call now atomically refreshes `openai-cost-summary.json`. The report counts paid attempts once, excludes pre-dispatch records, aggregates usage and estimated cost by model/operation, and leaves the total null when pricing or usage is incomplete. Source-grounded QA calls now use the same logger. A cache-only rebuild utility regenerated four existing episode summaries from 122 durable records (61 paid image calls) without provider replay.

Changed: `packages/shared/src/openai-cost-summary.ts`, debug logger/export/tests; QA composition/test; rebuild script; operator guide; four ignored episode-local summaries.

Checks: shared logger 8/8 passed; QA composition 4/4 passed after rebuilding stale shared output; shared build passed; CLI typecheck passed. Rebuild totals: L01-S01 $0.118570, L01-S02 $0.092980, L01-S03 $0.051535, L02-S01 $0.132055.

Risks: Values are usage-derived estimates, not invoices. Unknown models/service tiers fail cost completeness closed. Cross-process simultaneous summary writes remain last-writer atomic; the rebuild command reconciles from durable logs. Live OpenAI, TTS, and image calls: 0.
