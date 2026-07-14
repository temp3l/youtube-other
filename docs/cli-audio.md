# CLI Audio

This guide covers the current `audio` command family for episode `022-the-whistler-in-the-woods`.

Use the repository root as your working directory.

Educational mathematics narration is intentionally separate from the generic episode commands in
this guide. Its canonical surface is `math speech generate`, which defaults to the typed
`education-natural-teacher` profile without changing documentary or Dark Truth behavior. See
`docs/architecture/educational-speech-pipeline.md` for commands, candidates, dry-run output, and
manual listening evaluation.

## Prerequisites

Build the CLI once:

```bash
pnpm --filter @mediaforge/cli build
```

Common global options used by audio commands:

- `--tts-provider openai-compatible`
- `--openai-api-key <key>`
- `--openai-base-url <url>`
- `--openai-speech-model <model>`
- `--openai-speech-voice <voice>`
- `--speech-voice-preset <slow|fast|very-fast>`
- `--narration-pipeline-mode <legacy|shadow|new>`
- `--json`
- `--dry-run`

Narration generation no longer permits mocked speech. Any `audio generate`, `audio generate-localized`, or `audio narration generate|all` run must use `--tts-provider openai-compatible` with a configured API key.

## Command map

The audio surface has three operator modes:

- `audio generate`: legacy single-language narration generation
- `audio generate-localized`: batch localized generation
- `audio narration ...`: staged narration pipeline

There is also:

- `audio narration benchmark-voices`

## 1. Legacy single-language generation

Generate narration for the default script language for episode 022:

```bash
pnpm mediaforge -- \
  --tts-provider openai-compatible \
  audio generate 022-the-whistler-in-the-woods
```

This legacy path writes full-variant outputs for the selected language under the locale root, for example:

- `episodes/022-the-whistler-in-the-woods/locales/en/full/audio/narration.wav`
- `episodes/022-the-whistler-in-the-woods/locales/en/full/audio/generation-report.json`
- `episodes/022-the-whistler-in-the-woods/locales/en/full/audio/tts-generation.json`

Use `--dry-run` to inspect the planned paths without writing:

```bash
pnpm mediaforge -- \
  --tts-provider openai-compatible \
  --dry-run \
  audio generate 022-the-whistler-in-the-woods
```

## 2. Legacy localized batch generation

Generate localized narration for selected languages:

```bash
pnpm mediaforge -- \
  --tts-provider openai-compatible \
  audio generate-localized 022-the-whistler-in-the-woods \
  --languages de
```

Generate every non-English localized script found in the episode workspace:

```bash
pnpm mediaforge -- \
  --tts-provider openai-compatible \
  audio generate-localized 022-the-whistler-in-the-woods
```

Useful flags:

- `--languages de,en`
- `--dry-run`
- `--strict`

`--strict` returns a non-zero exit when warnings are present in the batch summary.

## 3. Staged narration pipeline

Use the staged pipeline when you want explicit preparation, chunk planning, generation, assembly, validation, and status inspection.

The public stages are:

- `prepare`
- `plan`
- `generate`
- `assemble`
- `validate`
- `status`
- `inspect`

Shared options:

- `--episode <episode-id>`
- `--language <code>`
- `--languages <comma-list>`
- `--variant <full|short>`
- `--all-languages`
- `--all-variants`
- `--resume`
- `--force`
- `--validation-only`
- `--dry-run`
- `--strict`
- `--concurrency <n>`
- `--json`

## 4. Rollout modes

`--narration-pipeline-mode` is a global option and must appear before `audio`.

- `legacy`: keeps the old behavior
- `shadow`: writes staged narration artifacts but does not promote compatibility `narration.wav`
- `new`: staged narration is authoritative and assembly promotes `mastered-narration.wav` to compatibility output

Typical migration flow for episode 022 is:

1. Run staged commands in `shadow`.
2. Inspect `quality-gate.json`.
3. Re-run in `new` with `--resume`.

## 5. Run one staged target

Prepare English full narration:

```bash
pnpm mediaforge -- \
  --tts-provider openai-compatible \
  --narration-pipeline-mode shadow \
  audio narration prepare \
  --episode 022-the-whistler-in-the-woods \
  --language en \
  --variant full
```

Plan chunking:

```bash
pnpm mediaforge -- \
  --tts-provider openai-compatible \
  --narration-pipeline-mode shadow \
  audio narration plan \
  --episode 022-the-whistler-in-the-woods \
  --language en \
  --variant full
```

Generate audio chunks:

```bash
pnpm mediaforge -- \
  --tts-provider openai-compatible \
  --narration-pipeline-mode shadow \
  audio narration generate \
  --episode 022-the-whistler-in-the-woods \
  --language en \
  --variant full \
  --concurrency 2
```

Assemble mastered narration:

```bash
pnpm mediaforge -- \
  --tts-provider openai-compatible \
  --narration-pipeline-mode shadow \
  audio narration assemble \
  --episode 022-the-whistler-in-the-woods \
  --language en \
  --variant full
```

Validate the staged target:

```bash
pnpm mediaforge -- \
  --tts-provider openai-compatible \
  --narration-pipeline-mode shadow \
  audio narration validate \
  --episode 022-the-whistler-in-the-woods \
  --language en \
  --variant full \
  --strict
```

## 6. Run all stages across languages and variants

Episode 022 currently has staged narration artifacts for `en/full` and `de/full`. This is the aggregate pattern:

```bash
pnpm mediaforge -- \
  --tts-provider openai-compatible \
  --narration-pipeline-mode shadow \
  audio narration prepare \
  --episode 022-the-whistler-in-the-woods \
  --all-languages \
  --all-variants
```

Repeat the same shape for `plan`, `generate`, `assemble`, and `validate`.

Example validation pass:

```bash
pnpm mediaforge -- \
  --tts-provider openai-compatible \
  --narration-pipeline-mode shadow \
  audio narration validate \
  --episode 022-the-whistler-in-the-woods \
  --all-languages \
  --all-variants \
  --json
```

## 7. Inspect status and artifacts

Batch status:

```bash
pnpm mediaforge -- audio narration status \
  --episode 022-the-whistler-in-the-woods \
  --all-languages \
  --all-variants \
  --json
```

Inspect one target:

```bash
pnpm mediaforge -- audio narration inspect \
  --episode 022-the-whistler-in-the-woods \
  --language en \
  --variant full \
  --json
```

The staged artifacts for one target live under:

`episodes/022-the-whistler-in-the-woods/locales/<locale>/<variant>/audio/narration/`

Important files:

- `spoken-text.md`
- `spoken-text.json`
- `chunk-manifest.json`
- `performance-directions.json`
- `pronunciation-transforms.json`
- `assembly-manifest.json`
- `clean-narration.wav`
- `mastered-narration.wav`
- `quality-gate.json`
- `quality-gate.md`
- `generation-metadata.json`

Compatibility output promoted by `new` mode:

- `episodes/022-the-whistler-in-the-woods/locales/<locale>/<variant>/audio/narration.wav`

## 8. Promote staged narration to compatibility output

After a successful `shadow` pass, switch to `new` and reuse completed work:

```bash
pnpm mediaforge -- \
  --tts-provider openai-compatible \
  --narration-pipeline-mode new \
  audio narration assemble \
  --episode 022-the-whistler-in-the-woods \
  --language en \
  --variant full \
  --resume
```

Or run the aggregate localized path in `new` mode:

```bash
pnpm mediaforge -- \
  --tts-provider openai-compatible \
  --narration-pipeline-mode new \
  audio generate-localized 022-the-whistler-in-the-woods \
  --languages de \
  --strict
```

## 9. Validate only

When the staged artifacts already exist and you only want the gate:

```bash
pnpm mediaforge -- \
  --tts-provider openai-compatible \
  --narration-pipeline-mode shadow \
  audio narration validate \
  --episode 022-the-whistler-in-the-woods \
  --language de \
  --variant full \
  --validation-only
```

## 10. Benchmark voices

Generate comparison samples before committing to a voice:

```bash
pnpm mediaforge -- \
  --tts-provider openai-compatible \
  audio narration benchmark-voices \
  --voices alloy,onyx \
  --max-samples 4 \
  --language en \
  --variant full
```

By default this writes to:

`episodes/state/voice-benchmarks/<language>/<variant>/voice-benchmark.json`

You can override the output directory:

```bash
pnpm mediaforge -- \
  --tts-provider openai-compatible \
  audio narration benchmark-voices \
  --voices alloy,onyx \
  --language en \
  --variant full \
  --output-dir /tmp/mediaforge-voice-benchmark
```

## Recommended operator loop

For episode 022 staged narration:

1. `audio narration prepare`
2. `audio narration plan`
3. `audio narration generate`
4. `audio narration assemble`
5. `audio narration validate`
6. `audio narration inspect`
7. switch from `shadow` to `new` and rerun with `--resume` when the quality gate is acceptable
