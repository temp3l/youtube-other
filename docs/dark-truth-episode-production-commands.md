# Dark Truth Episode Production Commands

This document is the command-line runbook for the Dark Truth episode workflow in this repository.

It covers:

- story translation in sync or batch mode;
- the episode-local English optimization output;
- character maps and character reference images;
- full and short image generation;
- audio, video, metadata, and upload steps;
- a worked example for episode `009-mary-gloria-the-christmas-doll`.

All commands below assume you run them from the repository root.

## Output Layout

The current episode workspace uses the following layout:

```text
episodes/<episode-slug>/script.md
episodes/<episode-slug>/en/short/script.md
episodes/<episode-slug>/<lang>/full/script.md
episodes/<episode-slug>/<lang>/short/script.md
episodes/<episode-slug>/shared/characters.json
episodes/<episode-slug>/shared/images/character-references/
episodes/<episode-slug>/shared/images/generated/
episodes/<episode-slug>/shared/short/images/generated/
episodes/<episode-slug>/output/
episodes/<episode-slug>/generated-assets/upload-reports/
```

The canonical optimized English story is written to:

```text
episodes/<episode-slug>/script.md
```

The localized story outputs are written under the episode folder, grouped by language and artifact type.

## 1. Generate The Optimized English Story

Use the story-localization pipeline to generate the optimized English story first.

### Sync mode

```bash
npm run stories:localize -- \
  --episode <episode-id-or-slug> \
  --mode sync \
  --languages de,es,fr \
  --include-english-short
```

This generates:

- `episodes/<episode-slug>/script.md`
- `episodes/<episode-slug>/en/short/script.md`
- `episodes/<episode-slug>/de/full/script.md`
- `episodes/<episode-slug>/de/short/script.md`
- `episodes/<episode-slug>/es/full/script.md`
- `episodes/<episode-slug>/es/short/script.md`
- `episodes/<episode-slug>/fr/full/script.md`
- `episodes/<episode-slug>/fr/short/script.md`

### Batch mode

```bash
npm run stories:localize -- \
  --episode <episode-id-or-slug> \
  --mode batch \
  --languages de,es,fr \
  --include-english-short \
  --prepare-batch \
  --submit
```

Batch mode prepares the OpenAI batch payload, submits it, and writes the batch manifest under the repo’s episode output tree.

### Batch follow-up commands

```bash
npm run stories:batches -- status --batch <local-batch-id>
npm run stories:batches -- import --batch <local-batch-id>
npm run stories:batches -- import-ready
npm run stories:batches -- refresh
npm run stories:batches -- verify-index
```

Use `stories:batches -- status` to poll a specific batch, `import` to pull results into the episode workspace, and `import-ready` to import all completed batches.

## 2. Generate Localized Versions From The Optimized English Source

After the optimized English story exists, generate the localized versions.

### Sync mode

```bash
npm run stories:localize -- \
  --episode <episode-id-or-slug> \
  --mode sync \
  --languages de,es,fr
```

### Batch mode

```bash
npm run stories:localize -- \
  --episode <episode-id-or-slug> \
  --mode batch \
  --languages de,es,fr \
  --prepare-batch \
  --submit
```

Recommended follow-up after the batch completes:

```bash
npm run stories:batches -- status --batch <local-batch-id>
npm run stories:batches -- import --batch <local-batch-id>
```

If you want to inspect the planned outputs without generating them:

```bash
npm run stories:localize -- \
  --episode <episode-id-or-slug> \
  --mode sync \
  --languages de,es,fr \
  --dry-run
```

## 3. Generate The Character Map

Copy the canonical source-pack `characters.json` into the episode workspace:

```bash
npm run mediaforge -- episode sync-characters --episode <episode-id-or-slug>
```

This writes:

```text
episodes/<episode-slug>/shared/characters.json
```

If you want the shared registry plus reference images in one step, use:

```bash
npm run episode:bootstrap-characters -- --episode <episode-id-or-slug> --approve
```

## 4. Generate Thumbnails And Reference Characters

### Reference characters

Generate all character reference images for the episode:

```bash
npm run episode:bootstrap-characters -- --episode <episode-id-or-slug> --approve
```

Generate a single character reference image:

```bash
npm run mediaforge -- images generate-character-references --episode <episode-id-or-slug> --character <character-id>
```

Character reference images are stored under:

```text
episodes/<episode-slug>/shared/images/character-references/
```

### Thumbnail assets

There is no separate thumbnail-image generator command in this repo.
Thumbnail text and thumbnail prompt material are produced by the metadata workflow, and the uploader resolves the final thumbnail file from the episode output or from `content-ideas/audio-ready-thumbnails/<lang>/`.

Generate the metadata that includes the thumbnail fields with:

```bash
npm run metadata:youtube -- --episode <episode-slug>
```

If you need to upload a specific thumbnail file later, pass `--thumbnail-path` to the upload command.

## 5. Generate All Audio Assets

Audio generation happens inside the episode commands.

### English full audio

```bash
npm run episode:english -- --episode <episode-id-or-slug>
```

### English short audio

```bash
npm run episode:short -- --episode <episode-id-or-slug> --language en --reuse-images
```

### Localized full audio

```bash
npm run episode:localized -- --episode <episode-id-or-slug> --languages de,es,fr --reuse-images
```

### Localized short audio

Run the short pipeline once per language:

```bash
npm run episode:short -- --episode <episode-id-or-slug> --language de --reuse-images
npm run episode:short -- --episode <episode-id-or-slug> --language es --reuse-images
npm run episode:short -- --episode <episode-id-or-slug> --language fr --reuse-images
```

If you want a single language, pass only that `--language`.

## 6. Generate All Shared Images

### Full episode images

Plan the scenes first:

```bash
npm run images:plan -- --episode <episode-id-or-slug>
```

Then generate the shared full image set:

```bash
npm run images:generate -- --episode <episode-id-or-slug>
```

To generate one scene only:

```bash
npm run images:generate -- --episode <episode-id-or-slug> --scene <scene-id>
```

To force regeneration:

```bash
npm run images:generate -- --episode <episode-id-or-slug> --scene <scene-id> --force
```

### Short episode images

The short pipeline generates and reuses its own short image set under:

```text
episodes/<episode-slug>/shared/short/images/generated/
```

Run the short episode command for each language you want to produce.

## 7. Generate The Video And Metadata

### Video

The episode commands generate the final video artifacts.

```bash
npm run episode:english -- --episode <episode-id-or-slug>
npm run episode:localized -- --episode <episode-id-or-slug> --languages de,es,fr --reuse-images
npm run episode:short -- --episode <episode-id-or-slug> --language de --reuse-images
```

For a full localized set, run `episode:short` once per target language.

### Metadata

Generate YouTube metadata from the episode scenes:

```bash
npm run metadata:youtube -- --episode <episode-slug>
```

The metadata command writes its output under the episode output tree, typically in:

```text
episodes/<episode-slug>/output/
```

## 8. Upload To YouTube

Upload the rendered episode with:

```bash
npm run youtube:upload -- --episode <episode-slug>
```

If you want the uploader to regenerate metadata first, add:

```bash
npm run youtube:upload -- --episode <episode-slug> --generate-metadata
```

Useful overrides:

```bash
npm run youtube:upload -- \
  --episode <episode-slug> \
  --video-path output/final.mp4 \
  --thumbnail-path output/thumbnail.png
```

The uploader writes resumable reports under:

```text
episodes/<episode-slug>/generated-assets/upload-reports/
```

## Recommended Validation Steps

Before rendering or uploading, these commands are worth running:

```bash
npm run episode:inspect -- --episode <episode-id-or-slug>
npm run episode:status -- --episode <episode-id-or-slug>
npm run mediaforge -- images validate <episode-id-or-slug>
npm run episode:review:status -- --episode <episode-id-or-slug> --language en --artifact full
```

Recommended approval order:

1. approve the English full artifact before localized full runs;
2. approve the German full artifact before German short generation;
3. re-check stale approvals after any regeneration.

## Worked Example: Episode 009

Episode `009` in this repo is:

```text
009-mary-gloria-the-christmas-doll
```

### Sync flow

```bash
npm run stories:localize -- \
  --episode 009 \
  --mode sync \
  --languages de,es,fr \
  --include-english-short

npm run mediaforge -- episode sync-characters --episode 009
npm run episode:bootstrap-characters -- --episode 009 --approve

npm run images:plan -- --episode 009-mary-gloria-the-christmas-doll
npm run images:generate -- --episode 009-mary-gloria-the-christmas-doll

npm run episode:english -- --episode 009
npm run episode:localized -- --episode 009 --languages de,es,fr --reuse-images

npm run episode:short -- --episode 009 --language de --reuse-images
npm run episode:short -- --episode 009 --language es --reuse-images
npm run episode:short -- --episode 009 --language fr --reuse-images

npm run metadata:youtube -- --episode 009-mary-gloria-the-christmas-doll
npm run youtube:upload -- --episode 009-mary-gloria-the-christmas-doll
```

### Batch flow

```bash
npm run stories:localize -- \
  --episode 009 \
  --mode batch \
  --languages de,es,fr \
  --include-english-short \
  --prepare-batch \
  --submit

npm run stories:batches -- status --batch <local-batch-id>
npm run stories:batches -- import --batch <local-batch-id>

npm run mediaforge -- episode sync-characters --episode 009
npm run episode:bootstrap-characters -- --episode 009 --approve

npm run images:plan -- --episode 009-mary-gloria-the-christmas-doll
npm run images:generate -- --episode 009-mary-gloria-the-christmas-doll

npm run episode:english -- --episode 009
npm run episode:localized -- --episode 009 --languages de,es,fr --reuse-images

npm run episode:short -- --episode 009 --language de --reuse-images
npm run episode:short -- --episode 009 --language es --reuse-images
npm run episode:short -- --episode 009 --language fr --reuse-images

npm run metadata:youtube -- --episode 009-mary-gloria-the-christmas-doll
npm run youtube:upload -- --episode 009-mary-gloria-the-christmas-doll
```

## Additional Recommendations

- Use `stories:localize --mode sync` for quick iteration and debugging.
- Use `stories:localize --mode batch --prepare-batch --submit` for production runs with more throughput.
- Keep `episode:bootstrap-characters --approve` in the loop before image generation when the episode has recurring characters.
- Re-run `npm run mediaforge -- images validate <episode-id-or-slug>` after any image import or regeneration.
- Re-run `metadata:youtube` before upload if the scene list, title, or thumbnail prompt changed.
- Re-run `youtube:upload --force` only when you intentionally want to overwrite a previously successful upload report.
