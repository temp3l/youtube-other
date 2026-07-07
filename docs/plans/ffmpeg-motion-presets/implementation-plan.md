# FFmpeg Motion Presets Implementation Plan

## 1. Executive Summary

Add an FFmpeg-first motion preset layer that selects deterministic visual motion for still-image video segments without adding non-FFmpeg dependencies, external APIs, or destructive manifest changes.

Recommended approach: **Strategy C, hybrid segment-first**. Reuse the existing segment renderer and final concat/audio composition, add motion selection and filter-building as pure TypeScript modules, and keep all motion metadata additive. The current renderer already supports:

- scene-first clips from still images and scene audio;
- shot-plan clips from still images, crops, overlays, and `zoompan`;
- derived-shot cache under `state/render/derived-shots`;
- final visual concat plus narration audio alignment;
- remote render scheduling for scene clips.

Motion should be disabled by default until characterization and smoke tests prove compatibility. A later rollout can default full videos to `safe`.

## 2. Current Rendering Pipeline Summary

Current primary operational surface is `apps/cli`.

Top-level render flow:

- `apps/cli/src/index.ts` registers `render <episode-id>`.
- `commandRender()` loads the episode manifest, chooses `youtube` or `vertical`, builds a `VideoRenderRequest`, and calls `runtime.renderer.render()`.
- Runtime chooses `FFmpegVideoRenderer` or `HybridFFmpegVideoRenderer` based on remote render config.
- Output goes to `<language>/<variant>/renders/<profile>/` with clips under the configured clips directory.

Episode production flow:

- `apps/cli/src/episode-commands.ts` runs `episode english`, `episode localized`, `episode short`, and review preparation.
- These commands generate or reuse narration, images, scenes, and optional visual-retention shot plans.
- `renderCleanVideo()` from `@mediaforge/dark-truth` is called by episode commands, passing `visualRetention: resolveVisualRetentionOptions(options)`.
- Generation manifests are written at `<language>/<full|short>/generation-manifest.json`.

Renderer flow:

- `packages/rendering/src/index.ts` contains `VideoRenderRequest`, `FFmpegVideoRenderer`, `HybridFFmpegVideoRenderer`, `buildSceneClipRenderRequest()`, and `buildShotClipRenderRequest()`.
- With `shotPlan`, rendering uses ordered `RenderShot` entries and silent derived shot clips, then adds narration audio globally.
- Without `shotPlan`, rendering creates one audio-backed clip per scene, then concats.
- Final `render.json` is written in the render output directory.

## 3. Existing Files/Modules Involved

Primary future code targets:

- `packages/rendering/src/index.ts`: renderer request types, scene/shot clip requests, manifests, fingerprints, concat, validation.
- `packages/rendering/src/filter-builders/*`: existing `scale`, `crop`, `zoompan`, `eq`, `fade`, `noise`, `vignette`, `overlay`, `format`, `xfade` builders.
- `packages/domain/src/index.ts`: `CameraMotion`, `RenderShot`, `ShotPlan`, `VisualNarrativePhase`, `VisualBudget`, zod schemas.
- `packages/visual-planning/src/shot-planner.ts`: deterministic `hashText` seeded selection, current `VisualMotionPreset` values, shot motion generation.
- `packages/visual-planning/src/legacy-shot-plan.ts`: canonical visual-retention artifacts under `state/visual-retention`.
- `packages/shared/src/episode-filesystem.ts`: canonical render, derived-shot, visual-retention, image paths.
- `packages/config/src/index.ts`: runtime config schema and visual-retention config.
- `apps/cli/src/index.ts`: top-level render command.
- `apps/cli/src/episode-commands.ts`: episode production flags, generation manifest, visual-retention options.

Existing tests to extend:

- `packages/rendering/src/index.unit.test.ts`
- `packages/rendering/src/filter-builders.unit.test.ts`
- `packages/rendering/src/derived-shot-cache.unit.test.ts`
- `packages/domain/src/shot-plan.unit.test.ts`
- `packages/visual-planning/src/shot-planner.unit.test.ts`
- `apps/cli/src/index.unit.test.ts`
- `apps/cli/src/episode-commands.unit.test.ts`
- `packages/config/src/index.unit.test.ts`
- `packages/shared/src/episode-filesystem.unit.test.ts`

## 4. Current FFmpeg Strategy

Scene clips:

- `buildSceneClipRenderRequest()` uses `-loop 1`, image input, audio input, `-vf buildSceneClipFilterGraph()`, `-t targetDurationSeconds`, `-r fps`, `libx264`, and AAC audio.
- `buildSceneClipFilterGraph()` uses contain+pad for landscape output and cover+crop for portrait output.
- Scene clip reuse is driven by scene/image/audio/caption hashes and `renderFingerprint`.

Shot clips:

- `buildShotClipRenderRequest()` uses `-loop 1`, source image inputs, optional overlay inputs, `-vf` or `-filter_complex`, `-frames:v`, `-r`, no audio, `libx264`, and `yuv420p`.
- `baseShotOperations()` already emits `zoompan` for `push-in`, `pull-out`, `pan`, `pan-and-zoom`, and `drift`.
- Derived shot cache fingerprints include normalized shot data, operations, output profile, overlay hashes, and renderer/treatment catalog versions.

Final assembly:

- `FFmpegVideoRenderer.render()` writes `concat.txt`, runs FFmpeg concat copy to `*-visual-clean.mp4`, resolves narration audio, maps video and audio to `*-clean.mp4`, optionally burns subtitles, probes output, then writes `render.json`.

## 5. Recommended Integration Strategy

Use **Strategy C: Hybrid segment-first**.

Rationale:

- Current code is already segment-first for both scene and shot paths.
- Existing clip manifests, content hashes, and derived-shot cache provide resumability.
- Per-segment FFmpeg failures are easier to diagnose than a single large filter graph.
- Final concat/audio alignment should remain unchanged to avoid regressions.
- Motion can be included in fingerprints so cached clips invalidate correctly.

Implementation shape:

- Add pure motion modules in `packages/rendering/src/motion/`.
- Extend `VideoRenderRequest` with optional `motion?: MotionRenderConfig`.
- In shot-plan mode, prefer explicit `RenderShot.motion` unless a motion override config says to apply preset selection.
- In scene mode, use motion presets to build animated scene filters instead of the current static filter graph when enabled.
- Keep `HybridFFmpegVideoRenderer` scene job scheduling unchanged; only the generated `ffmpegArguments` and fingerprints change when motion is enabled.

## 6. Proposed Architecture

New modules:

- `packages/rendering/src/motion/types.ts`: domain types and zod schemas local to rendering.
- `packages/rendering/src/motion/config.ts`: defaults, config normalization, CLI config adapter.
- `packages/rendering/src/motion/presets.ts`: 15-preset registry and validation.
- `packages/rendering/src/motion/seeded.ts`: deterministic random helpers using `hashText`, no `Math.random()`.
- `packages/rendering/src/motion/selection.ts`: weighted selection, repeat prevention, overrides.
- `packages/rendering/src/motion/filter-builder.ts`: preset to `VideoFilterOperation[]` or filter chain.
- `packages/rendering/src/motion/report.ts`: debug report types and writer helpers.

Existing modules to extend additively:

- `packages/rendering/src/index.ts`: request config, clip manifests, fingerprints, report write hook.
- `packages/rendering/src/filter-builders/types.ts`: only if a missing FFmpeg primitive is required, such as expression-capable `eq` or shake-safe crop expressions.
- `packages/domain/src/index.ts`: optional manifest fields only if source shot plans should carry overrides.
- `packages/config/src/index.ts`: runtime defaults for motion rendering.
- `apps/cli/src/index.ts` and `apps/cli/src/episode-commands.ts`: flags and validation.
- `packages/shared/src/episode-filesystem.ts`: optional helper for `state/render/motion-report.<variant>.<locale>.json`.

## 7. Proposed TypeScript Types/Interfaces

Place initial render-owned types in `packages/rendering/src/motion/types.ts`:

```ts
export type MotionPresetFamily =
  | "documentary"
  | "tension"
  | "reveal"
  | "shorts"
  | "ambient";

export type MotionIntensity = "low" | "medium" | "high";
export type MotionVideoKind = "full" | "short";

export type MotionStoryBeat =
  | "hook"
  | "setup"
  | "investigation"
  | "tension"
  | "discovery"
  | "reveal"
  | "ending";

export type MotionImageKind =
  | "character"
  | "location"
  | "object"
  | "evidence"
  | "threat"
  | "environment";

export interface MotionPreset {
  readonly id: MotionPresetId;
  readonly family: MotionPresetFamily;
  readonly intensity: MotionIntensity;
  readonly allowedFor: readonly MotionVideoKind[];
  readonly minDurationSec: number;
  readonly maxDurationSec: number;
  readonly avoidConsecutiveRepeat: boolean;
  readonly avoidFamilyRunLength?: number;
  readonly baseWeight: number;
}

export interface ShotMotionContext {
  readonly episodeId: string;
  readonly videoKind: MotionVideoKind;
  readonly storyBeat?: MotionStoryBeat;
  readonly imageKind?: MotionImageKind;
  readonly durationSec: number;
  readonly shotIndex: number;
  readonly totalShots: number;
  readonly language?: string;
  readonly seed?: string;
  readonly previousSelections?: readonly SelectedMotionPreset[];
  readonly explicitPresetId?: MotionPresetId;
}

export interface SelectedMotionPreset {
  readonly presetId: MotionPresetId;
  readonly family: MotionPresetFamily;
  readonly intensity: MotionIntensity;
  readonly seed: string;
  readonly reason: string;
}

export interface MotionRenderConfig {
  readonly enabled: boolean;
  readonly mode: "off" | "safe" | "cinematic" | "shorts";
  readonly seed?: string;
  readonly debug: boolean;
  readonly presetOverride?: MotionPresetId;
  readonly overrideCompatibility?: "fail" | "fallback";
}
```

Use a literal union for `MotionPresetId` generated from the registry:

```ts
export type MotionPresetId =
  | "doc_slow_push_in"
  | "doc_slow_pull_back"
  | "doc_left_drift"
  | "tension_creep_zoom"
  | "tension_breathing_frame"
  | "tension_shadow_push"
  | "reveal_pan_to_subject"
  | "reveal_zoom_to_detail"
  | "reveal_from_darkness"
  | "short_fast_push"
  | "short_snap_zoom"
  | "short_impact_shake"
  | "ambient_fog_drift"
  | "ambient_light_flicker"
  | "ambient_static_hold";
```

Renderer integration:

```ts
export interface VideoRenderRequest {
  // existing fields...
  readonly motion?: MotionRenderConfig;
}
```

Optional future domain fields in `RenderShot` should be additive:

```ts
motionPresetId?: MotionPresetId;
motionFamily?: MotionPresetFamily;
motionIntensity?: MotionIntensity;
motionSeed?: string;
motionReason?: string;
```

Prefer not to add these to canonical `ShotPlan` until renderer-owned reports prove sufficient.

## 8. Preset Registry Design

`packages/rendering/src/motion/presets.ts` exports a frozen array and lookup helpers:

- `motionPresetRegistry`
- `getMotionPreset(id)`
- `assertValidMotionPresetRegistry()`
- `motionPresetIds`

Validation rules:

- exactly 15 entries;
- unique IDs;
- family/intensity in known enums;
- `allowedFor` is non-empty;
- `minDurationSec <= maxDurationSec`;
- shorts family is not allowed for full by default;
- `ambient_static_hold` is low intensity.

## 9. Preset Family and Preset Definitions

Initial registry:

| Preset | Family | Intensity | Allowed | Duration | Notes |
| --- | --- | --- | --- | --- | --- |
| `doc_slow_push_in` | documentary | low | full, short | 2.0-20.0 | 1.00 to 1.04/1.06 |
| `doc_slow_pull_back` | documentary | low | full, short | 2.0-20.0 | 1.05 to 1.00 |
| `doc_left_drift` | documentary | low | full, short | 2.0-20.0 | subtle pan |
| `tension_creep_zoom` | tension | medium | full, short | 1.5-12.0 | slow push |
| `tension_breathing_frame` | tension | medium | full, short | 2.0-12.0 | small sinusoidal movement if builder supports it, otherwise deterministic pan-and-zoom |
| `tension_shadow_push` | tension | medium | full, short | 2.0-12.0 | slow push plus mild `eq` darkening |
| `reveal_pan_to_subject` | reveal | medium | full, short | 1.5-10.0 | deterministic pan |
| `reveal_zoom_to_detail` | reveal | high | full, short | 1.5-8.0 | stronger safe zoom |
| `reveal_from_darkness` | reveal | medium | full, short | 1.5-8.0 | `fade` or mild brightness reveal |
| `short_fast_push` | shorts | high | short | 0.8-6.0 | 1.00 to 1.10/1.12 |
| `short_snap_zoom` | shorts | high | short | 0.8-4.0 | quick zoom then hold approximated by `zoompan` |
| `short_impact_shake` | shorts | high | short | 0.8-3.0 | bounded crop jitter only |
| `ambient_fog_drift` | ambient | low | full, short | 3.0-20.0 | nearly static drift, no real fog assets initially |
| `ambient_light_flicker` | ambient | low | full, short | 2.0-15.0 | mild deterministic `eq` if stable |
| `ambient_static_hold` | ambient | low | full, short | 0.1-30.0 | current static behavior |

## 10. Preset Selection Algorithm

Inputs:

- `videoKind`
- story beat mapped from `VisualNarrativePhase` or scene fields
- image kind inferred from scene subject/action/visual purpose/focal regions
- `shotIndex`, `totalShots`, duration
- language and episode ID
- explicit preset override
- previous selections

Seed:

```text
motion-v1:<episodeId>:<language>:<videoKind>:<shotIndex>:<durationMs>:<userSeed>
```

Use a local deterministic helper based on `hashText`, following `packages/visual-planning/src/shot-planner.ts`.

Default distribution:

- Full: documentary 50, tension 25, ambient 15, reveal 10, shorts 0.
- Short: shorts 60, tension 20, reveal 15, documentary 5, ambient 0-5.

Selection steps:

1. Normalize context and infer safe fallbacks.
2. If explicit preset exists, validate allowed video kind and duration. If invalid, fail or fallback based on `overrideCompatibility`.
3. Filter registry by `allowedFor`, duration compatibility, mode, and override policy.
4. Score by family distribution, story beat, image kind, duration, and shot position.
5. Apply repeat penalties:
   - no same preset back-to-back when `avoidConsecutiveRepeat`;
   - avoid more than 2 same-family selections in a row;
   - avoid consecutive high-intensity selections;
   - exclude shorts presets for full unless explicit override.
6. Weighted deterministic pick with stable unit value.
7. If no candidates remain, choose `doc_slow_push_in` for full or `ambient_static_hold` for short.

Beat mapping from existing `VisualNarrativePhase`:

- `hook` -> `hook`
- `setup` -> `setup`
- `evidence` -> `discovery`
- `escalation` -> `tension`
- `climax` -> `reveal`
- `callback` -> `ending`
- `aftermath` -> `ending`

## 11. FFmpeg Filter Generation Strategy

Primary API:

```ts
export function buildMotionFilterOperations(input: {
  readonly preset: MotionPreset;
  readonly selection: SelectedMotionPreset;
  readonly durationSec: number;
  readonly fps: number;
  readonly outputWidth: number;
  readonly outputHeight: number;
  readonly videoKind: MotionVideoKind;
  readonly sourceWidth?: number;
  readonly sourceHeight?: number;
}): readonly VideoFilterOperation[];
```

Use existing stable primitives first:

- `scale`
- `crop`
- `zoompan`
- `fps` through `zoompan`
- `setsar` only if current output validation requires it later
- `format`
- `fade`
- `eq`
- `noise`
- `overlay` only for existing overlay assets
- `concat`
- `xfade` only if later transition work needs it

Avoid first implementation:

- real fog/rain/dust overlays;
- external overlay assets;
- aggressive rotate;
- heavy blur or motion blur;
- non-deterministic noise.

Filter rules:

- Full output: 1920x1080 or configured `RenderProfile`.
- Short output: 1080x1920 or configured `RenderProfile`.
- Use cover scaling before motion when black borders are possible.
- Use `zoompan` `d = round(durationSec * fps)` and renderer `-frames:v` where possible.
- Keep `format=yuv420p`.
- Include motion config, preset selection, filter operations, and selected seed in render fingerprints.
- Clamp full zoom to 1.06 by default, shorts to 1.12 by default.

Scene path:

- Replace `buildSceneClipFilterGraph(width, height, captionsPath)` with an overload or new `buildSceneClipFilterGraph({ width, height, captionsPath, motion })`.
- Preserve old static graph exactly when `motion.enabled === false`.

Shot path:

- Add selected preset to shot operations only if enabled and not already overridden by source `RenderShot.motion`, or explicitly configure precedence.
- Recommended initial precedence: existing `RenderShot.motion` wins; new presets apply to scene path and to shot plans only when future task opts in with `motion.mode !== "off"`.

## 12. Full-Video Behavior

Defaults:

- `motion.enabled = false` initially.
- When enabled with `safe`, use documentary, tension, ambient, and rare reveal.
- Never select shorts presets for full without explicit override.
- Target zoom: 1.00 to 1.06.
- Target pan: 2-6 percent.
- No shake by default.
- Avoid consecutive high-intensity presets.

## 13. Shorts Behavior

Defaults:

- `motion.enabled = false` initially.
- When enabled with `shorts`, select shorts, tension, and reveal families.
- Target zoom: 1.00 to 1.12.
- Target pan: 5-12 percent.
- Use impact shake only for `short_impact_shake`, only as bounded deterministic x/y expression or stepped crop, and only after tests prove no black borders.
- Keep global narration/audio alignment unchanged.

## 14. Manifest/Schema Changes

Use additive changes only.

Recommended first implementation:

- Do not mutate canonical source manifests, scene plans, image manifests, or existing shot plans.
- Write motion metadata into render-owned artifacts:
  - scene clip manifests;
  - shot clip manifests;
  - derived shot manifests;
  - final `render.json`;
  - optional `motion-report.json`.

Optional fields:

```ts
motionPresetId?: MotionPresetId;
motionFamily?: MotionPresetFamily;
motionIntensity?: MotionIntensity;
motionSeed?: string;
motionReason?: string;
```

Old manifests:

- Zod schemas should accept absence of motion fields.
- Existing cache entries without motion fields remain reusable only when motion disabled.
- When motion enabled, fingerprint changes should invalidate stale clips safely.

## 15. CLI Changes

Top-level `render <episode-id>` should support:

- `--motion`
- `--no-motion`
- `--motion-mode <off|safe|cinematic|shorts>`
- `--motion-seed <seed>`
- `--motion-debug`
- `--motion-render-preset <presetId>`

Use `--motion-render-preset`, not `--motion-preset`, because `episode-commands.ts` already uses `--motion-preset <subtle|balanced|strong>` for visual-retention planning.

Episode commands should support the same render-oriented flags after naming is settled:

- `episode english`
- `episode localized`
- `episode short`
- `episode review prepare`

Behavior:

- Current behavior unchanged unless `--motion` or non-off mode is passed.
- Invalid modes or preset IDs fail with actionable messages.
- Explicit shorts preset for full fails unless an explicit future compatibility override is added.
- CLI help must distinguish visual-retention `--motion-preset` from render motion `--motion-render-preset`.

## 16. Debug/Reporting Design

Report path:

- Prefer `<render outputDir>/motion-report.json` for top-level render.
- For derived-shot cache debugging, optionally also write `state/render/motion-report.<variant>.<locale>.json`.

Report shape:

```json
{
  "videoKind": "full",
  "motionMode": "safe",
  "seed": "episode-language-seed",
  "shots": [
    {
      "shotIndex": 0,
      "inputImage": "...",
      "durationSec": 6.4,
      "presetId": "doc_slow_push_in",
      "family": "documentary",
      "intensity": "low",
      "reason": "default full-video setup beat",
      "ffmpegFilterSummary": "zoompan + crop + fps",
      "outputSegment": "..."
    }
  ]
}
```

Errors:

- Include failed shot/scene index, preset ID, input image, intended output segment, and FFmpeg operation summary.
- Keep logs concise by writing full details to report only when `debug` is true.

## 17. Testing Strategy

Characterization:

- Pin current scene and shot render request behavior with motion disabled.
- Prove full and short profiles still render local temp fixtures.

Type/config:

- Motion config defaults to disabled.
- Preset IDs and modes validate.

Registry:

- Exactly 15 presets.
- Unique IDs.
- Valid families, durations, intensities, and allowed video kinds.

Selection:

- Same seed same result.
- Different seed can vary.
- No forbidden shorts preset for full.
- No back-to-back avoided preset.
- Safe fallback for missing metadata.
- Approximate family distribution over many shots.

Filter builder:

- Each preset produces a non-empty operation list/filter.
- Stable primitives only.
- Frame count equals `round(duration * fps)`.
- 16:9 and 9:16 respected.

Renderer integration:

- Motion disabled preserves old filter strings/fingerprints.
- Motion enabled changes expected fingerprints and writes animated clips.
- Final output exists and validates by `ffprobe`.

Smoke:

- Use 3-5 local fixture images and synthetic audio.
- No external APIs.
- No production episode assets modified.

## 18. Performance Considerations

- Keep current segment-first intermediate file model.
- Do not add per-frame overlays in initial implementation.
- Include motion in fingerprints to skip valid cached segments.
- Keep FFmpeg command length bounded by per-segment filters.
- Use existing FPS, resolution, codec, output paths, and validation.
- Avoid huge temporary videos by preserving `-frames:v`, `-t`, and existing concat.

## 19. Migration/Backward Compatibility Plan

- Phase 1: tests only.
- Phase 2: types/config/registry, disabled by default.
- Phase 3: selection/filter builder pure functions.
- Phase 4: renderer integration behind `motion.enabled`.
- Phase 5: CLI/reporting/docs.

Backward compatibility:

- Existing commands produce identical output with motion disabled.
- Existing manifests remain valid.
- Existing visual-retention `--motion-preset` remains unchanged.
- Existing generated episode assets are not modified.
- Existing full/short rendering remains available with static filters.

## 20. Risks and Mitigations

- Risk: `--motion-preset` naming conflict. Mitigation: use `--motion-render-preset`.
- Risk: black borders with pan/zoom. Mitigation: conservative cover scale, clamp centers, add ffprobe and visual validation smoke.
- Risk: cache stale/reuse bugs. Mitigation: include motion config and filter operations in fingerprints.
- Risk: exact duration drift. Mitigation: reuse existing frame-count helpers and validation tolerance.
- Risk: cheap/noisy visuals. Mitigation: conservative defaults, no glitches, no full-video shorts family.
- Risk: remote render path divergence. Mitigation: scene job arguments include full filter graph and render fingerprint.

## 21. Safe Implementation Order

Sequential:

```text
Task 01 -> Task 02 -> Task 03 -> Task 04 -> Task 05 -> Task 06 -> Task 07 -> Task 08 -> Task 09
```

Potential limited parallel work:

```text
After Task 01: Task 02 and documentation skeleton parts of Task 09.
After Task 03: Task 04 and parts of Task 05, only if files do not overlap.
```

Do not run in parallel:

```text
Task 06 and Task 07.
Task 06 and Task 08.
Task 05 and Task 06.
Any tasks touching the same renderer entry points.
```

Renderer integration only after characterization, types/config, registry, selection, and filter builder exist.

## 22. Acceptance Criteria

- Motion disabled preserves current behavior.
- Registry contains exactly the 15 requested presets.
- Selection is deterministic and repeat-safe.
- Full videos never use shorts presets by default.
- FFmpeg filters use stable supported primitives only.
- Motion-enabled fixture renders validate duration and resolution.
- Motion debug report is available when requested.
- No external APIs, AI video generation, or generated episode asset mutation.

## 23. Open Questions

- Should render motion apply to shot-plan mode when `RenderShot.motion` already exists, or only to scene mode initially?
- Should `--motion-render-preset` be accepted on episode production commands immediately, or only on top-level `render` first?
- Should motion report paths be centralized in `packages/shared/src/episode-filesystem.ts` or kept render-output local?
- Should `ambient_light_flicker` use expression-based `eq` in v1, or a static mild `eq` until expression support is added?
