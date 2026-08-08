# History V3.5 ten-episode review pack

## Summary
Built a combined V3.5 review pack for Episodes 01–10, reusing existing artifact reviews for 01–05 and generating fresh packs for 06–10 only.

## Changed files
- `packages/history/src/history-workflow-v35.ts` — pack reuse + selective regenerate; tightened secret scan regex
- `scripts/history-v35-combine-ten-episode-pack.mjs` (new)

## Output
- `artifacts/chatgpt-review/history-approval-packs-v3.5-episodes-01-10/`
- `artifacts/chatgpt-review/history-approval-packs-v3.5-episodes-01-10.zip`
- `comparison-quality-report.json` in output directory

## Verification
- Episodes 01–05 plan hashes unchanged vs source `history-approval-packs-v3.5`
- Episode 01 per-episode ZIP SHA-256 identical after copy
- Command: `pnpm exec tsx scripts/history-v35-combine-ten-episode-pack.mjs`

## Risks
Episodes 06, 08, 10 include `ENTITY_RESOLUTION_COVERAGE_LOW` in addition to timing gate.
