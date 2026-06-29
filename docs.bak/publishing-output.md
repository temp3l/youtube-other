# Publishing Output

MediaForge generates copy-ready publishing metadata but does not publish automatically in the first iteration.

## YouTube

- title candidates
- recommended title
- description
- tags
- chapters
- thumbnail text candidates
- pinned comment

When you run `npm run youtube:upload -- --episode <episode-id>`, the uploader reuses this metadata and writes resumable reports under `episodes/<episode-id>/generated-assets/upload-reports/`.

The upload reports capture:

- the resolved video and thumbnail paths;
- hashes for the source metadata and assets;
- the selected privacy and playlist settings;
- YouTube request IDs when available;
- the final uploaded video ID and channel ID.

## TikTok

- caption candidates
- recommended caption
- hashtags
- cover text candidates
- opening hook

## Constraints

- Metadata must reflect the final rendered video.
- No clickbait or false urgency.
- No unsupported claims or invented statistics.
