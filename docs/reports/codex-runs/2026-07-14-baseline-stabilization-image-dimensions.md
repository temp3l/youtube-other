# Baseline Stabilization: Image Dimensions

## Summary

Continued Batch 1 through F09-F10. The shared-sync generated fixture now matches
its manifest-declared 1536x1024 size. Provider-output fixtures now use the live
canonical full-image size, 1536x864. F09 and F10 pass; no production behavior
changed. Batch 1 remains `IN_PROGRESS`.

## Changed files

- `packages/image-generation/src/episode-image-pipeline.sync-shared.unit.test.ts`
- `packages/image-generation/src/episode-image-pipeline.unit.test.ts`
- `docs/refactor/audit/README.md`
- This report.

## Tests/checks run and results

- Shared-sync unit file: failed once, then passed 1/1.
- Image-pipeline unit file: F10 failed before repair, passed afterward; the file
  then stopped at F11 after 22 passing tests.
- Targeted ESLint for both changed test files: passed.
- Targeted `git diff --check`: passed.

## Risks and follow-up

Exact remaining failure: `pnpm test:focused -- packages/image-generation/src/episode-image-pipeline.unit.test.ts`, test `reuses the previous scene image for merge-with-previous beats`; expected at least 8 provider calls, received 5. Classification: `STALE_FIXTURE`, likely the accepted ten-second reuse cadence. Owner: image-pipeline reuse expectations. Smallest follow-up: replace the raw call-count assertion with semantic generated/reused result and manifest assertions, then rerun this file. The two-repair limit was exhausted; Batch 2 remains blocked.
