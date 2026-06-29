# Target Media Architecture

This target is limited to media-generation and media-pipeline tasks. It defines one media stack while preserving explicit strategy selection where the repo already has materially different execution modes.

## Target Stack

```text
CLI / worker / API
  -> orchestration use cases
  -> capability ports
  -> provider or execution adapters
  -> external systems
```

Caller surfaces:

- `apps/cli`
- future workers extracted from CLI-safe use cases
- `apps/api`

Orchestration use cases:

- create episode workspace
- run end-to-end production stages
- generate narration audio
- generate images
- render clips and final video
- generate metadata
- repair, retry, resume, and inspect state

Capability ports:

- `AudioGenerator`
- `ImageGenerator`
- `VideoRenderer`
- `MetadataGenerator`
- `EpisodePathResolver`
- `ArtifactStore`
- `ManifestRepository`
- `GenerationJobRepository`
- `ProviderErrorMapper`
- `UsageRecorder`

Adapter layer:

- speech providers
- synchronous image provider adapters
- image batch adapters
- local FFmpeg render adapter
- remote or hybrid render adapters
- OpenAI-backed metadata adapter
- compatibility adapters for legacy manifests and workflow entrypoints

External systems:

- OpenAI-compatible speech, image, and metadata APIs
- local filesystem workspace
- remote render host
- SQLite persistence
- YouTube upload surface

## Ownership Boundaries

### Orchestration owns

- stage ordering
- idempotency rules
- retry policy selection
- resume policy selection
- manifest lifecycle
- progress reporting
- usage collection and aggregation
- compatibility behavior between old and new callers

### Adapters own

- provider request mapping
- provider-specific limits
- transport retries
- low-level timeout behavior
- provider response decoding
- provider error normalization

### Repositories and stores own

- artifact persistence
- manifest read or write concerns
- batch state or job state persistence
- compatibility reads across legacy state shapes

## Canonical Path Policy

All future orchestration and adapters should resolve episode paths through `packages/shared/src/episode-filesystem.ts`.

Required policy:

- `createEpisodePathResolver()` is the only canonical path-construction entrypoint.
- New orchestration should accept an `EpisodePathResolver` rather than raw directory math.
- Existing helper-specific path builders for localized audio, renders, metadata, shorts outputs, and image state should migrate behind resolver-backed compatibility methods instead of staying ad hoc.

Why this is the anchor:

- it already defines canonical episode, locale, variant, audio, metadata, render, clip, image, shared, batch, and state roots
- it centralizes workspace safety checks
- it provides explicit legacy-image fallback methods, which is the correct place for transitional compatibility

## Strategy Selection

The target architecture keeps explicit strategies instead of hiding them inside duplicate pipelines.

### Image mode

- synchronous
- batch

### Render mode

- local
- remote
- hybrid

### Resume policy

- never
- partial
- always

Selection should happen once in orchestration, then flow into one set of capability ports. The repo should not maintain separate end-to-end media pipelines just to express strategy differences.

## Canonical Contract Direction

### `AudioGenerator`

- Input: episode context, narration chunks or scene text, voice settings, resume policy.
- Output: artifact references, narration path, scene segment paths, usage summary, manifest updates.
- Compatibility: wrap current pipeline speech orchestration first; later absorb `dark-truth` narration helpers and localized CLI audio bookkeeping.

### `ImageGenerator`

- Input: episode context, scene plan, image mode, approval policy, resume policy.
- Output: scene-level image results, manifest updates, usage summary, warnings.
- Compatibility: keep sync and batch as strategies behind one port; workbook/import remains a compatibility adapter until retired.

### `VideoRenderer`

- Input: episode context, scene plan, render mode, captions policy, output profile.
- Output: clip manifests, final video paths, validation results.
- Compatibility: local and hybrid adapters stay separate, but caller orchestration becomes shared.

### `MetadataGenerator`

- Input: episode context, scene plan, source text, language, provider mode.
- Output: publishing metadata plus durable output artifacts.
- Compatibility: AI-backed YouTube metadata is canonical; heuristic metadata survives only as a fallback adapter until removal gates are met.

## Schema Ownership

Canonical schema ownership should stay close to existing Zod usage rather than inventing a parallel schema system.

- domain-level media entities remain with `@mediaforge/domain`
- metadata generation request or output schemas remain with `packages/metadata`
- image batch schemas remain with `packages/image-generation/src/image-batch.schemas.ts`
- story-localization schemas remain with `packages/story-localization`

Target rule:

- orchestration may compose schemas, but it should not redefine competing JSON shapes for the same media artifact if a package-level schema already exists

## Current Friction To Eliminate

- `apps/cli` and `dark-truth` both construct media workflows.
- Path construction is partly centralized and partly ad hoc.
- Manifests exist in multiple shapes across images, clips, batches, and generation reports.
- Batch image flow currently depends on story-localization batch infrastructure patterns instead of a media-owned batch abstraction.

## Target End State

One orchestrated media stack should remain:

- callers choose use case plus explicit strategy
- one orchestration layer owns retries, idempotency, manifests, progress, and usage
- adapters implement provider or execution specifics only
- path resolution flows through `EpisodePathResolver`
- legacy entrypoints stay behind compatibility adapters until migration gates are complete
