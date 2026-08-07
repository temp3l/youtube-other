# Fixture Integrity Remediation

**Date:** 2026-08-08  
**Verdict:** PASS  
**Artifact:** `artifacts/review/veronica-bulk-approval-pack-v2.zip`

## Defects fixed

| ID | Issue | Fix |
|----|-------|-----|
| REM-001 | Portrait render manifests referenced 16:9 prepared assets | `buildRenderManifest` resolves aspect-specific prepared assets via `resolvePreparedAssetPathForPlacement`; `validateRenderManifestAspectIntegrity` rejects mismatches |
| REM-002 | Prepared checksums did not match output bytes | Materialization writes bytes then sets `checksum` from `sha256(bytes)`; separate `sourceChecksum` and `contentKey` fields |
| REM-003 | Metadata declared 1920×1080 / 1080×1920 but files were 1×1 | Rasterizer resizes fixture sources to declared dimensions via deterministic synthetic PNG generation |
| REM-004 | Contact sheets were metadata-only | SVG contact sheets embed base64 thumbnails from actual prepared asset bytes |
| REM-005 | ID scope ambiguous | Strategy B: episode-local IDs with `episodeScopedLookupKey`; IDs hashed with `episodeId`; `contentKey` distinct per `preparedAssetId` |
| REM-006 | No cross-artifact validator | `validateEpisodeApprovalPackIntegrity` blocks `renderEligible` / `productionEligible` on integrity failures |
| REM-007 | Fixture pack claimed empty limitations | `contentMode: fixture`, `fixtureSet`, and explicit limitations in manifest/README |

## Changed modules

- `packages/veronica-media/src/contracts/media-plan.v1.ts`
- `packages/veronica-media/src/planning/semantic-planner.ts`
- `packages/veronica-media/src/pipeline/orchestrator.ts`
- `packages/veronica-media/src/pipeline/finalize-episode-plan.ts`
- `packages/veronica-media/src/preparation/external-rasterizer.ts`
- `packages/veronica-media/src/preparation/png-metadata.ts`
- `packages/veronica-media/src/preparation/prepared-asset-integrity.ts`
- `packages/veronica-media/src/rendering/build-render-manifest.ts`
- `packages/veronica-media/src/rendering/manifest-integrity.ts`
- `packages/veronica-media/src/review-pack/contact-sheet.ts`
- `packages/veronica-media/src/review-pack/integrity-validator.ts`
- `packages/veronica-media/src/review-pack/bulk-zip-pack.ts`

## Validation commands

```bash
pnpm test:focused -- packages/veronica-media/src/rendering/manifest-integrity.unit.test.ts
pnpm test:focused -- packages/veronica-media/src/preparation/prepared-asset-integrity.unit.test.ts
pnpm test:focused -- packages/veronica-media/src/review-pack/contact-sheet.unit.test.ts
pnpm test:focused -- packages/veronica-media/src/pipeline/orchestrator.integration.test.ts
pnpm veronica:review-packs
pnpm veronica:bulk-approval-zip
```

## Regression pack results

- Episodes: 12/12 included
- Package integrity: pass
- Redaction: pass
- Contact sheets: embedded PNG evidence per placement
- Render manifests: aspect-correct prepared asset references
- Prepared checksum/dimension mismatches: 0
- Render eligibility: true (fixture gates; unresolved anchor timing remains warning-only)

## Concurrent history session

No shared history-channel files modified. No deferred shared integration.
