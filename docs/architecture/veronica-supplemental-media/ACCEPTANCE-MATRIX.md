# Acceptance Matrix — Fixture Integrity Remediation

| Requirement | Status | Evidence |
|-------------|--------|----------|
| REM-001 landscape render references | pass | `manifest-integrity.unit.test.ts` |
| REM-001 portrait render references | pass | `manifest-integrity.unit.test.ts`, regenerated v2 pack |
| REM-001 invalid aspect reference rejected | pass | `manifest-integrity.unit.test.ts` |
| REM-002 output checksum integrity | pass | `prepared-asset-integrity.unit.test.ts`, orchestrator integration |
| REM-003 declared dimensions match bytes | pass | `prepared-asset-integrity.unit.test.ts`, PNG metadata validation |
| REM-004 contact sheet visual evidence | pass | `contact-sheet.unit.test.ts`, v2 ZIP SVG base64 embeds |
| REM-005 episode-scoped IDs | pass | `episode-scope.unit.test.ts`, planner episodeId in stableId |
| REM-005 distinct content keys | pass | `preparedAssetId` in `contentKey` hash |
| REM-006 cross-artifact validator | pass | `integrity-validator.ts`, pipeline finalize step |
| REM-007 fixture metadata | pass | v2 `manifest.json`, per-episode README |
| Bulk pack regeneration | pass | `veronica-bulk-approval-pack-v2.zip` |

## Verdict

`PASS`
