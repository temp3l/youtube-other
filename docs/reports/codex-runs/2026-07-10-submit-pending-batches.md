Summary: Submitted all non-empty prepared batches found in local batch state. Imported completed image batches after fixing raw provider output parsing for `error: null`. Episode 032 imported with partial failures: short 12/14 persisted, full 34/35 persisted. Episode 022 imports completed with 0/150 persisted because outputs did not match expected custom IDs. Text batch `slb-20260710034438503-001` remains `validating`.

Changed paths: `packages/image-generation/src/image-batch.schemas.ts`; `packages/image-generation/src/image-batch-service.unit.test.ts`; batch manifests/indexes/results/reports under `content-ideas/content/dark-truth-episodes`, `episodes/022-the-whistler-in-the-woods`, and `episodes/032-the-broadcast-that-cut-out`; generated imported images for episode 032.

Tests/checks: Ran `pnpm mediaforge -- images batch submit ...` for three image batches; ran `pnpm mediaforge -- stories batch submit ...` for one text batch; ran image batch status/download commands; ran `pnpm test:focused -- packages/image-generation/src/image-batch-service.unit.test.ts`; ran `pnpm --filter @mediaforge/image-generation build`; verified manifest statuses with `jq`.

Commit hash: Not committed.

Unresolved risks: Text batch `batch_6a5077e5d1b08190ba98b4ce6d1001b7` is still validating. Episode 032 has 3 retryable image failures. Episode 022 image outputs need custom-ID/state reconciliation before retrying. Two zero-item prepared manifests remain under `episodes/.batch`.
