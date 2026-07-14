# Batch 11 Production Caller Migration

Commit: `2197009156ed909d8a4e61757ef7554bcab49770` (changes uncommitted).

## Summary

Accepted Batch 11. Added an engine-owned compatibility invocation context and
fail-closed CLI action migration for every production family. Removed direct
provider behavior from metadata/image shell callers. Batch 12 is unblocked.

## Changed paths

- `packages/workflow-engine/src/{caller-migration*,index.ts}`
- `apps/cli/src/{production-caller-migration*,index.ts,index-setup.unit.test.ts}`
- `scripts/{generate-youtube-metadata.sh,openai-generate-scene-image.sh}`
- `package.json`, endpoint audit, refactor status, AI context, this report

## Tests/checks

- Caller adapter: 1/1 passed; CLI migration: 14/14 passed; setup: 3/3 passed.
- Workflow-engine and CLI builds passed; CLI typecheck passed.
- Packaged help booted; targeted direct-endpoint/caller searches were clean.

## Risks/follow-up

Provider execution and publishing were not run. Compatibility aliases remain
until formal deprecation. Batch 12 must bind irreversible publishing to current
artifact, metadata, channel, locale, variant, and dry-run approval evidence.
