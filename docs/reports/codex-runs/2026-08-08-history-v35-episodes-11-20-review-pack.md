# History V3.5 episodes 11–20 review pack

## Summary
Built combined V3.5 review pack for Episodes 11–20. No prior artifact reviews existed for this range; all ten were freshly generated. Episodes 01–10 packs were not touched.

## Changed files
- `scripts/history-v35-combine-episodes-11-20-pack.mjs` (new)

## Output
- `artifacts/chatgpt-review/history-approval-packs-v3.5-episodes-11-20/`
- `artifacts/chatgpt-review/history-approval-packs-v3.5-episodes-11-20.zip`

## Verification
- `pnpm exec tsx scripts/history-v35-combine-episodes-11-20-pack.mjs` — exit 0, 10 episodes

## Risks
Several episodes report `ENTITY_RESOLUTION_COVERAGE_LOW` alongside `TIMING_MEASUREMENT_REQUIRED`.
