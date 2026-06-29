# Task: Migration Documentation And Cleanup

Document the refactor and remove obsolete internal routes after tests pass.

## Documentation

Update only docs relevant to changed behavior:

- supported languages and locales;
- full-story lineage;
- short-story lineage;
- variant-specific artifact identity;
- `.env` model/config precedence;
- CLI compatibility;
- resume and invalidation;
- cost reporting;
- downstream metadata/audio/scene/image/render/publish stages.

## Migration

Document how legacy artifacts map to new logical owners. Include compatibility behavior for:

- root `script.md`;
- language `full/script.md`;
- language `short/script.md`;
- generated full-story provenance markers;
- existing short manifests;
- metadata/audio sections in rendered Markdown.

## Cleanup

Remove or deprecate only obsolete internal paths proven unused by tests. Do not remove public commands without migration notes and compatibility tests.

## Verification

Run targeted docs checks, file existence checks, and relevant unit tests. Do not default to full build for docs-only edits.

## Acceptance Criteria

- Operators can understand the new full and short pipeline.
- Migration notes identify stale artifact handling.
- Obsolete internal paths are removed only when safe.
