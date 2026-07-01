# Story Pipeline Test Strategy

Do not make paid provider calls. Use package-local mocks/fakes and focused Vitest commands.

## Unit Tests

Likely files:

- `packages/shared/src/episode-filesystem.unit.test.ts`
- `packages/story-localization/src/story-workflow-schema.unit.test.ts`
- `packages/story-localization/src/story-workflow-orchestrator.unit.test.ts`
- `packages/story-localization/src/story-workflow-fallbacks.unit.test.ts`
- `packages/story-localization/src/story-workflow-invalidation.unit.test.ts`
- `apps/cli/src/story-pipeline-command.unit.test.ts`

Required scenarios:

- English rewrite success persists generated provenance.
- English rewrite provider failure persists failure then evaluates source fallback.
- Original source fallback accepted continues downstream.
- Original source fallback rejected blocks downstream and images.
- Rewrite provider failure distinct from quality failure.
- Each locale succeeds independently.
- Each locale fails independently.
- Localized fallback accepted/rejected.
- One locale does not block another.
- English acceptance permits visual/image branch.
- English rejection blocks images.
- Images do not wait for all locales.
- Full passes while short fails.
- Audio, metadata, image, render, and publish failure isolation.
- Provider batch result correlation by custom ID.
- Failed batch item retry.
- Cache reuse and resume.
- Granular invalidation.
- Budget enforcement.
- `sp` normalization/rejection/migration prevents duplicate Spanish branch.

## Integration Tests

Likely files:

- `packages/story-localization/src/story-workflow.integration.test.ts`
- `packages/story-localization/src/story-workflow-batch.integration.test.ts`
- `apps/cli/src/story-pipeline-command.integration.test.ts`

Scenarios:

- Full successful pipeline with fake story/media providers.
- English rewrite failure with accepted source fallback.
- English rewrite failure with rejected source fallback.
- Partial locale failure while shared images still generate.
- Partial short failure while full media continues.
- Provider batch with mixed success/failure/import.
- Interrupted workflow resume.
- Stale artifact invalidation.
- Audio partial failure.
- Metadata partial failure.
- Image retry.
- Render retry with missing audio blocked.
- Legacy command delegation.
- Status/inspect JSON output.
- Cost reconciliation.
- Concurrent execution lock protection.

## Contract Tests

Likely files:

- `packages/story-localization/src/story-workflow-schemas.unit.test.ts`
- `packages/story-localization/src/story-workflow-report-schema.unit.test.ts`
- `apps/cli/src/story-pipeline-json-output.unit.test.ts`

Contracts:

- Workflow manifest schema.
- Stage outcome schema.
- Failure schema.
- Quality decision schema.
- Provider batch request/result mapping.
- Locale schema and canonical `es`.
- CLI JSON output.
- Artifact path references.
- Fingerprint input schema.

## End-To-End Tests

Use mocked providers and temp workspaces.

1. One English source produces all valid downstream artifact references.
2. One locale fails but shared images still generate.
3. English rewrite fails and source fallback passes.
4. English rewrite fails and source fallback fails.
5. Full passes while short fails.
6. Audio failure blocks only dependent render.
7. Rerun reuses valid outputs.
8. Locale-only changes do not invalidate shared images.
9. Visual changes invalidate images and dependent renders.
10. `sp` cannot create a duplicate Spanish branch.

## Fixtures

- Minimal English source.
- Valid generated canonical English full.
- Invalid generated English full.
- Valid localized full for `de/fr/es/pt`.
- Invalid localized fallback.
- Valid/invalid short artifacts.
- Mixed batch JSONL output.
- Legacy `sp` manifest/cache/path fixture for migration tests.
- Media dependency fixture with missing audio but valid metadata.

## Acceptance Assertions

- Assert individual fields, not broad snapshots.
- Assert lineage, provenance, fingerprints, quality decisions, fallback warnings, dependency blocking, and cache status separately.
- Assert no stage interprets provider failure as story quality failure.
- Assert no content/policy failure is retried automatically.

## Commands

Preferred focused commands:

```bash
pnpm test:focused -- packages/story-localization/src/story-workflow-schema.unit.test.ts
pnpm test:focused -- packages/story-localization/src/story-workflow-orchestrator.unit.test.ts
pnpm test:focused -- apps/cli/src/story-pipeline-command.unit.test.ts
```

Use direct Vitest with file filters only if wrapper behavior is verified for the new tests.
