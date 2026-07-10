# Episode 029 Full YouTube Upload

Date: 2026-07-10

Changed files/assets:
- `episodes/029-the-ghost-train-of-silver-pines/locales/en/full/renders/youtube/youtube-16x9-clean.mp4`
- `episodes/029-the-ghost-train-of-silver-pines/locales/de/full/renders/youtube/youtube-16x9-de-clean.mp4`
- `episodes/029-the-ghost-train-of-silver-pines/locales/{en,de}/full/metadata/youtube-*`
- `episodes/029-the-ghost-train-of-silver-pines/story-production/thumbnail-story.json`
- `episodes/029-the-ghost-train-of-silver-pines/thumbnails/**`
- `episodes/029-the-ghost-train-of-silver-pines/state/uploads/reports/{en-full,de-full}/youtube-upload.*`

Tests/checks run:
- Rendered English and German full YouTube MP4s with `pnpm mediaforge -- render ... --profile youtube --no-captions`.
- Generated localized YouTube metadata with `pnpm mediaforge -- metadata generate`.
- Generated English and German full thumbnails with `pnpm mediaforge -- thumbnails generate`.
- Validated final MP4s using `ffprobe`; both are 1920x1080 H.264.
- Verified metadata language/title fields and thumbnail dimensions.
- YouTube channel auth preflight succeeded for English and German channels.

Results:
- English private upload: `XeffomM49Z0` (`https://youtu.be/XeffomM49Z0`).
- German private upload: `VV1doE8gLg8` (`https://youtu.be/VV1doE8gLg8`).

Risks remaining:
- Renders were made without captions because localized ASS captions were absent.
- German render completed with a renderer warning: total clip timeline drift `182.396s`.
- No broad test/build run was performed.

Follow-up tasks:
- Review German timing drift before publishing publicly.
- Add localized captions if captioned uploads are required.
