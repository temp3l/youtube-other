# CLI Video

This guide covers the shot-aware video workflow for episode `022-the-whistler-in-the-woods`.

Use the repository root as your working directory.

## Prerequisites

Build the CLI once:

```bash
pnpm --filter @mediaforge/cli build
```

Episode `022-the-whistler-in-the-woods` already contains the scene plans, images, and narration artifacts this workflow expects.

## What the shot workflow does

The shot pipeline creates render-time camera motion from still images:

- crops
- pans
- zooms
- combined pan-and-zoom moves

The operator-facing command family is `shots`. It writes planning and review artifacts under:

`episodes/022-the-whistler-in-the-woods/state/visual-retention/`

Important files:

- `source-scenes.json`
- `focal-metadata.json`
- `shot-plan.<variant>.<locale>.json`
- `validation.<variant>.<locale>.json`
- `storyboard.<variant>.<locale>.html`
- `contact-sheet.<variant>.<locale>.png`

## 1. Plan a shot-aware short

This is the fastest way to generate a shot plan for the short English variant of episode 022.

```bash
pnpm mediaforge -- shots plan \
  --episode 022-the-whistler-in-the-woods \
  --variant short \
  --locale en
```

Use `--profile` to override the pacing profile when needed:

```bash
pnpm mediaforge -- shots plan \
  --episode 022-the-whistler-in-the-woods \
  --variant short \
  --locale en \
  --profile shorts-aggressive
```

Available profiles used by the episode workflow:

- `atmospheric`
- `balanced`
- `high-retention`
- `shorts-aggressive`

Motion preset levels are selected separately with `--motion-preset`:

- `subtle`: conservative push-ins, pans, and drifts
- `balanced`: safe default for most full videos and shorts
- `strong`: higher-motion planning for retention-heavy edits

The generated shot plan stores its deterministic `planningSeed`. With the same episode, locale, variant, visual profile, motion preset, source scenes, and source images, re-running `shots plan` produces the same plan unless upstream artifacts change.

## 2. Inspect the planned motion

Inspect summarizes how many shots were created from the available source images and which treatments were selected.

```bash
pnpm mediaforge -- shots inspect \
  --episode 022-the-whistler-in-the-woods \
  --variant short \
  --locale en
```

JSON output is available when you want to script against the report:

```bash
pnpm mediaforge -- shots inspect \
  --episode 022-the-whistler-in-the-woods \
  --variant short \
  --locale en \
  --format json
```

## 3. Validate crops, motion, and reuse limits

Validation catches invalid crop bounds, overuse of the same source image, and other shot-plan issues before render.

```bash
pnpm mediaforge -- shots validate \
  --episode 022-the-whistler-in-the-woods \
  --variant short \
  --locale en
```

This writes:

- `episodes/022-the-whistler-in-the-woods/state/visual-retention/validation.short.en.json`

## 4. Generate storyboard preview artifacts

Preview creates an HTML storyboard and a contact-sheet PNG. This is the easiest way to review pan/zoom/crop behavior without rendering the full video.

```bash
pnpm mediaforge -- shots preview \
  --episode 022-the-whistler-in-the-woods \
  --variant short \
  --locale en
```

This writes:

- `episodes/022-the-whistler-in-the-woods/state/visual-retention/storyboard.short.en.html`
- `episodes/022-the-whistler-in-the-woods/state/visual-retention/contact-sheet.short.en.png`

## 5. Render with visual retention enabled

The top-level `render` command does not expose shot-plan flags directly. The shot-aware render path is enabled through the `episode` workflow commands.

For the short English video:

```bash
pnpm mediaforge -- episode short \
  --episode 022-the-whistler-in-the-woods \
  --language en \
  --visual-retention-mode enabled \
  --visual-profile shorts-aggressive \
  --motion-preset balanced
```

For the full English video:

```bash
pnpm mediaforge -- episode english \
  --episode 022-the-whistler-in-the-woods \
  --visual-retention-mode enabled \
  --visual-profile balanced \
  --motion-preset subtle
```

For a localized short, for example German:

```bash
pnpm mediaforge -- episode short \
  --episode 022-the-whistler-in-the-woods \
  --language de \
  --visual-retention-mode enabled \
  --visual-profile shorts-aggressive \
  --motion-preset strong
```

## Preview vs enabled

Use `preview` when you want the shot artifacts but do not want the final render to consume them yet:

```bash
pnpm mediaforge -- episode short \
  --episode 022-the-whistler-in-the-woods \
  --language en \
  --visual-retention-mode preview \
  --visual-profile shorts-aggressive
```

Use `enabled` when the final clean render should use the generated shot plan and motion.

Use `disabled` or `--no-visual-retention` when you want the legacy still-image scene render without shot-plan motion:

```bash
pnpm mediaforge -- episode short \
  --episode 022-the-whistler-in-the-woods \
  --language en \
  --visual-retention-mode disabled
```

## FFmpeg motion presets

Motion is FFmpeg-only. No external APIs are called during render-time motion; the renderer applies local filters to existing still images and mixes existing local audio.

Render-report preset IDs:

- Documentary: `doc_slow_push_in`, `doc_slow_pull_back`, `doc_left_drift`
- Tension: `tension_creep_zoom`, `tension_breathing_frame`, `tension_shadow_push`
- Reveal: `reveal_pan_to_subject`, `reveal_zoom_to_detail`, `reveal_from_darkness`
- Shorts-only: `short_fast_push`, `short_snap_zoom`, `short_impact_shake`
- Ambient: `ambient_fog_drift`, `ambient_light_flicker`, `ambient_static_hold`

The operator-facing `--motion-preset subtle|balanced|strong` controls how much motion the shot planner chooses. It is separate from render-time preset selection.

The top-level render command accepts FFmpeg render-motion flags:

```bash
npm run mediaforge -- render 022-the-whistler-in-the-woods \
  --profile youtube \
  --motion \
  --motion-mode cinematic \
  --motion-seed episode-022 \
  --motion-debug \
  --motion-render-preset doc_slow_push_in
```

Use `--no-motion` or `--motion-mode off` to disable render-time motion. The FFmpeg renderer maps shot-plan motion and optional `--motion-render-preset` selection to local filter operations such as zoompan, crop, scale, pad, fade, and small rotation.

When render motion debug is enabled by the caller, the renderer writes:

- `<outputDir>/motion-report.json`

The report includes shot IDs, selected preset IDs, filter summaries, cache status, and per-shot seeds formatted as `<render-seed>:<shot-id>`. The render manifest stores the selected render-motion config under `motion`.

To reproduce a render:

1. Keep the same source images, source scene files, narration audio, visual profile, shot-planning motion preset, render-motion preset, and shot plan.
2. Reuse the same `planningSeed` from `shot-plan.<variant>.<locale>.json`.
3. Re-render with the same output profile and FFmpeg version when exact frame-level output matters.

Troubleshooting:

- If motion looks disabled, confirm `--visual-retention-mode enabled` was used.
- If the render uses old shot clips, remove only the affected derived-shot cache entries or change the shot plan; do not regenerate production images.
- If validation fails on duration or resolution, inspect `render.json`, `motion-report.json` when present, and run the focused rendering smoke test before changing fixtures.

## Strict validation

Fail the run when shot validation produces warnings:

```bash
pnpm mediaforge -- episode short \
  --episode 022-the-whistler-in-the-woods \
  --language en \
  --visual-retention-mode enabled \
  --visual-profile shorts-aggressive \
  --strict-shot-validation
```

## Recommended operator loop

For episode 022 Shorts:

1. `shots plan`
2. `shots inspect`
3. `shots validate`
4. `shots preview`
5. `episode short --visual-retention-mode enabled`

That sequence lets you review the planned pans, zooms, and crops before committing to a full render.
