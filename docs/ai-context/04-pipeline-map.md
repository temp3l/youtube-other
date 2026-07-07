# AI Context: Pipeline Map

## Story Pipeline

Current source supports planning durable workflow manifests. CLI execution is still dry-run skeleton-only.

Implemented in dirty tree:

- English rewrite stage wrapper with persisted success/failure.
- English source fallback outcome with `source-fallback` provenance.
- Quality gate wrappers for full/short.
- Locale isolation/fallback wrappers.
- Independent short branch outcomes.
- Visual branch boundary state.

Not implemented/proven:

- End-to-end executable `stories pipeline` orchestration.
- Provider batch hybrid execution.
- Media stage execution from the durable workflow.
- Legacy command delegation.
- Full resume/invalidation execution across all stages.

## Image Pipeline

Active areas:

- Scene image planning/generation/import.
- Character references and approval.
- Batch prepare/submit/status/download/resume.
- Full-scene shared output aliasing.
- Short multilingual shared portrait aliasing in the dirty tree.

Blocked:

- Reference-assisted edit batches until real provider semantics are verified.

## Audio/Narration Pipeline

`packages/speech` owns narration schemas, segmentation, TTS request building, cache/resume, validation, assembly, mastering, quality gates, telemetry, and CLI narration stages.

Provider-backed TTS requires explicit approval. Use mock/dry-run for routine checks.

## Rendering Pipeline

`packages/rendering` owns FFmpeg rendering, filter builders, render validation, clip manifests, and render-motion integration. Dirty-tree motion support adds seeded presets, optional debug reports, and additive manifest metadata.

Do not run remote render without explicit approval.

## Visual Retention / Shots

`apps/cli/src/shots.ts` and `packages/visual-planning` own deterministic shot planning, validation, previews, migration, and derived-shot cache contracts. Repository episode artifacts are not currently a reliable proof source; post-refactor smoke found stale/invalid episode 022 artifacts.

## Metadata And Upload

`packages/metadata` generates YouTube metadata. `packages/youtube-upload` validates metadata/video/thumbnail inputs and writes upload reports. Upload requires credentials and must not run casually.
