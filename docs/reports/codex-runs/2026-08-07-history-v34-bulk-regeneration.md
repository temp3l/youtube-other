# History V3.4 bulk regeneration (four episodes)

## Summary
Regenerated all four History V3.4 approval packs via `createCombinedHistoryApprovalBundleV34`.

## Output
- Combined dir: `artifacts/chatgpt-review/history-approval-packs-v3.4`
- Combined ZIP: `artifacts/chatgpt-review/history-approval-packs-v3.4.zip` (`af70df98…9345`)
- Per-episode nested dirs + ZIPs under same parent
- `comparison-manifest.json` lists planHash/trustSnapshotHash/manifestHash per episode

## Episode results
| Episode | planHash (prefix) | content | production blockers | maps | diagrams |
|---|---|---|---|---|---|
| Napoleon 02 | `1715e55c…` | blocked | `DIAGRAM_UNSUPPORTED_EDGE`, `TIMING_MEASUREMENT_REQUIRED` | 1 | 2 |
| Rome 03 | `cbcf42b0…` | eligible | `TEXT_ONLY_LONG_WITHOUT_JUSTIFICATION`, `TIMING_MEASUREMENT_REQUIRED` | 0 | 0 |
| Black Death 04 | `70b578f0…` | eligible | `TEXT_ONLY_LONG_WITHOUT_JUSTIFICATION`, `TIMING_MEASUREMENT_REQUIRED` | 0 | 0 |
| Franklin 05 | `765276a6…` | eligible | `TIMING_MEASUREMENT_REQUIRED` | 8 | 1 |

All four: validation export consistent, checksums OK, 16:9+9:16, `test-summary.json` status `passed`.

## Tests
Bulk run invoked focused verification per pack (semantics, unit, Franklin acceptance) — all passed.

## Follow-up
Goal 02/03 acceptance tests and planner fixes still needed for Napoleon diagram edge, Rome/Black Death maps and long text-only beats.
