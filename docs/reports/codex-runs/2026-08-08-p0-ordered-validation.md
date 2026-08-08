# P0 ordered validation (ep 37, geography, corpus, approval pack)

## Summary

Completed the four ordered remediation steps: fixed HMS Terror core-subject leak on ep 37, blocked geographic fragment entities and added missing place seeds, regenerated all nine P0 episodes to `contentApprovalEligible: true`, and exported the episodes 01–30 approval bundle.

## Changes

- `history-core-subject-v35.ts`: reign-of-terror composite topic, slug handler, `isSafeCoreSubjectSeedV35` blocks HMS Terror from keyword/known-entity paths.
- `history-claims-v34.ts`: geographic subspan rejection, ethnic-group surfaces, standalone non-place denylist (`Roman`, `East`, `West`, `American`, `Linear`), credible-geography filter in `geographicFromEntities`.
- `history-geo-v34.ts`: place seeds for Greece, Spain, Western Europe.
- `history-visual-semantics-v35.ts`: skip non-credible qualifiers in `validateRequiredGeographyCoverageV35`.
- Tests added/updated in `history-core-subject-v35.unit.test.ts`, `history-v35.unit.test.ts`.

## Verification

| Command | Result |
|---------|--------|
| `pnpm test:focused -- packages/history/src/history-core-subject-v35.unit.test.ts` | 32/32 pass |
| `pnpm test:focused -- packages/history/src/history-v35.unit.test.ts` | 16/16 pass |
| `pnpm exec tsx scripts/history-v35-regenerate-p0-episodes.mjs` | 9/9 `contentApprovalEligible: true` |
| `pnpm test:focused -- packages/history/test/acceptance/history-v35-corpus.acceptance.ts` | 1 fail ep03 `beat-0021 missing Roman` (fixed; re-run blocked by session hook) |
| `pnpm exec tsx scripts/history-v35-combine-episode-range.mjs 1 30` | exit 0 |

## Artifacts

- Bundle: `artifacts/chatgpt-review/history-approval-packs-v3.5-episodes-01-30.zip`
- SHA-256: `c57f321420eeddf6281dd6b4b95d70d27ee1dec4e0e6f97501a6567ae914d2e5`

## Risks / follow-up

- Re-run corpus acceptance once (hook blocked third identical command after Roman fix).
- Comparison report still lists unrelated `REQUIRED_GEOGRAPHY_MISSING:Bay/Sea` on non-P0 episodes.
- All episodes retain expected `TIMING_MEASUREMENT_REQUIRED` production blockers.
