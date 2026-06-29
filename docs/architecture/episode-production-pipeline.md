# Episode Production Pipeline

## Purpose

The active production path is CLI-driven episode generation: start from source story files, derive canonical facts and character state, create narration and scenes, generate assets, render outputs, and hand off metadata plus upload inputs.

## Entry Points

- `apps/cli/src/index.ts`
- `apps/cli/src/episode-commands.ts`

## Behavior-Level Stage Order

1. Source discovery and parsing
   Source files are discovered from the configured source root and parsed into episode-specific metadata, narration, and production instructions.
2. Canonical story facts and character bootstrap
   Canonical facts are extracted, shared character registries can be bootstrapped or synchronized, and approval state is recorded for reusable character references.
3. Narration, script, and scene planning
   Full or localized episode script material is prepared, scene plans are generated or localized, and review packages can be written.
4. Audio generation and slicing
   Narration audio is generated, durations inspected, and per-scene audio segments sliced for downstream timing and rendering.
5. Image planning, generation, import, and resume
   Scene prompts, workbooks, and manifests are created; images can be generated directly, imported from external work, or resumed from persisted state.
6. Render and validation
   Scene clips and final videos are rendered locally or remotely, then validated against expected dimensions, codecs, and duration.
7. Metadata and upload handoff
   Scenes-derived metadata and upload inputs are prepared for the final publication boundary.

## Inputs and Outputs

- Inputs usually come from source content roots such as `content-ideas/content/dark-truth-episodes-multilingual-production-pack`.
- Working outputs land under `episodes/<episode-id>/...` by default.
- Shared episode assets live under `shared/` areas, while locale and variant-specific outputs are separated by language and `full` or `short` directories when applicable.

## Persistence and Resumability

- Filesystem artifacts are the main resume boundary: manifests, scripts, audio, scenes, images, renders, and review files are all persisted into episode directories.
- SQLite stores episode manifests and pipeline run history where those flows use `@mediaforge/persistence`.
- Image resume is selective: scenes with successful outputs are skipped, retryable failures can be retried, and non-retryable failures stay skipped unless forced.

## Retry and Failure Behavior

- The CLI favors resumable reruns over global rollback.
- Render flows can retry remote execution and optionally fall back to local rendering.
- Image state persists failure metadata, including retryability, so later resumes can avoid repeating terminal failures.

## Relevant Tests and Source References

- `apps/cli/src/episode-commands.unit.test.ts`
- `apps/cli/src/images-resume-command.unit.test.ts`
- `apps/cli/src/episode-image-summary.unit.test.ts`
- `apps/cli/src/episode-commands.ts`
- `apps/cli/src/images-resume-command.ts`
- `packages/dark-truth/src/index.ts`
- `packages/image-generation/src/episode-image-pipeline.ts`
- `packages/rendering/src/index.ts`
