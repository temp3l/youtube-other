# V3.4 approval packs: real wall-clock timestamps

**Date:** 2026-08-07

## Summary

Removed fixed 1980-01-01 `utimes` stamping from V3.4 approval ZIP generation. Manifest `buildEpoch`, determinism report, and filesystem/ZIP mtimes now use wall-clock build time. Semantic determinism (`planHash`/`contentHash`) unchanged; byte-identical ZIPs no longer expected.

## Files changed

- `packages/history/src/history-workflow-v34.ts`
- `packages/history/test/acceptance/franklin-v34.acceptance.ts`

## Tests

`pnpm test:focused -- packages/history/test/acceptance/franklin-v34.acceptance.ts` — exit 0

## Note

V3.3 packs still use fixed epoch unless changed separately.
