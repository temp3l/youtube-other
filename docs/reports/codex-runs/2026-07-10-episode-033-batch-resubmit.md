Changed files:
- content-ideas/content/dark-truth-episodes/.batch/batch-index.json
- content-ideas/content/dark-truth-episodes/.batch/inputs/batch-slb-20260710192405075-001.jsonl
- content-ideas/content/dark-truth-episodes/.batch/manifests/batch-slb-20260710192405075-001.manifest.json
- content-ideas/content/dark-truth-episodes/033-it-always-comes-back/source/source-cleaned.md
- content-ideas/content/dark-truth-episodes/033-it-always-comes-back/source/source-cleaning-report.json
- docs/reports/codex-runs/2026-07-10-episode-033-batch-resubmit.md

Tests/checks run:
- `node apps/cli/bin/mediaforge.js stories localize --episode 033 --source-dir content-ideas/content/dark-truth-episodes --output-dir content-ideas/content/dark-truth-episodes --submit`
- `node apps/cli/bin/mediaforge.js stories localize --episode 033 --source-dir content-ideas/content/dark-truth-episodes --output-dir content-ideas/content/dark-truth-episodes --submit --force`
- `node apps/cli/bin/mediaforge.js stories batch submit --run slb-20260710192405075-001 --output-dir content-ideas/content/dark-truth-episodes`

Results:
- Fresh episode `033` batch prepared and submitted successfully.
- New local batch id: `slb-20260710192405075-001`.
- New provider batch id: `batch_6a51481224308190be720a7e7e2f159f`.
- Submission status: `submitted`.

Risks remaining:
- Batch completion and provider-side item results were not verified in this run.

Follow-up tasks:
- Refresh or download the new batch after completion and inspect/import results.
