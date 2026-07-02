# Visual Retention Shot Architecture

## Executive Summary

MediaForge currently renders videos as scene clips: one scene, one source image, one audio slice, one rendered clip. That is simple and cacheable, but it lets Shorts hold nearly unchanged visuals for 11-20 seconds when a scene or reused image lasts too long. The recommended fix is to preserve narrative scenes as the source-image boundary and add first-class rendered shots as the temporal visual boundary.

Recommended strategy: **hybrid explicit scene-to-shot architecture**. Add a deterministic local shot planner that converts each narrative scene/source image into 2-4 rendered shots by default. Use inline FFmpeg filters for common crop, pan, zoom, blur-fill, overlays, and restrained transitions. Pre-render and cache only expensive derived clips such as parallax, depth warping, or preview artifacts.

Expected Short defaults: 5-9 generated source images for 45-60 seconds, 15-28 rendered shots, and roughly 55-70% avoided image-generation calls versus one image per visual change.

## Deprecations

The following assumptions are now deprecated, fallback-supported, and not yet removed:

- one scene equals one rendered clip;
- scene id equals clip id;
- one source image equals one full visual interval;
- Shorts motion metadata without temporal shot realization;
- scene-only visual reports without shot-aware validation or cache metrics;
- ad hoc shot artifact paths outside `state/visual-retention/`;
- direct renderer assumptions that bypass shot plans.

Legacy rendering remains available as a fallback path while rollout stays staged and production confidence is gathered.

## Current Pipeline Findings

Primary operator surfaces:

- `apps/cli/src/index.ts` registers canonical `images`, `render`, `clips`, `transcript`, `metadata`, and `run` command families.
- `apps/cli/src/episode-commands.ts` registers the live `episode` workflow for Dark Truth multilingual full and short generation.
- `packages/pipeline/src/index.ts` is the general pipeline orchestration path.
- `packages/dark-truth/src/index.ts` is still active and renders full/short review outputs through the shared renderer.

Scene planning:

- `packages/domain/src/index.ts` defines `Scene`, `ScenePlan`, `VisualScene`, `ImageAsset`, `RenderProfile`, `AlignmentResult`, and `CaptionSegment`; it has no first-class rendered shot model.
- `packages/scene-planning/src/index.ts` implements `OneToOneScenePlanner`. It builds scene windows from transcript words or segments, defaulting to 5-6 second visual scenes through `resolveVisualSceneDurationBounds`.
- `packages/dark-truth/src/index.ts` has a separate `buildScenePlan` that chunks narration by an estimated scene count and retimes scenes after narration audio using `retimeScenePlan`.
- `Scene.expectedImageFilenames` currently ties image identity to scene timing and aspect ratio.

Narration and captions:

- `packages/pipeline/src/index.ts` synthesizes scene audio through `synthesizeSceneAudio`, writes per-scene audio manifests, concatenates narration, then calls `buildCaptionPack`.
- `packages/alignment/src/index.ts` synthesizes word timings from scene text and duration in `alignScriptToScenes`; captions are currently based on transcript segments.
- `packages/dark-truth/src/index.ts` builds a `SpeechPlan`, generates TTS segments, concatenates `narration.wav`, writes sidecar SRT/VTT, then slices audio by scene timing.
- Dark Truth sidecars are not burned in; the general pipeline can burn ASS captions through `FFmpegVideoRenderer`.

Image generation:

- `packages/image-generation/src/episode-image-pipeline.ts` is the strongest image lineage surface. It persists per-scene visual plans, prompt hashes, provider request hashes, scene hashes, image-plan dependencies, checkpoints, failures, and telemetry.
- `generateEpisodeImages` supports reuse through `mergeWithPrevious`, `mergeWithNext`, cached outputs, and run-length limits. This saves image calls but can worsen visual repetition unless render shots vary locally.
- `packages/image-generation/src/shorts-image-strategy.ts` already has `smart-crop`, `pan-and-scan`, and `blurred-fill`, but these are portrait image-prep strategies per scene, not multiple timed rendered shots.
- `packages/dark-truth/src/index.ts` writes `shared/image-manifest.json` and `shared/short/images/shorts-image-manifest.json`.

Rendering:

- `packages/rendering/src/index.ts` defines `VideoRenderRequest`, `FFmpegVideoRenderer`, `HybridFFmpegVideoRenderer`, `ClipRenderRequest`, `SceneClipManifest`, and `RenderManifest`.
- `FFmpegVideoRenderer.renderSceneClips` resolves one image and one audio file per scene, renders `scene-###.mp4`, writes `scene-###.json`, then final render concatenates clips with `-c copy`.
- `buildSceneClipFilterGraph` is the only image filter builder. It scales and crops portrait outputs or pads landscape outputs, optionally prepending `subtitles=...`.
- There is no current Ken Burns, pan/zoom, transition graph, parallax, typed filter object, shot timing, or shot-level cache.
- Clip IDs currently assume `scene-[0-9]{3}` through `safeClipFilename`.

Persistence and paths:

- `packages/shared/src/episode-filesystem.ts` centralizes canonical episode paths and should own new shot-plan, shot-cache, preview, and validation-report paths.
- Existing paths are split between resolver-backed paths and ad hoc `path.join()` in `apps/cli/src/index.ts`, `apps/cli/src/episode-commands.ts`, and `packages/dark-truth/src/index.ts`.
- Rendering fingerprints include FFmpeg arguments, input paths, dimensions, fps, captions, and trailing-silence settings. They do not include shot metadata because no shot model exists.

Telemetry:

- `packages/observability/src/telemetry.ts` records API calls, process executions, generated images, events, costs, and aggregate reports.
- `packages/image-generation/src/episode-image-pipeline.ts` records image-generation API calls and estimated image costs.
- No current telemetry reports avoided image-generation calls, shots per image, longest static interval, first-8-second visual changes, or derived-clip cache hit ratio.

Tests:

- Focused validation should use `pnpm test:focused -- <test-file>`.
- Relevant current files include `packages/scene-planning/src/index.unit.test.ts`, `packages/image-generation/src/shorts-image-strategy.unit.test.ts`, `packages/image-generation/src/episode-image-pipeline.unit.test.ts`, `packages/rendering/src/index.unit.test.ts`, `packages/pipeline/src/index.unit.test.ts`, `packages/pipeline/src/index.e2e.test.ts`, and `apps/cli/src/episode-commands.unit.test.ts`.

## Repository-Specific Problems

- The render boundary is currently a scene clip, so scene duration and image duration are effectively coupled.
- Shorts image reuse happens before rendering, but the renderer does not consume `ShortsScenePlan.motion`; visual motion is not realized in video.
- One source image may be reused across adjacent scenes, but render validation does not detect excessive unchanged source-image time.
- Scene IDs double as clip IDs. This blocks multiple clips per scene without changing renderer safety checks and manifest shape.
- `visual-plan.json` documents scene timing but not rendered shots, crops, motion, overlays, or transitions.
- Caption timing and shot timing are separate concerns, but no collision model exists for captions versus faces, evidence inserts, or important objects.
- FFmpeg filters are raw strings, so expanding effects inside `buildSceneClipFilterGraph` would become brittle.

## Architecture Alternatives

### Strategy A: Minimal Scene Extension

Add crop, motion, overlays, and multiple timeline segments directly to `Scene`.

Benefits:

- Fastest implementation.
- Smallest number of new types.
- Reuses `ScenePlan` paths and render inputs.

Costs:

- Overloads `Scene` with narrative and render timing.
- Several shots per scene become awkward because one `Scene` already owns one timing range and one image filename list.
- Cache invalidation becomes unclear: changing one crop would alter the scene hash and may invalidate image generation.
- Long-term compatibility with future generated video or shot previews is weak.

Assessment: useful only for a temporary prototype. Not recommended as the production architecture.

### Strategy B: Explicit Scene-To-Shot Architecture

Introduce:

```text
Narrative Scene -> Generated Source Image -> Shot Plan -> Derived Shot or Clip -> Final Composition
```

Benefits:

- Clean separation between narrative meaning and render timing.
- Strong validation, budgets, and cache reuse.
- Can fingerprint shot plans without invalidating source images.
- Supports future generated video clips as an alternate source media type.

Costs:

- Requires new schemas, renderer contracts, manifests, and migration logic.
- Both canonical pipeline and Dark Truth workflow need integration.

Assessment: best domain model and long-term target.

### Strategy C: Pre-Rendered Motion Clips

Convert each scene image into multiple reusable motion clips before final assembly.

Benefits:

- Final render remains simple concat.
- Clips are easy to inspect, cache, retry, and remote-render.
- Preview and review workflows are straightforward.

Costs:

- More disk usage.
- More local render time even for simple crops.
- More cache entries and invalidation complexity.

Assessment: useful for advanced effects and preview, but too heavy as the default for every shot.

### Strategy D: Hybrid Architecture

Use explicit shot plans. Render simple shot treatments inline where possible; pre-render/cache expensive or inspectable derived clips.

Benefits:

- Keeps the clean Strategy B domain model.
- Avoids unnecessary disk churn for simple crop/pan/zoom.
- Allows pre-render caching for parallax, depth effects, and low-res previews.
- Balances deterministic output, render speed, debugability, and cache reuse.

Costs:

- Requires a clear renderer abstraction to avoid two divergent implementations.
- Preview and final render must share the same filter-builder logic to avoid drift.

Recommendation: **Strategy D**.

## Recommended Domain Model

Add shot schemas in `packages/domain/src/index.ts` or a new dedicated visual planning package that re-exports through domain once stable.

Conceptual fields:

```ts
export interface VisualSourceScene {
  readonly sceneId: string;
  readonly narrationStartMs: number;
  readonly narrationEndMs: number;
  readonly sourceImageId: string;
  readonly sourceImagePath: string;
  readonly sourceImageSha256: string;
  readonly importance: "hook" | "setup" | "evidence" | "escalation" | "climax" | "callback";
  readonly focalRegions: readonly FocalRegion[];
}

export interface RenderShot {
  readonly shotId: string;
  readonly sceneId: string;
  readonly sourceImageId: string;
  readonly startMs: number;
  readonly endMs: number;
  readonly treatment: ShotTreatment;
  readonly crop?: NormalizedCrop;
  readonly motion?: CameraMotion;
  readonly overlays: readonly ShotOverlay[];
  readonly transition?: ShotTransition;
}
```

Ownership rules:

- `Scene` owns narrative meaning, source narration range, facts, continuity, image prompt, and source-image justification.
- `VisualSourceScene` links an approved/generated image to scene timing, image hash, focal metadata, and narrative phase.
- `RenderShot` owns render timing, crop, motion, overlays, transition, treatment, and aspect-ratio adaptation.
- Captions remain narration-aligned but can reference shot safe areas for collision avoidance.
- Evidence inserts are overlays tied to source facts, not new story facts.

Shot IDs:

- Use deterministic IDs such as `shot-001-01`, `shot-001-02`, or `scene-001-shot-001`.
- Update renderer safety checks to allow the chosen pattern.
- Preserve scene IDs for source-image and narration ownership.

## Shot Planning Flow

Inputs:

- Platform and variant: `youtube-short`, `youtube-full`.
- Aspect ratio: `9:16` or `16:9`.
- `ScenePlan` after narration retiming.
- Source image manifest entries and image hashes.
- Transcript segments and available word timings.
- Focal metadata.
- Pacing profile.
- Visual budget.
- Treatment restrictions.
- Stable seed.

Rules:

- The same inputs must produce the same `ShotPlan`.
- Exclude unrelated metadata from the fingerprint.
- Use sentence or phrase boundaries where available, but do not require a per-shot LLM call.
- Force at least three meaningful visual changes in the first eight seconds for Shorts.
- Use shorter shots in escalation and climax.
- Allow a final callback hold with controlled push-in.

Narrative phases:

- Hook: start mobile-readable, prefer close-up/evidence/threat/detail, force change within first two seconds.
- Setup: alternate wide, medium, and detail framing with slower movement.
- Evidence: prefer factual inserts from story facts and object crops.
- Escalation: shorten shots and increase source-image changes.
- Climax: fastest cadence with capped blackout/flash/glitch effects.
- Callback: return to a prior motif and hold long enough to register.

## Focal Regions

Use a hybrid strategy.

Primary source:

- Planner-provided metadata from scene visual plans where possible: primary subject, secondary subject, evidence object, caption-safe negative space, suggested close-up regions, depth hints.

Local fallback:

- Use Sharp metadata, saliency heuristics, edge/contrast density, empty-space detection, and optional local face/object detection if a lightweight dependency is approved.

Validation:

- Bounds and minimum crop area.
- Output resolution.
- Face and eye-line safety.
- Object visibility.
- Crop similarity.
- Excessive zoom.
- Empty vertical compositions.
- Low-resolution source risk.

## Render Flow

Phase 1:

- Add `ShotPlan` generation and validation without changing final render behavior.
- Add inspect/report CLI commands.

Phase 2:

- Render shot-aware clips.
- For each shot, resolve the source image from the scene image manifest, build a typed FFmpeg filter operation, and render `shot-*.mp4`.
- Concatenate shot clips in timeline order.

Phase 3:

- Optimize by rendering simple consecutive shots inline where maintainable, while keeping shot manifests.
- Add pre-rendered derived clips for parallax and advanced effects only.

FFmpeg approach:

- Build typed operations for `scale`, `crop`, `zoompan`, `overlay`, `boxblur`, `eq`, `noise`, `vignette`, `fade`, `drawtext`, `xfade`, `setpts`, and basic rotation.
- Avoid one giant handwritten filter string.
- Keep preview render and final render using the same filter-builder functions.

## Persistence

Add resolver-owned artifacts:

- `state/visual-retention/source-scenes.json`
- `state/visual-retention/focal-metadata.json`
- `state/visual-retention/shot-plan.<variant>.<locale>.json`
- `state/visual-retention/validation.<variant>.<locale>.json`
- `state/visual-retention/storyboard.<variant>.<locale>.html`
- `state/visual-retention/contact-sheet.<variant>.<locale>.png`
- `state/render/derived-shots/<shot-fingerprint>.mp4`
- `state/render/derived-shots/<shot-fingerprint>.json`

Legacy Dark Truth compatibility can additionally mirror review-facing summaries under existing `shared/` or locale variant directories, but state ownership should live under resolver-backed paths.

## Fingerprints And Invalidation

Shot-plan fingerprint includes:

- Source image hashes.
- Narration timing hash.
- Scene IDs and scene timing.
- Narrative phase mapping.
- Pacing profile.
- Aspect ratio.
- Visual budget.
- Focal metadata hash.
- Treatment catalog version.
- Shot planner version.
- Renderer version.
- Seed.

Derived-shot fingerprint includes:

- Shot metadata.
- Source image hash.
- Renderer operation version.
- Output dimensions/fps.
- Overlay/evidence asset hashes.

Invalidation rules:

- Changing captions does not regenerate source images.
- Changing motion, crop, transition, or overlays does not regenerate source images.
- Changing one source image invalidates only dependent shots, previews, and final compositions.
- Changing shot planner version invalidates shot plans and dependent derived clips, not source images.
- Changing image prompt/provider request invalidates affected source images and dependent shots.
- Changing evidence text invalidates only the insert asset, dependent shots, previews, and final render.

## Evidence Inserts

Add local evidence inserts for clocks, dates, room numbers, experiment logs, classified records, declassified documents, waveforms, tape-recorder displays, handwritten notes, timestamps, maps, terminal logs, newspaper headings, message excerpts, and medical readings.

Rules:

- Every insert must reference a source fact ID or existing scene text requirement.
- Do not invent evidence.
- Localize text through existing story-localization artifacts where available.
- Validate mobile readability and caption collision.
- Cache rendered insert assets by content, style version, locale, dimensions, and safe-area requirements.

## Captions And Visual Rhythm

Shorts captions should be phrase-based, max two lines, mobile-readable, placed above Shorts UI, and synchronized with narration. Caption changes can contribute visual activity, but cannot be the only meaningful visual change.

Collision model:

- Captions versus faces.
- Captions versus important objects.
- Captions versus evidence inserts.
- Captions versus channel branding.

Use existing transcript/word timing first. If only scene-level timing exists, use phrase splitting inside scene ranges. Do not add an LLM call per caption or shot.

## CLI And Preview

Add commands:

```bash
pnpm mediaforge -- shots plan --episode <episode-id> --variant short --locale en
pnpm mediaforge -- shots inspect --episode <episode-id> --variant short --locale en
pnpm mediaforge -- shots validate --episode <episode-id> --variant short --locale en
pnpm mediaforge -- shots preview --episode <episode-id> --variant short --locale en
```

Inspection report:

- Generated source-image count.
- Total shot count.
- Average and median shot duration.
- Longest shot.
- Longest fully static interval.
- Opening visual-change intervals.
- Climax visual-change intervals.
- Shots per source image.
- Maximum consecutive source-image reuse.
- Treatment and transition distribution.
- Validation warnings.
- Estimated render time.
- Estimated avoided image-generation calls.
- Estimated image-generation savings.

Preview:

- Storyboard/contact sheet with timestamp, source image, crop rectangle, motion direction, treatment, transition, narration excerpt, caption excerpt, and warnings.
- Low-resolution preview render using the same shot filter builders as final render.

## Migration

Legacy episodes with scene images and no shot plan should not require image regeneration.

Migration behavior:

- Infer conservative focal regions.
- Create 2-3 safe shots per source image where duration requires it.
- Use safe push-ins, pans, and blurred fill for unsafe vertical crops.
- Disable aggressive parallax for unknown/low-resolution images.
- Produce preview and validation report.
- Regenerate source images only if validation proves the existing image cannot support the required composition.

## Observability

Add telemetry/report fields:

- Generated source-image count.
- Rendered shot count.
- Average shots per source image.
- Total uses per source image.
- Avoided image-generation calls.
- Estimated image-generation savings.
- Local clip render time.
- Derived-clip cache-hit ratio.
- Shot-plan regeneration count.
- Source-image regeneration count.
- Final visual-change frequency.
- Opening changes in first eight seconds.
- Longest static interval.

Avoid logging complete story narration, secrets, or sensitive generated content.

## Risks And Mitigations

- Visual repetition despite crops: validate crop overlap and treatment repetition; force source-image switch when needed.
- Face distortion: cap zoom, disable parallax around detected faces, validate face bounds.
- Motion sickness: cap pan/zoom speed and rotation; disallow fast movement outside hook/climax.
- Low-resolution images: validate crop output resolution and fall back to blurred fill or new image.
- Crop clipping: use focal metadata and safe-area validation.
- FFmpeg instability: typed filter builders, unit tests, preview parity, and per-shot manifests.
- Render time: inline simple filters, cache expensive derived clips, support low-res preview.
- Disk usage: content-address derived clips and cap cache retention.
- Captions covering faces/evidence: collision validation and safe fallback positions.
- Overused effects: treatment frequency caps.
- Deterministic sameness across episodes: seed from episode, scene, phase, and stable visual style rather than global constants.
- Preview/final divergence: shared renderer operation builders.

## Staged Deprecation

Do not delete legacy code initially.

Deprecate in stages:

- Mark one-scene-one-image render assumptions in renderer docs and manifests.
- Add shot-aware render path behind an explicit option.
- Keep scene-clip rendering as fallback for one release.
- Move `shorts-image-strategy` motion intent into shot planning.
- Replace scene-only visual reports with shot-plan reports.
- Eventually simplify duplicated ad hoc render paths after canonical and Dark Truth integrations pass characterization tests.
