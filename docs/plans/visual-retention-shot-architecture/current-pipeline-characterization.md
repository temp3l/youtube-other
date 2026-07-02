# Current Pipeline Characterization

Task 01 records the pre-shot-rendering contracts that later tasks must preserve or intentionally migrate.

## Scene Planning

- `packages/scene-planning/src/index.ts` `OneToOneScenePlanner.plan`: default visual windows use `visualSceneMinSeconds ?? 5` and `visualSceneMaxSeconds ?? 6`; scene IDs are `scene-###`; `expectedImageFilenames` encode scene sequence, timing, and aspect ratio.
- `packages/dark-truth/src/index.ts` `retimeScenePlan`: after narration generation, scene `timing`, `estimatedDurationSeconds`, `actualAudioDurationSeconds`, and `expectedImageFilenames` are scaled to the actual narration duration.

## Image Reuse

- `packages/image-generation/src/episode-image-pipeline.ts` `manifestSchema`: reuse decisions depend on `sceneId`, `stageIdentity`, `narrationDependency`, `scenePlanDependency`, `imagePlanDependency`, `stageVersion`, `configFingerprint`, `aspectRatio`, `promptVersion`, `sceneHash`, `visualPlanHash`, `renderability`, `providerRequestHash`, `promptHash`, `previousSceneId`, `reusedFromSceneId`, `materialDifferencesFromPrevious`, `validationIssueCodes`, `characterIds`, `referenceImages`, `model`, `size`, `quality`, `outputPath`, `outputSha256`, `status`, `attempts`, `generatedAt`, and `error`.
- `packages/image-generation/src/shorts-image-strategy.ts` `ShortsSceneManifestEntry`: Shorts portrait reuse depends on `imagePlanFingerprint`, `sceneHash`, `strategy`, and `outputImagePath`; `motion` exists only on `ShortsScenePlan` planning output and is not consumed by `FFmpegVideoRenderer`.

## Rendering Reuse

- `packages/rendering/src/index.ts` `SceneClipManifest`: scene clip reuse depends on `sceneId`, `sceneHash`, `imageSha256`, `audioSha256`, optional `captionsSha256`, `renderProfile`, `trailingSilenceRatio`, `trailingSilenceBufferSeconds`, optional `renderFingerprint`, `renderer`, and `outputSha256`.
- `packages/rendering/src/index.ts` `buildSceneClipRenderRequest`: clip identity is `clipId = scene.id`, output is `clips/<scene.id>.mp4`, manifest is `clips/<scene.id>.json`, and the render fingerprint includes input paths, output path, ffmpeg arguments, expected dimensions/duration, fps, captions path, and trailing-silence settings.
- `packages/rendering/src/index.ts` `RenderManifest`: final render fingerprint includes variant, narration fingerprint, scene-plan fingerprint, image-plan fingerprint, audio fingerprint, subtitle fingerprint, render profile, clip paths, and captions path.

## Dark Truth Workflow

- `apps/cli/src/episode-commands.ts` `commandEpisodeGenerate`: non-dry runs generate narration, call `retimeScenePlan`, write scene-plan artifacts, call `sliceSceneAudioFiles`, then render clean video from scene audio and scene images.
- `packages/dark-truth/src/index.ts` `sliceSceneAudioFiles`: writes one `audio/segments/<scene.id>.wav` file per scene.
- `packages/dark-truth/src/index.ts` `writeSidecarSubtitles` and `buildEpisodeLoadResult`: write SRT and VTT sidecars; `SubtitleManifest.subtitleVideoFiltersUsed` remains `false`.
