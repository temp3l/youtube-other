# Italian narration locale contract

Date: 2026-08-10

## Summary

Added Italian to the shared narration-artifact locale contract and its locale normalization paths. Existing Italian pacing settings were retained. History adapters, defaults, and workflow locale lists were unchanged.

## Changed paths

- `packages/speech/src/narration-schemas.ts`
- `packages/speech/src/spoken-narration.ts`
- `packages/speech/src/narration-segmentation.ts`
- `packages/speech/src/narration-schemas.unit.test.ts`
- `packages/speech/src/narration-pacing.unit.test.ts`

## Checks

- Focused narration schema and pacing tests: 26 passed.
- `pnpm --filter @mediaforge/speech build`: passed.
- Italian narration generation, assembly, and retimed slicing: passed.

## Risk / follow-up

Italian final rendering remains incomplete: the renderer repeatedly exited mid-clip without emitting a diagnostic, leaving partial clips and no final MP4. No more render retries were run. Resume by clearing only the stale Italian render lock and partial clips, then inspect renderer/process logs before retrying.
