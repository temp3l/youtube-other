# Uploading Episodes

This guide covers the final handoff from rendered episode to YouTube upload.
It assumes the episode has already been generated, rendered, and validated.

## What The Uploader Does

`npm run youtube:upload -- --episode <episode-id>`:

1. loads the episode manifest and runtime config;
2. resolves the rendered video and thumbnail;
3. loads the episode's YouTube metadata;
4. validates the upload settings locally;
5. authenticates with YouTube using the configured OAuth refresh token;
6. uploads the video;
7. applies the thumbnail;
8. optionally adds the video to a playlist;
9. writes resumable JSON and Markdown reports.

The command is resumable and can safely be re-run when the inputs have not changed.
When a source thumbnail is too large for YouTube, the uploader now stages a compressed upload copy under `episodes/<episode-id>/generated-assets/thumbnails/` and records both the staged path and the original source path in the upload report.

## Prerequisites

- A rendered episode video in `episodes/<episode-id>/output/`
- A thumbnail in `episodes/<episode-id>/output/thumbnail.png` or a supported fallback path
- A generated YouTube metadata file, usually `episodes/<episode-id>/metadata/youtube.json`
- A valid YouTube OAuth refresh token with upload access
- A configured YouTube client ID and client secret

## Required Environment Variables

Set these values in your shell or `.env` file:

```dotenv
YOUTUBE_CLIENT_ID=
YOUTUBE_CLIENT_SECRET=
YOUTUBE_REFRESH_TOKEN=
YOUTUBE_CHANNEL_ID=
YOUTUBE_REDIRECT_URI=http://localhost
```

The CLI also accepts the existing runtime configuration from `MEDIAFORGE_WORKSPACE` and the repo's standard `.env` loading flow.

## Recommended Operator Flow

1. Generate the episode assets.
2. Review the final render and thumbnail.
3. Verify YouTube metadata with `npm run metadata:youtube -- --episode <episode-id>`.
4. Upload the episode with `npm run youtube:upload -- --episode <episode-id>`.
5. Inspect the upload report.

## Examples

Basic upload:

```bash
npm run youtube:upload -- --episode 001-calhoun-experiment
```

Regenerate YouTube metadata during upload:

```bash
npm run youtube:upload -- --episode 001-calhoun-experiment --generate-metadata
```

Upload a specific file set:

```bash
npm run youtube:upload -- \
  --episode 001-calhoun-experiment \
  --video-path output/final.mp4 \
  --thumbnail-path output/thumbnail.png
```

Schedule a future release:

```bash
npm run youtube:upload -- \
  --episode 001-calhoun-experiment \
  --privacy-status private \
  --publish-at 2026-06-26T12:00:00Z
```

Add the uploaded video to a playlist:

```bash
npm run youtube:upload -- \
  --episode 001-calhoun-experiment \
  --playlist-id PL1234567890abcdef
```

Force a fresh upload even when a previous success report exists:

```bash
npm run youtube:upload -- --episode 001-calhoun-experiment --force
```

## Reports

The uploader writes these files under:

```text
episodes/<episode-id>/generated-assets/upload-reports/
```

Files:

- `youtube-upload.json`
- `youtube-upload.md`

The JSON report records:

- episode and asset paths;
- the original thumbnail source path and the staged thumbnail path used for upload;
- hashes for the source metadata, video, and thumbnail;
- resolved upload settings;
- YouTube video ID and channel ID when available;
- request IDs for upload, thumbnail, playlist, and verification calls when the API returns them.

## Resumability

The uploader reuses a previous successful report when:

- the previous run completed successfully;
- the rendered video hash still matches;
- the thumbnail hash still matches;
- the source metadata hash still matches;
- the title still matches the current metadata.

Use `--force` to bypass the cached success report.

## Validation Rules

The command fails before any upload when:

- the episode cannot be found;
- the render or thumbnail is missing;
- the metadata file is missing or invalid;
- the OAuth settings are incomplete;
- the authenticated channel does not match `YOUTUBE_CHANNEL_ID` when that variable is set;
- scheduled publish times are not in the future;
- the metadata requests a scheduled publish with a non-private visibility;
- chapter data or other metadata fields are invalid for YouTube.

## Troubleshooting

- `Missing YOUTUBE_CLIENT_ID, YOUTUBE_CLIENT_SECRET, or YOUTUBE_REFRESH_TOKEN.`  
  Set the YouTube OAuth env vars before running the command.

- `Unable to locate a rendered video`  
  Check the episode render output and the `--video-path` override.

- `Unable to locate a custom thumbnail`  
  Check `output/thumbnail.png` or pass `--thumbnail-path`.

- `Authenticated YouTube channel ... does not match configured YOUTUBE_CHANNEL_ID`  
  Update the configured channel ID or use the correct refresh token.

- `publishAt must be a future RFC 3339 timestamp.`  
  Use a future ISO-8601 timestamp.

## Notes

- The uploader does not log raw base64 media data or API secrets.
- It uses the repo's existing telemetry and atomic file write helpers.
- It is designed to be rerunnable after transient failures without duplicating successful uploads.
