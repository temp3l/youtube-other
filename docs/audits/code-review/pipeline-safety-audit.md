# Pipeline Safety Audit

## Orchestration Risks

- `apps/cli/src/index.ts` is a broad orchestration file importing config, providers, image generation, rendering, upload, persistence, process execution, speech, and transcription. This is refactor-hostile because CLI option handling and infrastructure behavior are coupled.
- `apps/cli/src/story-pipeline-command.ts:62` only supports `--dry-run`; `packages/story-localization/src/story-workflow-planner.ts:53` creates synthetic fingerprints. The workflow manifest is not yet authoritative for execution.
- `packages/dark-truth/src/index.ts` is still a large legacy/current pipeline aggregator and directly calls image, render, speech, config, process-runner, and visual-planning packages.

## Resume/Retry Risks

- Story pipeline resume loads manifests by workflow ID but does not bind resumed stages to real input hashes.
- Image batch retry is comparatively strong, but `packages/image-generation/src/image-batch-service.ts:531` and `:552` cast auxiliary manifests before retry/import decisions.
- Render cache reuse hashes image/audio inputs, but render can create missing audio, which weakens retry safety.
- Upload selection falls back to scanning render folders, which can select stale artifacts.

## Stage Contract Gaps

- Authored scripts, generated narration scripts, scene plans, shot plans, image manifests, audio manifests, transcript/caption manifests, render manifests, and upload manifests are not represented by one stage contract model.
- Render should consume a validated timeline contract with audio, image, caption, aspect ratio, duration, and source hashes.
- Full and short formats need separate contracts for script, image strategy, timeline, render profile, and upload metadata.

## Manifest Gaps

Good existing manifest surfaces:

- `packages/domain` episode/scene/shot schemas
- `packages/image-generation/src/image-batch.schemas.ts`
- `packages/rendering/src/index.ts` render manifest schema
- `packages/metadata/src/youtube-metadata.ts` metadata schema
- `packages/story-localization/src/story-workflow.schemas.ts`

Gaps to close:

- generated narration script manifests with `language`, `variant`, `sourceHash`, and producer
- short scene manifest schema ownership
- remote render job/result schema ownership
- upload selection manifest with video/thumbnail/metadata hashes
- consistent version, owner, and dependency fields across manifests

## Provider Boundary Risks

- OpenAI image batch JSONL generation, file upload, batch creation, polling, download, and import are in `packages/image-generation/src/image-batch-service.ts`.
- Reference-assisted edit batches are correctly blocked pending real-provider verification, but the provider abstraction is not yet explicit.
- Metadata/transcription providers validate better than image batch remote response bodies; copy the stricter pattern.

## Full/Short Separation Risks

- Short image planning has short-specific portrait and transform behavior, but still interacts with full-scene identities and shared output aliasing.
- `packages/story-localization/src/story-localization.service.ts` writes full and short scripts under legacy language folders.
- Render supports 16:9 and 9:16 profiles, but timeline/aspect validation should happen before render invocation.

## Localization/Image Reuse Risks

- Shared locale list includes `pt`; Dark Truth does not.
- Current shared asset identity is strongest for image batch custom IDs, but aliasing can still collapse distinct localized visual intent.
- Stable asset identity should include episode slug, language, format, story beat ID, shot ID, visual intent hash, source language, target language, aspect ratio, and asset purpose.

## Safe Refactor Readiness Position

Do not parallelize behavior changes in path resolution, stage contracts, render input contracts, and legacy cleanup. Characterization tests must land first, then hardening should proceed from path/manifests outward.

