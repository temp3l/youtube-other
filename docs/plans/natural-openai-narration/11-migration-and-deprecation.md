# Migration and Deprecation

## Current-State Flow

`commandAudioGenerate`:

1. load localized narration dependency;
2. choose chunks from scene plan, rewritten sections, or script markdown;
3. build one global audio instruction artifact;
4. delete prior segments and narration;
5. synthesize chunks concurrently;
6. retry all chunks serially if parallel generation fails;
7. concat with FFmpeg copy;
8. write generation report and legacy TTS record.

`dark-truth`:

1. parse source pack;
2. build `SpeechPlan`;
3. generate segment WAVs;
4. concat to narration;
5. write `narration-manifest.json`.

## Target-State Flow

1. load canonical localized narration;
2. create or reuse spoken narration artifact;
3. create deterministic chunk manifest;
4. create or reuse performance directions;
5. apply pronunciation transforms;
6. synthesize only missing/stale chunks;
7. validate each chunk;
8. assemble and master;
9. run quality gate;
10. write compatibility narration path and legacy records.

## Compatibility Adapter

Add adapters to:

- convert old scene chunks into new chunk manifests when needed;
- derive legacy `TtsGenerationRecord`;
- update episode manifest artifact references;
- keep `audio/narration.wav` available for render code;
- read `dark-truth` `SpeechPlan` as a source for chunk manifest and directions.

## Feature Flag

Add `narrationPipelineMode`:

- `legacy`: old behavior.
- `shadow`: write new planning/validation artifacts but leave old audio output untouched.
- `new`: use new pipeline and write compatibility outputs.

## Rollback

Set `narrationPipelineMode=legacy` and rerun `audio generate`. New artifacts are additive and should not block legacy operation.

## Deprecation Candidates

Eventually remove or delegate:

- localized audio chunking helpers in `apps/cli/src/index.ts`;
- destructive `cleanupAudioGenerationArtifacts` behavior;
- duplicate `dark-truth` narration generation loop;
- hard-coded term pronunciation in fallback voice instructions, after dictionary migration.

Deletion criteria:

- new pipeline has produced accepted full and short outputs for all supported languages;
- render commands consume compatibility outputs correctly;
- status/inspect commands report new artifacts;
- legacy fixtures are migrated or intentionally retained.
