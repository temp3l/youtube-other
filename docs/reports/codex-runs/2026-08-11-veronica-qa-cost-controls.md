# Veronica QA cost controls

Date: 2026-08-11
Commit: `c4e786f` baseline; no commit created.

Summary: Source-grounded QA is cache-only unless `--allow-paid-openai-qa` is supplied. That flag now selects hard format defaults: Short 4 calls/$0.40/1 flagship/60k input/15k output; full 10/$0.60/1/150k/40k. Every ceiling remains overrideable. The scheduler budgets every attempt, owns retries, reports spend, and negative-caches failures. SDK retries are zero.

Scene/advisor work is micro-batched (Short 7, long 5), while per-scene semantic cache identities remain unchanged. Deterministic repair diagnosis bypasses advisors. Remediation compares semantic judgement-input hashes, emits `REMEDIATION_NO_SEMANTIC_CHANGE`, preserves unaffected scene caches, rejudges only changed scenes, and defaults to one automatic round. Models and semantic policy were not changed.

Changed: QA scheduler/controller and tests; CLI composition, commands/tests, review-pack; strategic-reinvention operator guide.

Checks: controller/composition/review-pack tests: 42 passed; ceiling/composition tests: 5 passed; strategic build and CLI typecheck passed. Live OpenAI, TTS, image calls: 0.

Risk/follow-up: paid canaries remain unrun. Selected audio/artifacts were untouched; hashes/durations were not recomputed.
