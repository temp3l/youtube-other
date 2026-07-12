# Episode 033 Batch Retry

Summary: Prepared and submitted corrected retry batches for failed story batch `slb-20260710192405075-001`. The failed batch used `gpt-5.6-luna`; retry input uses `gpt-5.6-sol` for canonical full and `gpt-5.6-terra` for short/localization. A mixed-model retry failed validation, so requests were split into model-specific batches.

Changed paths: `.tmp/episode-033-batch-retry/input.jsonl`, `.tmp/episode-033-batch-retry/split/gpt-5.6-sol.jsonl`, `.tmp/episode-033-batch-retry/split/gpt-5.6-terra.jsonl`, `.tmp/episode-033-batch-retry/README.md`, `docs/reports/codex-runs/2026-07-12-episode-033-batch-retry-prepared.md`

Tests/checks: `jq -r '.custom_id + " " + .body.model' .tmp/episode-033-batch-retry/input.jsonl`; `wc -l` on retry and split inputs; OpenAI Models API access check; OpenAI batch submissions and status polls using `OPENAI_API_KEY` from `.env`.

Results: Mixed-model batch `batch_6a534fede7e481908c9e1440ce304d74` failed validation. Split batches `batch_6a535639c2f08190b6b2cd6d15d3fa3f` and `batch_6a53563b313c8190b7751913b243420e` are both `in_progress`.

Unresolved risks: Outputs are not imported yet; poll and download/import after completion.
