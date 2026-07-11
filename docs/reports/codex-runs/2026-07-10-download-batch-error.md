Changed files:
- content-ideas/content/dark-truth-episodes/.batch/manifests/batch-slb-20260710034438503-001.manifest.json
- content-ideas/content/dark-truth-episodes/.batch/errors/batch-slb-20260710034438503-001.errors.jsonl
- content-ideas/content/dark-truth-episodes/batches/slb-20260710034438503-001/provider-batch.json
- docs/reports/codex-runs/2026-07-10-download-batch-error.md

Tests/checks run:
- `node apps/cli/bin/mediaforge.js stories batch download --run slb-20260710034438503-001`
- local file inspection with `sed`

Results:
- Downloaded remote batch error file for `slb-20260710034438503-001`.
- All 6 requests failed with HTTP `403`.
- Provider error code: `model_not_found`.
- Exact provider message: project lacks access to batch model `gpt-5.4-2026-03-05-batch`.

Risks remaining:
- Batch remains failed until rerun with a model the project can use for batch requests.

Follow-up tasks:
- Switch batch model configuration to an accessible batch-capable model, then resubmit episode `033`.
