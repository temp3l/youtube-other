# Data, Storage, Cache, And Queue Impact

## Database

`packages/persistence` creates SQLite tables:

- `episodes`
- `pipeline_runs`
- `step_runs`

These are tied mainly to `@mediaforge/pipeline`. Do not delete tables automatically. Plan schema migration separately after production operators decide whether historical run records are retained, archived, or dropped.

## Filesystem storage

Code removal:

- stop writing root `script.md`, `en/script.md`, `audio/script-source-*.md`, legacy image fallback locations, and old render/video paths.

Data migration:

- move or reclassify authored scripts into `languages/`.
- preserve generated outputs under `state/`, `shared/`, `locales/`, and output dirs unless operational cleanup approves deletion.

Operational cleanup:

- remote render job folders.
- `.localization-cache`, image batch state, narration chunk cache, generated debug payloads.

Destructive deletion:

- never automatic for production episode outputs, SQLite rows, remote jobs, or published upload records.

## Queues and durable workflows

No runtime queue framework or durable worker service was found. Story workflow manifests are filesystem-based planning/status artifacts, not a separate durable queue.

## Cache and identity impact

Path normalization affects:

- story localization cache keys
- production analysis freshness
- short rewrite parent hashes
- narration chunk cache
- metadata cache keys
- image reuse and scene plan hashes
- render derived-shot cache
- resume and retry manifests

Cache keys must include episode slug, language, variant, resolver version, content hash, and relevant prompt/schema/model/config fingerprints.

## Collision prevention

Every persisted artifact path and manifest identity must separate:

- episode slug
- language
- variant
- revision/content hash
- owner package
- legacy versus active artifact source during migration
