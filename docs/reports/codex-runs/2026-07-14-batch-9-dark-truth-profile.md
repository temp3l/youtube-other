# Batch 9 Dark Truth Profile

Commit: `2197009156ed909d8a4e61757ef7554bcab49770` (changes uncommitted).

## Summary

Implemented strict story-bible/reference contracts and stores, revision-bound
approval/fingerprints, scoped invalidation, safe legacy import/status, weighted
hard-failure quality, media/metadata/publish gates, profile CLI adapters, and a
no-provider full/Short fixture for all five locales. Batch 10 is unblocked.

## Changed paths

- `packages/dark-truth/src/{profile-*,task-registry*,index.ts}`
- `apps/cli/src/{workflow-commands*,episode-cross-manifest-validator.ts}`
- Batch status, audit, AI context, and this report

## Tests/checks

- Dark Truth profile: 18/18 passed.
- CLI/registry: 7/7 passed after refreshing targeted package output.
- `@mediaforge/dark-truth` build passed.
- `@mediaforge/cli` typecheck passed after two bounded repairs.
- Targeted diff checks passed.

## Risks/follow-up

Provider execution and publishing were not run. Production callers intentionally
remain on compatibility adapters until their scheduled migration batch.
