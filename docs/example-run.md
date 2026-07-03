# Example Run: Episode 023

This runbook uses the CLI surface registered in `apps/cli` to produce the English and German outputs for episode `023-the-vanishing-hitchhiker`.

Use the repository root as your working directory.

Episode slug used below:

```bash
EPISODE=023-the-vanishing-hitchhiker
REVIEWER="<name>"
```

Build once before running the pipeline:

```bash
pnpm build
pnpm doctor
```

## 1. Generate the story artifacts

Write the canonical English full story plus the German full story:

```bash
pnpm mediaforge -- stories rewrite-full \
  --episode "$EPISODE" \
  --languages de
```

Run the English full production analysis gate:

```bash
pnpm mediaforge -- stories analyze \
  --episode "$EPISODE" \
  --language en \
  --format full
```

Generate shared character artifacts and reference images:

```bash
pnpm mediaforge -- stories bootstrap-shared \
  --episode "$EPISODE"
```

Write the English and German short story artifacts:

```bash
pnpm mediaforge -- stories rewrite-short \
  --episode "$EPISODE" \
  --languages en,de
```

## 2. Generate the final episode branches

Generate the English full branch, including narration, scene plan, images, render, manifests, and review package:

```bash
pnpm mediaforge -- episode english \
  --episode "$EPISODE"
```

Approve the English full branch so localized full generation can proceed:

```bash
pnpm mediaforge -- episode review approve \
  --episode "$EPISODE" \
  --language en \
  --artifact full \
  --reviewer "$REVIEWER"
```

Generate the German full branch:

```bash
pnpm mediaforge -- episode localized \
  --episode "$EPISODE" \
  --languages de
```

Approve the German full branch so the German short branch can proceed:

```bash
pnpm mediaforge -- episode review approve \
  --episode "$EPISODE" \
  --language de \
  --artifact full \
  --reviewer "$REVIEWER"
```

Generate the English short video branch:

```bash
pnpm mediaforge -- episode short \
  --episode "$EPISODE" \
  --language en
```

Generate the German short video branch:

```bash
pnpm mediaforge -- episode short \
  --episode "$EPISODE" \
  --language de
```

## 3. Explicit audio commands for English and German

The `episode` commands above already produce compatible narration outputs. If you want the dedicated staged narration pipeline for both languages and both variants, run:

```bash
pnpm mediaforge -- \
  --tts-provider openai-compatible \
  --narration-pipeline-mode new \
  audio narration prepare \
  --episode "$EPISODE" \
  --languages en,de \
  --all-variants

pnpm mediaforge -- \
  --tts-provider openai-compatible \
  --narration-pipeline-mode new \
  audio narration plan \
  --episode "$EPISODE" \
  --languages en,de \
  --all-variants

pnpm mediaforge -- \
  --tts-provider openai-compatible \
  --narration-pipeline-mode new \
  audio narration generate \
  --episode "$EPISODE" \
  --languages en,de \
  --all-variants

pnpm mediaforge -- \
  --tts-provider openai-compatible \
  --narration-pipeline-mode new \
  audio narration assemble \
  --episode "$EPISODE" \
  --languages en,de \
  --all-variants

pnpm mediaforge -- \
  --tts-provider openai-compatible \
  --narration-pipeline-mode new \
  audio narration validate \
  --episode "$EPISODE" \
  --languages en,de \
  --all-variants \
  --strict
```

## 4. Generate and validate images

Character references are covered by `stories bootstrap-shared`. For the scene-image workflow, run:

```bash
pnpm mediaforge -- images plan \
  --episode "$EPISODE"

pnpm mediaforge -- images generate \
  --episode "$EPISODE"

pnpm mediaforge -- images validate "$EPISODE"

pnpm mediaforge -- images status "$EPISODE"
```

If a run is interrupted:

```bash
pnpm mediaforge -- images resume \
  --episode "$EPISODE"
```

## 5. Generate thumbnails

English full thumbnail:

```bash
pnpm mediaforge -- thumbnails generate \
  --episode-slug "$EPISODE" \
  --locale en \
  --format full
```

German full thumbnail:

```bash
pnpm mediaforge -- thumbnails generate \
  --episode-slug "$EPISODE" \
  --locale de \
  --format full
```

English short thumbnail:

```bash
pnpm mediaforge -- thumbnails generate \
  --episode-slug "$EPISODE" \
  --locale en \
  --format short
```

German short thumbnail:

```bash
pnpm mediaforge -- thumbnails generate \
  --episode-slug "$EPISODE" \
  --locale de \
  --format short
```

## 6. Generate YouTube metadata

English metadata:

```bash
pnpm mediaforge -- --language en metadata youtube \
  --episode "$EPISODE" \
  --force
```

German metadata:

```bash
pnpm mediaforge -- --language de metadata youtube \
  --episode "$EPISODE" \
  --force
```

## 7. Package and inspect the episode outputs

```bash
pnpm mediaforge -- package "$EPISODE"

pnpm mediaforge -- episode status \
  --episode "$EPISODE"
```

## 8. Upload commands for the full videos

This runbook keeps the upload section to the full-length videos. The CLI can accept explicit `--video-path` overrides for shorts, but the metadata surface is episode-level and is less explicit for the short variant.

English full upload:

```bash
pnpm mediaforge -- --language en youtube upload \
  --episode "$EPISODE" \
  --privacy-status private \
  --thumbnail-path thumbnails/full/en.png
```

German full upload:

```bash
pnpm mediaforge -- --language de youtube upload \
  --episode "$EPISODE" \
  --privacy-status private \
  --thumbnail-path thumbnails/full/de.png
```
