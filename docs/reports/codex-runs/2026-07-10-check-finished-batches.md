Changed files:
- content-ideas/content/dark-truth-episodes/.batch/batch-index.json
- content-ideas/content/dark-truth-episodes/.batch/manifests/batch-slb-20260710034438503-001.manifest.json

Tests/checks run:
- `pnpm stories:batches -- refresh`
- local index summary read with `node -e`

Results:
- Active batch `slb-20260710034438503-001` / `batch_6a5077e5d1b08190ba98b4ce6d1001b7` is `completed`.
- Provider reported `completedAt: 2026-07-10T05:12:16.000Z`.
- Request counts reported `total: 6`, `completed: 0`, `failed: 6`.

Risks remaining:
- Error output was not downloaded or imported; failure reasons remain in remote error file `file-TqbMX2KbNnXFtwxhgPFE5k`.

Follow-up tasks:
- Run batch download/import or retry workflow after reviewing the error file.
