# History review pack date-stamped filenames

## Summary

Default combined V3.5 approval-pack paths now include a UTC timestamp (`YYYY-MM-DD-HHmm`) so regenerated review packs do not overwrite prior bundles.

Example: `artifacts/chatgpt-review/history-approval-packs-v3.5-2026-08-08-1547-episodes-01-40.zip`

## Changed files

- `packages/history/src/history-episode-discovery.ts` — `formatHistoryApprovalPackTimestampV35()`, timestamped `defaultHistoryApprovalPackRangeOutput()`
- `packages/history/src/history-episode-discovery.unit.test.ts`
- `scripts/history-v35-combine-ten-episode-pack.mjs`

## Tests

- `pnpm test:focused -- packages/history/src/history-episode-discovery.unit.test.ts` — 3/3 pass

## Notes

- Explicit `--output` / third CLI positional still overrides the default.
- Date uses UTC (`YYYY-MM-DD-HHmm` from `toISOString()`).
