# Multilingual episodes

The pipeline can reuse the same scene images while producing separate audio, clips, and metadata per language.

## Script locations

Place translated scripts in:

```text
episodes/<episode-slug>/languages/script-<lang>.md
```

Examples:

- `script-es.md`
- `script-pt.md`
- `script-hi.md`

## Configuration

Set the active language in either:

- `episode.config.json` with `scriptLanguage`
- `MEDIAFORGE_SCRIPT_LANGUAGE`
- `--language <code>` on the CLI

The voice preset still comes from `docs/voice-settings.md`, and the narration instructions are adjusted for the selected language.

## Output layout

Language-specific outputs are written without touching existing images:

- `audio/segments-<lang>/`
- `audio/narration-<lang>.wav`
- `output/clips-<lang>/`
- `output/youtube-16x9-<lang>-clean.mp4`
- `metadata/<lang>/youtube-metadata.md`
- `metadata/<lang>/youtube.md` as a compatibility alias

English remains the default language and continues to use the non-suffixed paths.

## Commands

- `mediaforge audio generate <episode-id> --language es`
- `mediaforge clips generate <episode-id> --language es`
- `mediaforge render <episode-id> --language es`
- `mediaforge metadata generate <episode-id> --language es`

## Chapters

`youtube-metadata.md` contains the OpenAI-generated metadata. `youtube.md` is kept as a compatibility alias and contains the same content.

The chapter block inside the metadata uses text-based lines in this format:

```text
00:00 short and concise chapter description
00:25 short and concise chapter description
00:50 short and concise chapter description
```

The chapter text is derived from the localized script when the translated script matches the scene count.
