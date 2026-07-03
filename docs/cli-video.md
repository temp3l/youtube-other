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
  --visual-profile shorts-aggressive
```

For the full English video:

```bash
pnpm mediaforge -- episode english \
  --episode 022-the-whistler-in-the-woods \
  --visual-retention-mode enabled \
  --visual-profile balanced
```

For a localized short, for example German:

```bash
pnpm mediaforge -- episode short \
  --episode 022-the-whistler-in-the-woods \
  --language de \
  --visual-retention-mode enabled \
  --visual-profile shorts-aggressive
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
