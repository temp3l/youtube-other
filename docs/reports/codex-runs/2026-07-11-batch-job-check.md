Summary: Checked pending batch work, refreshed remote status, and downloaded/imported ready story-localization batches. No story batches remain pending or ready. Two image batches for episode 022 were already downloaded earlier and both are completed with full failure.

Changed paths:
- `content-ideas/content/dark-truth-episodes/.batch/batch-index.json`
- `content-ideas/content/dark-truth-episodes/.batch/manifests/batch-slb-20260710034438503-001.manifest.json`
- `content-ideas/content/dark-truth-episodes/.batch/manifests/batch-slb-20260710192405075-001.manifest.json`
- `content-ideas/content/dark-truth-episodes/.batch/errors/batch-slb-20260710192405075-001.errors.jsonl`
- `content-ideas/content/dark-truth-episodes/.batch/reports/batch-slb-20260710034438503-001.summary.json`
- `content-ideas/content/dark-truth-episodes/.batch/reports/batch-slb-20260710192405075-001.summary.json`

Tests/checks:
- `pnpm mediaforge -- stories:batches pending`
- `pnpm mediaforge -- stories:batches ready`
- `pnpm mediaforge -- stories:batches refresh`
- `pnpm mediaforge -- stories:batches import-ready`
- `pnpm mediaforge -- stories:batches import --batch slb-20260710192405075-001`
- `pnpm mediaforge -- images batch status --episode 022-the-whistler-in-the-woods --batch slb-20260702224758079-001 --json`
- `pnpm mediaforge -- images batch status --episode 022-the-whistler-in-the-woods --batch slb-20260702224823372-001 --json`

Results: Story batch `slb-20260710034438503-001` failed 6/6 with `gpt-5.4-2026-03-05-batch` access denied. Story batch `slb-20260710192405075-001` failed 6/6 because `gpt-5.6-luna-batch` does not exist. Image batches `slb-20260702224758079-001` and `slb-20260702224823372-001` failed 75/75 with no access to `gpt-image-1`.

Risks/follow-up: Fix batch model configuration and/or project model entitlements before retrying. After that, rerun the failed work with `stories:batches retry-failed` or a fresh prepare/submit path, and use `images batch resume` for episode 022.

Commit: `96bc991b4f481e79eabaf0d4c4949f9ef50da7db`
