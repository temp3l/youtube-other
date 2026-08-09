# Veronica Benini image and narration production

Veronica positioning episodes use the canonical image and staged narration
pipelines. Production remains opt-in: publishing is disabled and generated
creator likeness is always blocked. Synthetic narration may use a built-in
provider voice for a prepared episode.

## Prepare an episode

The adapter validates the approved positioning plan, creates canonical
`scene-###` records with the reviewed text-free prompts, and writes the script
paths consumed by the shared media pipelines.

```bash
pnpm mediaforge -- veronica-media prepare-production \
  --workspace episodes \
  --episode-id l01-s01-being-good-isnt-enough \
  --language de \
  --variant short
```

Use `--plan` or `--script` only when the files are not under the episode's
standard `source/` and `languages/` paths.

## Images

Synchronous generation supports bounded scene concurrency:

```bash
pnpm mediaforge -- veronica-media images generate \
  --workspace episodes \
  --episode-id l01-s01-being-good-isnt-enough \
  --mode sync \
  --concurrency 4
```

Provider-batch mode prepares the same canonical image batch artifacts. It does
not auto-submit paid work; inspect the JSON and use the existing `images batch
submit/status/download/validate` lifecycle.

```bash
pnpm mediaforge -- veronica-media images generate \
  --workspace episodes \
  --episode-id l01-s01-being-good-isnt-enough \
  --mode batch \
  --language de \
  --variant short \
  --max-batch-size 50 \
  --json
```

The Veronica prompt profile preserves positioning-plan prompts, adds the
European editorial-documentary treatment, keeps generated images text-free for
localized overlays, and forbids any Veronica likeness.

## Speech

Planning and status inspection do not require provider authorization. Actual
synthetic generation uses the configured provider:

Veronica defaults to OpenAI's built-in `shimmer` voice. Override it only with
another approved female-presenting built-in voice.

```bash
pnpm mediaforge -- veronica-media speech plan \
  --workspace episodes \
  --episode-id l01-s01-being-good-isnt-enough \
  --language de --variant short --dry-run

pnpm mediaforge -- veronica-media speech generate \
  --workspace episodes \
  --episode-id l01-s01-being-good-isnt-enough \
  --language de --variant short \
  --concurrency 2 \
  --resume
```

For multi-locale or full/short processing, pass `--all-languages` and/or
`--all-variants`.

No command above publishes a video or enables `autoPublish`.
