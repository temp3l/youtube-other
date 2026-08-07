# History V3.5 review pack regeneration

## Summary
Regenerated four-episode V3.5 ChatGPT review packs with `regenerate: true` (fresh plans + approval bundles).

## Command
```bash
pnpm exec tsx scripts/history-v35-regenerate-combined.mjs
```

## Output
- Combined directory: `artifacts/chatgpt-review/history-approval-packs-v3.5/`
- Combined ZIP: `artifacts/chatgpt-review/history-approval-packs-v3.5.zip` (`f748c5ea…be7e`)
- Per-episode ZIPs under same directory (napoleon, rome, black-death, franklin `-v3.5.zip`)
- Corpus summary: `comparison-summary.md`, `comparison-quality-report.json`

## Determinism
`planHashDeterministic: true` (double-run check in script).

## Production blockers (expected for review)
All episodes: `EDITORIAL_REPETITION_THRESHOLD`, `TIMING_MEASUREMENT_REQUIRED`; Napoleon also `MAP_ROUTE_ACTOR_UNSUPPORTED`.

## Script change
`scripts/history-v35-regenerate-combined.mjs` imports from `packages/history/src` so tsx can run without a dist build.
