# Episode Filesystem Review

## Executive Summary

The repository currently implements several overlapping filesystem models instead of one episode workspace contract.

The result is not a single bug, but a set of structural mismatches:

- `manifest.json` is the closest thing to an episode checkpoint, but it also stores mutable source, transcript, scene, render, image, and publishing state.
- `scenes.json` is treated as canonical by some consumers, as an alternate source file by others, and as a cache/input artifact by still others.
- Localization outputs use one layout in `packages/story-localization`, another in `apps/cli`, and a different episode-pack layout in `content-ideas/`.
- Image generation has at least two layouts: `generated-assets/...` for episode image generation and `shared/` for reusable character assets.
- Rendering and remote rendering create their own clip, job, and metadata structures without a shared path-resolver layer.

Confirmed impact:

- Full/short and locale outputs can collide or be overwritten because several writers reuse the same base directory and reconstruct paths independently.
- `scenes.json` is written once, then later derived state is stored only in `manifest.json`, so the two files can diverge.
- Persisted paths are often absolute, which reduces portability and makes migration/rsync behavior brittle.
- Downstream consumers frequently rediscover files by scanning directories instead of using a canonical resolver.

The target state should be smaller than a database-backed system and larger than the current ad hoc layout:

- one canonical episode root,
- one path-resolution layer,
- one root manifest with ownership limited to identity and coarse progress,
- one canonical scene file,
- explicit locale/variant folders,
- dedicated execution-state folders for retries, batch jobs, render jobs, and logs,
- portable relative paths inside persisted manifests.

## Repository Areas Inspected

- `packages/pipeline/src/index.ts`
- `apps/cli/src/index.ts`
- `apps/cli/src/story-localization-commands.ts`
- `packages/metadata/src/youtube-metadata.ts`
- `packages/persistence/src/index.ts`
- `packages/domain/src/index.ts`
- `packages/rendering/src/index.ts`
- `packages/image-generation/src/index.ts`
- `packages/image-generation/src/episode-image-pipeline.ts`
- `packages/image-generation/src/image-batch-storage.ts`
- `packages/image-generation/src/image-batch-planner.ts`
- `packages/image-generation/src/image-batch-service.ts`
- `packages/story-localization/src/source-story-discovery.ts`
- `packages/story-localization/src/story-localization-cache.ts`
- `packages/story-localization/src/story-localization-batch-storage.ts`
- `packages/story-localization/src/story-localization.service.ts`
- `packages/story-localization/src/story-markdown-renderer.ts`
- `packages/story-localization/src/story-localization.schemas.ts`
- `packages/config/src/index.ts`
- `packages/youtube-upload/src/index.ts`
- `docs/architecture.md`
- `docs/pipeline.md`
- `docs/multilingual.md`
- `content-ideas/`

## Current Filesystem Map

### Episode pipeline workspace

The core pipeline in `packages/pipeline` writes a flat episode directory under `workspaceDir/<slug>/` with these subfolders:

- `source/`
- `transcript/`
- `script/`
- `audio/segments/`
- `captions/`
- `images/prompt-batches/`
- `images/generated/`
- `images/inbox/`
- `images/rejected/`
- `metadata/`
- `output/`
- `logs/`

The same pipeline also writes:

- root `manifest.json`
- root `scenes.json`
- root `original-transcript.json`
- root `original-transcript.srt`

### Story-localization workspace

`packages/story-localization` uses a different model:

- source input root defaults to `content/dark-truth-episodes-multilingual-production-pack`
- output root defaults to `content-ideas/content/dark-truth-episodes`
- episode output root is `output/<episodeSlug>/`
- cache root is `output/<episodeSlug>/.localization-cache/`
- batch storage root is `output/<episodeSlug>/.batch/`

### Dark Truth episode-pack layout

`apps/cli/src/episode-commands.ts` and `packages/dark-truth` work with:

- `episodes/<slug>/`
- `episodes/<slug>/reviews/<language>/<artifactType>/`
- `episodes/<slug>/manifests/`
- `episodes/<slug>/<language>/<artifactType>/`
- `episodes/<slug>/shared/`
- `episodes/<slug>/generated-assets/`

That layout is not the same as the pipeline workspace and not the same as the story-localization output tree.

### Content-ideas source pack layout

The checked-in source pack under `content-ideas/content/dark-truth-episodes-multilingual-production-pack/` stores locale variants as:

- `/<episode-slug>/en/...`
- `/<episode-slug>/de/...`
- `/<episode-slug>/es/...`
- `/<episode-slug>/fr/...`
- `/<episode-slug>/pt/...`

This is a source-pack layout, not a runtime workspace contract.

## Current Data-Flow Map

1. Source media or source story is discovered or supplied.
2. A new episode workspace is created.
3. Transcript is imported, transcribed, normalized, or copied from a localized artifact.
4. Transcript is cleaned and rewritten.
5. Scene plan is generated and written to `scenes.json`.
6. Scene audio is synthesized and cached with per-scene manifests.
7. Captions are emitted.
8. Image prompts are exported.
9. Placeholder or imported images are written.
10. Video is rendered.
11. Publishing metadata is generated from `scenes.json`.
12. Final manifest is rewritten with execution results.
13. SQLite is updated with the final manifest snapshot.

The data-flow is directionally consistent, but the path model is not:

- some steps read from the root episode directory,
- some read from `output/`,
- some read from `generated-assets/`,
- some reconstruct paths from title/slug/locale/variant,
- some search the workspace recursively or by directory scan.

## Current Producer / Consumer Matrix

| Stage | Input | Output | Locale-specific | Variant-specific | Producer | Consumers | Lifecycle | Problems |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Episode creation | source file or URL | `manifest.json`, `source/`, `original-transcript.*` | No | No | `packages/pipeline` | all later stages | generated deterministic | stores absolute paths; creates flat root workspace |
| Transcript acquisition | source media or localized transcript artifact | `original-transcript.json`, `original-transcript.srt` | Yes, by script language | No | `packages/pipeline` and CLI | cleaner, rewriter, captions | generated deterministic | artifacts may live at root or in `transcript/` |
| Transcript cleaning | transcript | `transcript/cleaned-transcript.*` | Yes if script language is localized | No | `packages/pipeline` | script rewrite | generated deterministic | duplicate path construction in pipeline and CLI |
| Script rewrite | cleaned transcript | `script/rewritten-script.*`, `script/claims.json` | Yes if language-specific rewrite is used | No | `packages/pipeline` | scene planner, metadata | generated deterministic | script path is reconstructed in several places |
| Scene planning | transcript + rewritten script | root `scenes.json` | Usually no | Can be, indirectly | `packages/pipeline`, `packages/dark-truth` | metadata, render, image generation | canonical-ish but mutable | scene semantics are mixed with execution hints |
| Scene audio synthesis | scene plan | `audio/segments/*.wav`, per-segment manifest JSON | Yes | Yes, if localized audio is produced | `packages/pipeline`, CLI audio commands | concat, render | intermediate/cache | manifest path is inferred from `.wav` filename |
| Captions | transcript + scene plan | `captions/*.srt|vtt|ass` | Yes | Yes | `packages/pipeline`, CLI | render, upload | generated deterministic | captions path is persisted as absolute paths |
| Image prompt export | scene plan | `images/prompts.json`, `images/scene-workbook.*`, `images/prompt-batches/*.json` | Usually no | Yes, output profile dependent | `packages/image-generation` | image batch planner/service | generated deterministic | output directory differs from `generated-assets` flow |
| Image generation | scene plan + character registry | `generated-assets/images/*.png`, `generated-assets/image-manifests/*.json`, `shared/images/character-references/*.png` | Usually no | Yes | `packages/image-generation/episode-image-pipeline` | planner, render, batch import | generated deterministic + execution state | two image layouts exist; scene manifest mixes planning and execution |
| Render clips | image + audio + captions | `output/clips/*.mp4`, `output/clips/*.json` | Yes if locale audio differs | Yes if output profile differs | `packages/rendering` | render aggregation, upload | final-ish artifact + execution state | output profile can overwrite the same `output/` tree |
| Final video render | clip set | `output/*-clean.mp4`, `output/*-captioned.mp4`, concat list | Yes | Yes | `packages/rendering` | upload, validation | final deliverable | output suffix is optional but not consistently used |
| Metadata generation | root `scenes.json` | `metadata/youtube.*`, `metadata/tiktok.*`, generation manifest | Yes | Yes | `packages/metadata`, `packages/pipeline` | upload | generated deterministic | reads root or `output/scenes.json`, causing ambiguity |
| Upload prep | manifest + metadata + video | upload report | Yes | Yes | `packages/youtube-upload` | human/operator | execution state | resolves video and metadata by fallback scan |
| Story localization | source markdown | `output/<slug>/<locale>/<variant>/script.md` and `.batch/` state | Yes | Yes | `packages/story-localization`, CLI | batch import, render, validation | generated deterministic + execution state | different package docs describe a different layout |

## Current `scenes.json` Analysis

### Where it is written

- `packages/pipeline/src/index.ts` writes root `scenes.json` during `planScenes()`.
- `apps/cli/src/index.ts` can backfill `manifest.scenePlan` from root `scenes.json`.
- `packages/image-generation/src/episode-image-pipeline.ts` writes per-scene manifests, not `scenes.json`, but uses the scene plan as the canonical scene input.

### Where it is read

- `packages/metadata/src/youtube-metadata.ts`
  - `parseScenesFile()`
  - `readAndValidateScenesFile()`
  - `findEpisodeScenesFile()`
  - `listEpisodeSceneFiles()`
- `apps/cli/src/index.ts`
  - `readManifestForEpisode()` backfills `manifest.scenePlan`
  - metadata and upload commands call `findEpisodeScenesFile()`
- `packages/youtube-upload/src/index.ts`
  - loads `scenes.json` through the metadata package
- `packages/pipeline/src/index.ts`
  - uses `path.join(episodeDir, "scenes.json")` in metadata generation

### Multiple copies can exist

Yes.

- root `scenes.json`
- `output/scenes.json`

`packages/metadata` explicitly accepts both. That means the repository already treats `scenes.json` as a discoverable artifact instead of a single authoritative file.

### What the file contains today

The domain schema shows that `Scene` includes:

- canonical narration
- source segment IDs
- timing
- visual purpose
- image prompt text
- expected image filenames
- text requirement
- quality status
- `actualAudioDurationSeconds`

This mixes:

- semantic scene definition,
- render instructions,
- image-generation state,
- retry/quality state.

### Observed behavior

- `packages/pipeline` writes `scenes.json` before later audio synthesis updates `actualAudioDurationSeconds` in memory.
- `packageResults()` writes the updated scene plan into `manifest.json`, but `scenes.json` on disk stays as the earlier version.
- That means the root `scenes.json` and the manifest can diverge after one run.

### Risks

- stale downstream metadata if consumers read `scenes.json` after the manifest has been updated,
- conflicting assumptions about whether `scenes.json` is canonical or generated,
- collision if multiple locale/variant runs write to the same directory,
- unsafe resume if image-generation or render state is stored inside the same object.

### Recommended ownership model

Smallest coherent separation:

- `scenes.json` should become the canonical semantic scene plan only.
- Image-generation state should move to dedicated per-scene manifest files.
- Render state should live in clip or render manifests, not inside scenes.
- Locale-specific narration should not be duplicated in `scenes.json`; it belongs in locale outputs.
- If variant-specific scene adjustments are needed, they should be derived views or separate variant manifests, not in-place mutations.

## Current Manifest Analysis

### Manifest-like files and helpers

- root `manifest.json` in `packages/pipeline`
- SQLite `episodes` table in `packages/persistence`
- scene audio manifests: `audio/segments/*.json`
- scene clip manifests: `output/clips/*.json`
- image scene manifests: `generated-assets/image-manifests/*.json`
- image batch manifests: `generated-assets/.batch/manifests/*.manifest.json`
- story-localization batch manifests: `output/<slug>/.batch/manifests/*.manifest.json`
- YouTube metadata generation manifest: `metadata/youtube-metadata-generation.json`
- YouTube upload report: upload report JSON and markdown in report dir

### Design issues

The current `manifest.json` conflates:

- episode identity,
- source description,
- transcript state,
- rewrite state,
- scene plan,
- alignment,
- captions,
- image assets,
- publishing metadata,
- final artifacts,
- pipeline run history.

### Path issues

- `source.filePath` and `sourceMedia.path` are persisted as absolute paths inside the episode workspace.
- caption paths, image paths, and artifact paths are also absolute.
- `YoutubeMetadataGenerationInfo.sourceFile` is stored relative to `process.cwd()`, which is not the same persistence rule as the episode manifest.
- story-localization caches and batch manifests mix repo-relative and absolute paths in different helpers.

### Ownership issues

Several services mutate the same logical episode state:

- pipeline writes the manifest,
- CLI backfills parts of the manifest,
- persistence mirrors it into SQLite,
- upload code reads it for deliverable discovery.

This is workable only if the manifest is treated as an append-only checkpoint with strict ownership. It is not used that way today.

### Recommended manifest model

Keep one root episode manifest, but narrow its purpose:

- episode identity,
- source locator references,
- high-level stage status,
- pointers to canonical sub-manifests,
- coarse timestamps,
- summary artifact references.

Move the rest into dedicated manifests:

- `scenes.json` for canonical scene semantics,
- `locales/<locale>/<variant>/localization.json` for locale outputs and validation status,
- `state/images/*.json` for image generation state,
- `state/render/*.json` for clip render state,
- `state/upload/*.json` for upload state,
- `state/batch/*.json` for batch API state.

## Localization Model Analysis

### Current model

- `packages/story-localization` treats `en`, `de`, `es`, `fr`, and `pt` as supported language codes.
- English is treated as canonical source content and may also have a short-form output.
- The output helper returns:
  - `script.md` for English full
  - `en/short/script.md` for English short
  - `<lang>/full/script.md` for non-English full
  - `<lang>/short/script.md` for non-English short

### Current problems

- `docs/multilingual.md` describes a different layout (`languages/script-<lang>.md`) that no longer matches the implementation.
- `apps/cli/src/story-localization-commands.ts` prints dry-run paths that match the code, not the docs.
- Some consumers assume one script per episode, while the implementation supports full and short variants per language.
- Some consumers infer the locale from the filesystem name.
- Some consumers treat `episodeSlug` as a display title and some as an identity field.

### Recommendation

Use explicit axes:

- canonical source locale: `en`
- target locale: one of the supported language codes
- content variant: `full` or `short`

Keep production instructions in English if desired, but localize narration and user-facing metadata separately.

Suggested logical separation:

- `locales/en/full/`
- `locales/en/short/`
- `locales/de/full/`
- `locales/de/short/`
- `locales/es/full/`
- `locales/fr/full/`
- `locales/pt/full/`

Each locale/variant folder should own:

- script markdown,
- narration audio,
- transcript,
- captions,
- locale-specific metadata,
- locale-specific thumbnail text,
- render outputs or pointers to them.

## Confirmed Defects

| Severity | Finding | Evidence | Impact | Recommendation |
| --- | --- | --- | --- | --- |
| Critical | Render outputs can collide across output profiles | `packages/pipeline/src/index.ts` writes to one `output/` tree and `packages/rendering/src/index.ts` defaults to `output/clips` and `*-clean.mp4` naming without a required variant suffix | one render can overwrite another if both youtube and vertical outputs are produced in the same episode folder | make variant part of the output root or require `outputSuffix`/`outputBasename` to be derived from variant |
| Critical | `scenes.json` can diverge from the manifest after the pipeline updates scene runtime fields in memory | `packages/pipeline/src/index.ts` writes `scenes.json` before `actualAudioDurationSeconds` is merged into the in-memory plan, then rewrites only `manifest.json` | metadata and downstream tools can read stale scene timing/structure | separate canonical scenes from execution updates and stop mutating the canonical file in place |
| High | Multiple `scenes.json` locations are authoritative enough to be ambiguous | `packages/metadata/src/youtube-metadata.ts` accepts both root and `output/scenes.json` | downstream tools can pick the wrong file when both exist | enforce one canonical location and make the alternative a migration-only compatibility path |
| High | Persisted paths are often absolute | `manifest.json`, scene clip manifests, image asset records, and metadata generation info store absolute or cwd-relative paths | portability and migration become fragile | persist paths relative to the episode root or configured storage root |
| High | Path construction is duplicated across services | pipeline, CLI, metadata, rendering, and image-generation all reconstruct directories independently | a future layout change will require many edits and is likely to miss a consumer | introduce one authoritative path resolver and use it everywhere |
| High | Localization layout documented in `docs/multilingual.md` does not match the implementation | docs show `episodes/<episode-slug>/languages/script-<lang>.md`, while code writes `output/<slug>/<lang>/<variant>/script.md` | operators will use the wrong paths | update docs only after the target layout is chosen, and add tests for the chosen shape |
| Medium | `manifest.json` conflates too many responsibilities | `packages/domain/src/index.ts` and `packages/pipeline/src/index.ts` | schema churn and accidental writes are likely | split execution state from canonical content state |
| Medium | `packages/persistence` mirrors manifest JSON into SQLite and back to disk without an explicit versioning strategy | `packages/persistence/src/index.ts` | DB/file divergence is possible | add schema versioning and clear ownership semantics |
| Medium | Workspace discovery often uses scans instead of deterministic lookup | `findManifestPath()`, `readManifestForEpisode()`, `walkMarkdownFiles()`, `findEpisodeScenesFile()` | slower and more failure-prone on large workspaces | replace scans with indexed deterministic lookup where possible |
| Medium | Remote rendering uses a temporary workspace with partial rsync semantics | `packages/rendering/src/index.ts` | partially transferred files and stale remote state are possible if a run is interrupted | keep the remote workspace isolated and require completion markers before consuming outputs |
| Medium | Batch storage path helpers mix repo-relative and output-relative assumptions | `packages/story-localization/src/story-localization-batch-storage.ts` | batch reruns and portability can break when the output root changes | make batch storage relative to the episode output root only |

## Suspected Risks

- one locale deleting another locale’s outputs if cleanup routines remain directory-based,
- one variant overwriting another variant if output suffixes are omitted,
- stale manifest backfills when CLI commands reconstruct state from multiple file locations,
- remote-render rsync transferring partial files that look complete to later stages,
- batch retry logic writing manifests into a path derived from a moved source file,
- image-generation resume logic depending on file names instead of a shared resolver,
- future migration complexity if new folders are introduced without a versioned manifest contract.

## Severity Classification

- Critical:
  - cross-locale overwrite or collision,
  - full/short overwrite or collision,
  - root/output `scenes.json` ambiguity that can point consumers at the wrong scene plan.
- High:
  - absolute paths in persisted state,
  - duplicated path construction,
  - concurrent writers to a single logical manifest,
  - non-deterministic file discovery.
- Medium:
  - portability and rsync issues,
  - excessive scans,
  - manifest bloat and mixed responsibilities,
  - documentation drift.
- Low:
  - naming cleanup,
  - layout polish once the model is fixed.

## Target Filesystem Structure

The smallest structure that still supports the current workflow is:

```text
episodes/
  009-mary-gloria-the-christmas-doll/
    manifest.json
    source/
      media/
      transcript/
    canonical/
      scenes.json
    shared/
      characters.json
      images/
        character-references/
    locales/
      en/
        full/
          script.md
          audio/
          transcript/
          captions/
          metadata/
          thumbnails/
        short/
          script.md
          audio/
          transcript/
          captions/
          metadata/
          thumbnails/
      de/
        full/
        short/
      es/
        full/
      fr/
        full/
      pt/
        full/
    state/
      localization/
      image-generation/
      render/
      upload/
      batch/
      retries/
    deliverables/
      en/
        full/
        short/
      de/
        full/
        short/
      es/
        full/
      fr/
        full/
      pt/
        full/
    logs/
```

### Concrete episode 009 example

For `009-mary-gloria-the-christmas-doll`:

- English full: `locales/en/full/script.md`
- English short: `locales/en/short/script.md`
- German full: `locales/de/full/script.md`
- German short: `locales/de/short/script.md`
- Spanish full: `locales/es/full/script.md`
- French full: `locales/fr/full/script.md`
- Portuguese full: `locales/pt/full/script.md`

If a locale does not have a short variant, the folder should simply not exist.

## Path Invariants

1. One canonical episode root per episode ID.
2. One authoritative path-resolution layer.
3. No path construction duplicated in business logic.
4. No filesystem identifiers derived from localized display titles.
5. Stable episode IDs and normalized locale codes.
6. Normalized variant identifiers: only `full` and `short`.
7. No absolute paths persisted in portable manifests.
8. Persisted paths are relative to the episode root or an explicitly configured storage root.
9. No `..` traversal in persisted references.
10. No writes outside the configured workspace.
11. Deterministic filenames for generated artifacts.
12. Explicit ownership of `scenes.json`.
13. Explicit schema version on every persisted manifest.
14. Atomic JSON writes for every manifest.
15. Runtime validation on read.
16. No broad recursive scans where direct lookup is possible.
17. Generated files never mixed with manually maintained source.
18. Full and short outputs never share mutable paths.
19. Locales never share mutable paths.
20. Temporary files use predictable suffixes and are excluded from rsync and discovery.

## Proposed APIs

The target should separate path resolution, validation, I/O, and discovery.

```ts
type EpisodeId = string & { readonly __brand: "EpisodeId" };
type LocaleCode = "en" | "de" | "es" | "fr" | "pt";
type ContentVariant = "full" | "short";
type RelativePath = string & { readonly __brand: "RelativePath" };

interface EpisodeContext {
  readonly episodeId: EpisodeId;
  readonly locale: LocaleCode;
  readonly variant: ContentVariant;
}

interface EpisodePathResolver {
  episodeRoot(episodeId: EpisodeId): string;
  manifestPath(episodeId: EpisodeId): string;
  canonicalScenesPath(episodeId: EpisodeId): string;
  sharedRoot(episodeId: EpisodeId): string;
  localeRoot(context: EpisodeContext): string;
  narrationScript(context: EpisodeContext): string;
  transcriptFile(context: EpisodeContext): string;
  captionsFile(context: EpisodeContext, format: "srt" | "vtt" | "ass"): string;
  audioFile(context: EpisodeContext): string;
  thumbnailFile(context: EpisodeContext): string;
  renderManifest(context: EpisodeContext): string;
  finalVideo(context: EpisodeContext, profile: "youtube" | "vertical"): string;
  imageManifest(sceneId: string): string;
}

interface WorkspaceValidator {
  normalizeEpisodeId(value: string): EpisodeId;
  normalizeLocale(value: string): LocaleCode;
  normalizeVariant(value: string): ContentVariant;
  assertInsideWorkspace(workspaceRoot: string, candidatePath: string): string;
  assertPortableRelativePath(candidate: string): RelativePath;
}

interface EpisodeDiscovery {
  findEpisodeRoot(workspaceRoot: string, episodeId: EpisodeId): Promise<string | null>;
  listEpisodes(workspaceRoot: string): Promise<readonly EpisodeId[]>;
}

interface ManifestStore<T> {
  load(filePath: string): Promise<T | null>;
  save(filePath: string, value: T): Promise<void>;
  validate(value: unknown): T;
}

interface AtomicJsonWriter {
  write(filePath: string, value: unknown): Promise<void>;
}
```

The path resolver should not read or write files. The store should not infer paths. The validator should not know business rules. Those separations are required to keep the layout migratable.

## Summary

The repository is functional, but the filesystem contract is not stable enough for safe expansion.

The immediate architectural fix is not a database or a giant rewrite. It is a narrow set of changes:

- centralize path resolution,
- split canonical scene data from execution state,
- make locale and variant first-class dimensions,
- stop persisting absolute paths where portability matters,
- enforce one canonical `scenes.json`,
- add migration tests before changing any runtime layout.
