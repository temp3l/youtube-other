# Codex Prompt — Plan FFmpeg Motion Preset Implementation With Task Breakdown

You are working in an existing YouTube automation repository.

Goal:
Create a detailed implementation plan for adding an FFmpeg-first visual motion preset system to the existing video rendering pipeline.

This is a planning-only task. Do not implement production code yet, except for creating planning markdown files.

The application already generates YouTube videos from story/narration assets, generated images, localized scripts, audio, manifests, and FFmpeg rendering workflows. I want to add reusable visual motion effects for still images so that videos feel more dynamic without becoming cheap, noisy, or unstable.

The implementation must be deterministic, batchable, resumable, testable, FFmpeg-only, and safe for both full-length YouTube videos and YouTube Shorts.

---

## Core Requirements

Plan a motion preset system with 5 preset families:

1. Documentary Slow Drift
2. Tension Creep
3. Reveal / Discovery Motion
4. Shorts Dynamic Motion
5. Atmospheric Loop / Ambient Motion

The first implementation should support exactly these 15 presets:

```txt
Documentary:
- doc_slow_push_in
- doc_slow_pull_back
- doc_left_drift

Tension:
- tension_creep_zoom
- tension_breathing_frame
- tension_shadow_push

Reveal:
- reveal_pan_to_subject
- reveal_zoom_to_detail
- reveal_from_darkness

Shorts:
- short_fast_push
- short_snap_zoom
- short_impact_shake

Ambient:
- ambient_fog_drift
- ambient_light_flicker
- ambient_static_hold
```

Do not add AI video generation.
Do not introduce Remotion, After Effects, CapCut, Runway, Higgsfield, or other non-FFmpeg rendering dependencies.
Do not call external APIs.
Do not change generated episode assets.
Do not break existing full or short rendering.

---

## Motion Preset Recommendations

### 1. Documentary Slow Drift

Default for full-length narration videos.

Effects:
- slow zoom in or out
- subtle horizontal or vertical drift
- very mild motion only
- optional subtle vignette or grain only if the repository already supports it safely

Use for:
- exposition
- establishing shots
- calm narration
- character portraits
- documents
- houses
- forests
- rooms

Initial presets:
- `doc_slow_push_in`
- `doc_slow_pull_back`
- `doc_left_drift`

Recommended intensity:
- low
- safe for full videos
- optionally allowed for shorts at low frequency

Suggested FFmpeg behavior:
- slow `zoompan`
- conservative crop/scale safety margin
- no shake
- no strong color changes

---

### 2. Tension Creep

Used during suspense escalation.

Effects:
- slow zoom toward subject
- subtle breathing movement
- subtle shadow/darkness push
- almost imperceptible shake only if implemented safely
- no cheap glitch effects

Use for:
- knocking
- whistling
- footsteps
- shadows
- creepy windows
- doors
- woods
- hallways
- “something is wrong” beats

Initial presets:
- `tension_creep_zoom`
- `tension_breathing_frame`
- `tension_shadow_push`

Recommended intensity:
- medium
- safe for full and short videos
- should not repeat too often

Suggested FFmpeg behavior:
- slow zoom
- small sinusoidal x/y movement for breathing frame
- optional `eq` darkening curve if stable
- avoid aggressive shake by default

---

### 3. Reveal / Discovery Motion

Used sparingly for important discoveries and turns.

Effects:
- pan from empty space toward subject
- zoom from wide to detail
- dark-to-visible reveal
- short hold on final frame

Use for:
- finding marks on a window
- discovering an object
- seeing someone or something in the background
- evidence shots
- maps
- documents
- final clues

Initial presets:
- `reveal_pan_to_subject`
- `reveal_zoom_to_detail`
- `reveal_from_darkness`

Recommended intensity:
- medium/high depending on exact preset
- allowed for full and short videos
- should be selected rarely
- avoid consecutive repeats

Suggested FFmpeg behavior:
- deterministic pan/crop
- stronger but still safe zoom
- optional fade/brightness reveal
- final hold if compatible with existing segment generation

---

### 4. Shorts Dynamic Motion

Used mostly for vertical shorts.

Effects:
- faster zooms
- sentence-beat punch-ins
- alternating pan direction
- subtle impact shake on reveal moments
- short transition timing

Use for:
- short videos
- hooks
- fast story summaries
- high-retention edits

Initial presets:
- `short_fast_push`
- `short_snap_zoom`
- `short_impact_shake`

Recommended intensity:
- high
- only for shorts by default
- must not be selected for full videos unless explicitly overridden

Suggested FFmpeg behavior:
- stronger zoom range than full videos
- faster pan
- short shake burst only for `short_impact_shake`
- safe crop margins
- no excessive motion blur unless already supported

---

### 5. Atmospheric Loop / Ambient Motion

Used for mood-heavy images.

Effects:
- very slow movement
- subtle flicker
- minimal drift
- near-static hold

Use for:
- forests
- roads at night
- abandoned houses
- dark interiors
- quiet narration segments
- pauses before final line

Initial presets:
- `ambient_fog_drift`
- `ambient_light_flicker`
- `ambient_static_hold`

Recommended intensity:
- low
- safe for full videos
- rare in shorts

Suggested FFmpeg behavior:
- almost-static zoom/pan
- optional light flicker using `eq` if stable
- do not require external overlay assets for the first implementation
- do not implement real fog/rain/dust particles unless existing architecture already supports reusable overlays

---

## Recommended Distribution

For full-length videos:

```txt
Documentary Slow Drift: 45–55%
Tension Creep: 20–30%
Atmospheric Loop: 10–20%
Reveal / Discovery: 5–10%
Shorts Dynamic Motion: 0%
```

For shorts:

```txt
Shorts Dynamic Motion: 50–70%
Tension Creep: 15–25%
Reveal / Discovery: 10–20%
Documentary Slow Drift: 0–10%
Atmospheric Loop: 0–5%
```

---

## Recommended Motion Defaults

For full videos:

```txt
zoom: 1.00 → 1.06
pan: 2–6% of frame width
rotation: avoid initially unless already supported safely
shake: almost none
transition duration: 0.4–0.8s
effect duration: full shot duration
```

For shorts:

```txt
zoom: 1.00 → 1.12
pan: 5–12% of frame width
rotation: avoid initially unless already supported safely
shake: subtle, only on emphasis
transition duration: 0.15–0.35s
effect duration: tied to shot / narration segment duration
```

Avoid by default:
- heavy camera shake
- random spinning
- aggressive glitch effects
- repeated left-to-right pans
- constant zoom on every image with identical parameters
- excessive zoom that degrades generated images
- movement that exposes black borders
- non-deterministic randomness
- full-video use of shorts-style motion

---

## Repository Inspection Requirements

Inspect the current repository before writing the plan.

Find and document:

1. Current FFmpeg renderer entry points
2. Current full-video rendering workflow
3. Current short-video rendering workflow
4. Existing image-to-video segment generation logic
5. Existing concat / filter graph strategy
6. Existing aspect ratio handling
7. Existing scene/shot/image manifests
8. Existing CLI commands and flags
9. Existing renderer configuration
10. Existing test setup
11. Existing smoke tests or fixtures
12. Existing debug/logging/report files
13. Existing path conventions for generated assets
14. Existing resume/retry behavior
15. Any current motion, zoom, pan, crop, or transition logic

Do not assume the architecture. Inspect first.

---

## Architecture To Plan

Plan where the following concepts should live in the existing codebase.

Use these types as a starting point, but adjust naming and placement to match the repository:

```ts
export type MotionPresetFamily =
  | 'documentary'
  | 'tension'
  | 'reveal'
  | 'shorts'
  | 'ambient';

export type MotionIntensity = 'low' | 'medium' | 'high';

export type VideoKind = 'full' | 'short';

export type StoryBeat =
  | 'hook'
  | 'setup'
  | 'investigation'
  | 'tension'
  | 'discovery'
  | 'reveal'
  | 'ending';

export type ImageKind =
  | 'character'
  | 'location'
  | 'object'
  | 'evidence'
  | 'threat'
  | 'environment';

export interface MotionPreset {
  id: string;
  family: MotionPresetFamily;
  intensity: MotionIntensity;
  allowedFor: VideoKind[];
  minDurationSec: number;
  maxDurationSec: number;
  avoidConsecutiveRepeat: boolean;
}

export interface ShotMotionContext {
  videoKind: VideoKind;
  storyBeat: StoryBeat;
  imageKind: ImageKind;
  durationSec: number;
  shotIndex: number;
  totalShots: number;
  language?: string;
  seed?: string;
}

export interface SelectedMotionPreset {
  presetId: string;
  family: MotionPresetFamily;
  intensity: MotionIntensity;
  seed: string;
  reason: string;
}

export interface MotionRenderConfig {
  enabled: boolean;
  mode: 'off' | 'safe' | 'cinematic' | 'shorts';
  seed?: string;
  debug: boolean;
}
```

The final plan should define:
- exact proposed TypeScript types
- where they should be located
- how they integrate with existing manifest types
- how they integrate with renderer config
- how they integrate with CLI options
- how they remain backwards compatible

---

## Motion Selection Requirements

Plan a deterministic preset selection algorithm.

It should support:

1. Weighted selection by:
   - video kind
   - story beat
   - image kind
   - shot index
   - total shots
   - duration
   - optional explicit preset override

2. Deterministic randomness:
   - same episode + language + shot index + seed should produce same preset
   - repeated render should produce identical output
   - no reliance on `Math.random()` in production selection

3. Repeat prevention:
   - avoid same preset back-to-back
   - avoid too many presets from same family in a row
   - avoid consecutive high-intensity presets
   - avoid shorts presets in full videos unless explicitly overridden

4. Safe fallbacks:
   - if metadata is missing, use documentary or ambient default
   - if unknown story beat, use safe default
   - if unknown image kind, use safe default
   - if duration is too short or too long, clamp or choose compatible preset

5. Explicit overrides:
   - allow per-shot or per-scene preset override if existing manifest model supports it
   - validate override is compatible with video kind
   - fail with actionable message or fallback based on existing validation style

---

## FFmpeg Filter Planning Requirements

Plan how each preset should generate FFmpeg filters.

Evaluate the current renderer and recommend one of these strategies:

### Strategy A: Segment-first rendering

Render each still image into an animated video segment, then concatenate.

Pros:
- resumable
- easier retries
- easier debug
- easier per-shot motion manifests
- compatible with batch workflows

Cons:
- more intermediate files
- more FFmpeg invocations

### Strategy B: Single large filter graph

Build one large FFmpeg graph for the entire video.

Pros:
- fewer intermediate files
- potentially faster for small videos

Cons:
- harder to debug
- harder to resume
- more fragile command length
- harder to isolate failed shots

### Strategy C: Hybrid

Use existing segment logic if available, but keep final concat/composition in the current renderer.

Prefer segment-first if it matches the existing pipeline or can be added safely.

Evaluate using stable FFmpeg filters such as:

```txt
scale
crop
zoompan
fps
setsar
format
fade
eq
noise
overlay
concat
xfade
```

Only recommend practical filters that fit the current project.

The plan must address:
- 16:9 full video output
- 9:16 short video output
- image scaling
- crop safety
- avoiding black borders
- avoiding excessive zoom
- exact duration matching
- FPS consistency
- off-by-one frame prevention
- segment concat compatibility
- audio alignment
- deterministic output
- temporary file naming
- resume/retry behavior

---

## Manifest and Schema Planning

Inspect existing manifests and plan additive changes only.

Possible optional fields:

```ts
interface MotionManifestFields {
  motionPresetId?: string;
  motionFamily?: MotionPresetFamily;
  motionIntensity?: MotionIntensity;
  motionSeed?: string;
  motionReason?: string;
}
```

Do not make destructive schema changes.

Plan:
- how motion metadata is written
- where it is written
- how it is validated
- how old manifests continue working
- how explicit overrides are represented
- how generated motion reports are stored
- whether motion selection should mutate source manifests or write separate render reports

Prefer not mutating canonical source/story manifests unless the existing architecture already does this.

---

## CLI Planning

Inspect existing CLI commands.

Plan CLI flags such as:

```txt
--motion
--no-motion
--motion-mode safe
--motion-mode cinematic
--motion-mode shorts
--motion-seed <seed>
--motion-debug
--motion-preset <presetId>
```

Decide which commands should support them.

Requirements:
- current behavior should remain unchanged unless enabling motion by default is already consistent with project conventions
- allow disabling motion
- allow deterministic seed
- allow debug report
- allow explicit preset override for smoke testing
- CLI help should be updated
- invalid options should fail clearly

---

## Debugging and Observability

Plan debug/report output.

A motion report should include:

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

Plan:
- where this report should be saved
- how to enable/disable it
- how it helps resume/retry
- how errors should be reported
- how to keep logs readable

---

## Testing Requirements

Plan tests before implementation.

Required test areas:

1. Characterization tests
   - capture current renderer behavior before motion changes
   - prove existing full/short rendering still works with motion disabled

2. Type/config tests
   - preset registry contains exactly expected initial presets
   - preset IDs are unique
   - allowed video kinds are valid
   - durations and intensities are valid

3. Selection tests
   - deterministic same seed
   - different seed can vary
   - no consecutive repeated preset when avoid flag is set
   - no shorts presets for full videos by default
   - correct fallback behavior for missing metadata
   - approximate family distribution over many shots

4. FFmpeg filter builder tests
   - each preset generates a non-empty filter graph/string
   - filters include expected stable primitives
   - output resolution is respected
   - duration/fps frame count is calculated safely
   - no unsupported filters are used

5. Renderer integration tests
   - motion disabled preserves old behavior
   - motion enabled creates animated segments
   - segment duration matches narration segment
   - final output exists
   - expected resolution is produced

6. Smoke tests
   - use local fixture images/audio only
   - render 3–5 images
   - verify output duration and resolution with `ffprobe`
   - no external APIs
   - no generated production assets modified

---

## Performance and Reliability

Plan how to preserve performance and reliability.

Requirements:
- do not create unnecessary intermediate files unless current renderer already does
- keep FFmpeg command length manageable
- support retrying failed shot segments
- support skipping already-rendered valid segments if existing pipeline supports resume
- avoid memory-heavy filters
- avoid per-frame expensive overlays in the first implementation
- keep image scaling conservative
- avoid generating huge temporary videos unnecessarily
- use existing renderer configuration for FPS, resolution, codec, paths, and logging when possible

---

## Deliverables To Create

Create this planning document:

```txt
docs/plans/ffmpeg-motion-presets/implementation-plan.md
```

The document must include:

1. Executive summary
2. Current rendering pipeline summary
3. Existing files/modules involved
4. Current FFmpeg strategy
5. Recommended integration strategy
6. Proposed architecture
7. Proposed TypeScript types/interfaces
8. Preset registry design
9. Preset family and preset definitions
10. Preset selection algorithm
11. FFmpeg filter generation strategy
12. Full-video behavior
13. Shorts behavior
14. Manifest/schema changes
15. CLI changes
16. Debug/reporting design
17. Testing strategy
18. Performance considerations
19. Migration/backward compatibility plan
20. Risks and mitigations
21. Safe implementation order
22. Acceptance criteria
23. Open questions, if any

Also create task prompt files under:

```txt
docs/plans/ffmpeg-motion-presets/tasks/
```

Create these files:

```txt
task-01-characterization-tests.md
task-02-motion-types-and-config.md
task-03-preset-registry.md
task-04-seeded-selection.md
task-05-ffmpeg-filter-builder.md
task-06-renderer-integration.md
task-07-cli-and-manifest-integration.md
task-08-debug-reporting.md
task-09-smoke-tests-and-docs.md
```

Each task file must be a self-contained Codex implementation prompt.

Each task file must include:

1. Goal
2. Context
3. Files to inspect
4. Implementation steps
5. Tests to add/update
6. Acceptance criteria
7. Rollback notes
8. Explicit constraints
9. Instruction not to make unrelated changes

---

## Required Task Breakdown

Use this task structure unless repository inspection reveals a better split.

### Task 01 — Characterization Tests

Goal:
Add tests that capture current rendering behavior before adding motion.

Must cover:
- current full render behavior
- current short render behavior
- motion-disabled future compatibility if possible
- fixture-based render path
- no external APIs

Acceptance:
- tests pass before production motion implementation
- no renderer behavior changed
- fixture output, if generated, is isolated from production assets

---

### Task 02 — Motion Types and Config

Goal:
Add strict TypeScript domain types and central config for motion rendering.

Must include:
- motion preset family type
- motion intensity type
- video kind integration
- story beat/image kind mapping if applicable
- motion render config
- safe defaults
- global enable/disable
- seed config

Acceptance:
- strict types compile
- no runtime behavior change
- motion disabled by default unless plan justifies otherwise

---

### Task 03 — Preset Registry

Goal:
Add the initial 15-preset registry.

Must include:
- preset IDs
- family
- intensity
- allowed video kinds
- min/max durations
- repeat rules
- initial weights or metadata needed for selection

Acceptance:
- all 15 presets exist
- IDs are unique
- registry is validated by tests
- no FFmpeg rendering behavior changed yet

---

### Task 04 — Seeded Selection

Goal:
Implement deterministic preset selection.

Must include:
- seeded random utility or reuse existing deterministic utility
- weighted selection
- full vs short distribution
- story beat/image kind influence
- repeat prevention
- safe fallbacks
- explicit override handling if supported

Acceptance:
- same seed returns same selections
- no forbidden shorts presets in full videos
- no consecutive disallowed repeats
- selection tests pass

---

### Task 05 — FFmpeg Filter Builder

Goal:
Implement FFmpeg filter generation for the 15 presets without integrating into production renderer yet.

Must include:
- filter builder API
- output resolution support
- FPS support
- duration/frame calculation
- 16:9 and 9:16 handling
- safe crop/scale/zoompan logic
- preset-specific filter generation
- testable pure functions where possible

Acceptance:
- each preset generates valid-looking FFmpeg filter string/graph
- tests cover all presets
- no production render path changed yet

---

### Task 06 — Renderer Integration

Goal:
Integrate motion rendering into the existing FFmpeg renderer safely.

Must include:
- motion disabled path preserves existing behavior
- motion enabled path animates still images
- segment duration matches narration duration
- full and short support
- resume/retry compatibility
- existing paths respected

Acceptance:
- existing rendering tests still pass
- motion-enabled fixture render succeeds
- motion-disabled render remains unchanged

Do not run this in parallel with Task 07.

---

### Task 07 — CLI and Manifest Integration

Goal:
Expose motion options through CLI and optional manifest fields.

Must include:
- CLI flags
- validation
- help text
- optional manifest fields
- explicit preset override if compatible
- backwards compatibility

Suggested flags:

```txt
--motion
--no-motion
--motion-mode safe
--motion-mode cinematic
--motion-mode shorts
--motion-seed <seed>
--motion-debug
--motion-preset <presetId>
```

Acceptance:
- current CLI behavior remains compatible
- invalid flags fail clearly
- old manifests still render
- optional motion metadata is additive

Do not run this in parallel with Task 06.

---

### Task 08 — Debug Reporting

Goal:
Add motion debug/report output.

Must include:
- selected preset per shot
- preset family/intensity
- duration
- input image
- output segment
- seed
- selection reason
- FFmpeg filter summary
- failure details if available

Acceptance:
- report is written when debug enabled
- report is not written/noisy when debug disabled
- report path follows existing output conventions
- useful for retry/debug

---

### Task 09 — Smoke Tests and Docs

Goal:
Add final smoke verification and operator documentation.

Must include:
- smoke render with 3–5 local fixture images
- full and/or short fixture depending on existing test cost
- ffprobe validation
- documentation for presets and CLI usage
- examples for full videos and shorts
- troubleshooting section

Acceptance:
- smoke test passes locally/CI if appropriate
- docs explain how to enable/disable motion
- docs explain safe defaults
- docs explain how to reproduce a render with seed

---

## Parallelization Guidance

The plan must clearly state:

Safe to run sequentially:

```txt
Task 01 → Task 02 → Task 03 → Task 04 → Task 05 → Task 06 → Task 07 → Task 08 → Task 09
```

Can potentially run in parallel after Task 01:

```txt
Task 02 and documentation skeleton parts of Task 09
```

Can potentially run in parallel after Task 03:

```txt
Task 04 and parts of Task 05 only if they touch clearly separate files
```

Should not run in parallel:

```txt
Task 06 and Task 07
Task 06 and Task 08
Task 05 and Task 06
Any task that modifies the same renderer entry points
```

Renderer integration should happen only after:
- characterization tests exist
- types/config exist
- registry exists
- seeded selection exists
- filter builder exists

---

## Acceptance Criteria For The Planning Run

The planning run is complete only when:

1. `docs/plans/ffmpeg-motion-presets/implementation-plan.md` exists.
2. All 9 task prompt files exist under `docs/plans/ffmpeg-motion-presets/tasks/`.
3. The plan is based on actual repository inspection.
4. The plan lists concrete existing files/modules to modify.
5. The plan recommends a specific FFmpeg integration strategy.
6. The plan includes backwards compatibility guidance.
7. The plan includes safe implementation ordering.
8. The plan includes clear test strategy.
9. The plan includes risks and mitigations.
10. No production code behavior has been changed.

---

## Important Constraints

- Do not implement the motion system in this planning run.
- Do not make unrelated refactors.
- Do not rename existing renderer files unless the plan explicitly justifies it.
- Do not remove existing behavior.
- Do not change generated episode outputs.
- Do not call external APIs.
- Do not introduce non-FFmpeg dependencies.
- Prefer strict TypeScript.
- Prefer additive changes.
- Preserve existing full and short rendering.
- Preserve existing batch/resume behavior.
- Keep defaults conservative.
- Make the system deterministic and reproducible.
- Keep the implementation suitable for production automation.

---

## Final Response

After creating the planning document and task prompt files, respond with:

1. A short summary of the current renderer architecture you found.
2. The recommended integration strategy.
3. The generated plan file path.
4. The generated task file paths.
5. The safe implementation order.
6. Which tasks can be run sequentially in one session.
7. Which tasks must not be run in parallel.
8. Any important open questions or risks.
