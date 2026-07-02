# Target Architecture

## Summary

Extend the existing OpenAI-only speech stack into a staged, artifact-driven narration pipeline:

```text
localized story
  -> spoken-language adaptation
  -> narrative beat segmentation
  -> performance-direction planning
  -> pronunciation normalization
  -> TTS chunk generation with neighboring context
  -> chunk-level technical validation
  -> continuity-aware audio assembly
  -> final mastering
  -> narration quality gate
  -> downstream video rendering
```

This should be implemented inside `@mediaforge/speech` and exposed through `apps/cli`, while keeping existing production commands compatible.

## Architecture Principles

- Use OpenAI TTS exclusively for speech synthesis.
- Do not add a generic multi-provider TTS framework.
- Preserve `audio generate`, `audio generate-localized`, `run`, and render flows during rollout.
- Persist every meaningful intermediate artifact.
- Prefer deterministic defaults and cache reuse before AI planning.
- Allow per-language and per-chunk failures without corrupting successful outputs.
- Keep full videos and Shorts as configuration profiles over the same pipeline.

## Target Modules

- `packages/speech/src/narration-schemas.ts`
  - Zod schemas and TypeScript types for narration artifacts.
- `packages/speech/src/spoken-narration.ts`
  - Spoken-language adaptation loading, validation, and optional OpenAI rewrite request construction.
- `packages/speech/src/narration-segmentation.ts`
  - Deterministic beat segmentation.
- `packages/speech/src/performance-direction.ts`
  - Deterministic defaults and optional OpenAI planning adapter.
- `packages/speech/src/pronunciation.ts`
  - Boundary-safe TTS-only text normalization and audit output.
- `packages/speech/src/openai-tts-request.ts`
  - Request construction for current chunk plus instruction-only neighboring context.
- `packages/speech/src/narration-cache.ts`
  - Chunk fingerprints, reuse decisions, atomic writes, stale cleanup.
- `packages/speech/src/audio-validation.ts`
  - FFprobe/WAV validation and issue classification.
- `packages/speech/src/narration-assembly.ts`
  - Ordered manifest assembly, pause insertion, trimming, crossfades, normalization.
- `packages/speech/src/narration-quality-gate.ts`
  - Structured final gate and human-readable report.

## Public Surface

Add a small internal orchestrator, not a provider framework:

```ts
interface NarrationPipelineRequest {
  readonly episodeDir: string;
  readonly episodeId: string;
  readonly language: string;
  readonly locale: string;
  readonly variant: "full" | "short";
  readonly sourceNarrationPath: string;
  readonly sourceNarrationText: string;
  readonly config: NarrationPipelineConfig;
  readonly mode: "prepare" | "plan" | "generate" | "assemble" | "validate" | "all";
}
```

The CLI should call this orchestrator, while `OpenAiCompatibleSpeechProvider` remains the low-level TTS executor.

## Artifact Root

Use the current locale/variant root from `createEpisodePathResolver`, then `audio/narration/` for new versioned artifacts:

- `audio/narration/spoken-text.md`
- `audio/narration/spoken-text.json`
- `audio/narration/chunk-manifest.json`
- `audio/narration/performance-directions.json`
- `audio/narration/pronunciation-transforms.json`
- `audio/narration/chunks/<chunk-id>.wav`
- `audio/narration/chunks/<chunk-id>.validation.json`
- `audio/narration/assembly-manifest.json`
- `audio/narration/clean-narration.wav`
- `audio/narration/mastered-narration.wav`
- `audio/narration/quality-gate.json`
- `audio/narration/generation-metadata.json`
- `audio/narration/config-snapshot.json`

Compatibility outputs should still write or update `audio/narration.wav` and manifest artifact references until render code is migrated.

## Failure Model

- Chunk failures are recorded in the manifest and do not delete valid cached chunks.
- Language failures in `generate-localized` are summarized; unrelated languages continue by default.
- Assembly is blocked if required chunks are missing or invalid.
- Existing valid outputs are never overwritten until the replacement has passed validation and is atomically promoted.

## Rollout

Add `narrationPipelineMode` with values:

- `legacy`: current behavior.
- `shadow`: create plans/reports without changing render inputs.
- `new`: generate and assemble through the staged pipeline while writing compatibility outputs.

Default should be `legacy` for the first implementation wave, then switch per episode/channel after validation.
