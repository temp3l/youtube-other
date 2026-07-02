# Legacy System Inventory

## Legacy runtime flow

```text
mediaforge create
-> @mediaforge/pipeline createPipeline()
-> source ingestion/transcription/cleaning/rewrite
-> one-to-one scene planning
-> speech generation
-> captions/images/render/metadata/package
-> manifest and SQLite step-run persistence
```

Root CLI commands `run`, `status`, `inspect`, `retry`, `clean`, old transcript/scenes/audio/clips helpers, and `apps/api` currently preserve this model.

## Legacy or overlapping components

- `packages/pipeline/src/index.ts`: older end-to-end orchestrator and stage enum.
- `apps/api/src/index.ts`: boots `createPipeline()` only to return workspace JSON.
- Root CLI commands in `apps/cli/src/index.ts`: `create`, `run`, `status`, `inspect`, `retry`, `clean`, plus old transcript/scenes/audio/clips flows that bind directly to pipeline internals.
- `packages/dark-truth/src/index.ts`: separate source discovery and media orchestration used by `apps/cli/src/episode-commands.ts`; keep only if reclassified as the application boundary or migrate into one.
- `narrationPipelineMode=legacy`: compatibility mode that blocks staged mutation and preserves monolithic audio generation.
- Legacy image paths: `state/image-generation/images` and helper names containing `legacyGeneratedImage`.
- Legacy transcript files: `original-transcript.json`, root `audio/narration.wav`.

## Hidden coupling

- `apps/cli/src/index.ts` builds localized audio, clip, metadata, and render paths with helpers rather than `createEpisodePathResolver()`.
- `story-production-analysis.persistence.ts` reconstructs `<language>/full/script.md`.
- `short-rewrite.resolution.ts` searches `script.md`, `en/full/script.md`, and `en/script.md`.
- `story-full-rewrite-command.ts` still plans and writes root compatibility `script.md`.
- Docs describe compatibility root `script.md` as canonical in some places.

## Future action

Disable legacy entry points after Dark Truth characterization tests pass. Remove `@mediaforge/pipeline` only after `apps/api`, CLI root commands, persistence tests, and package dependencies no longer import it.
