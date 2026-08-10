# Copy Veronica final videos

Date: 2026-08-10

## Summary

Copied all 11 completed Veronica final videos into `episodes/veronica-all` using `<episode>-<locale>-short.mp4` filenames. This includes the English and Italian short renders for `l02-s01-selling-to-everyone-is-the-problem`. No completed long-form renders exist.

## Changed paths

- `episodes/veronica-all/l02-s01-selling-to-everyone-is-the-problem-en-short.mp4`
- `episodes/veronica-all/l02-s01-selling-to-everyone-is-the-problem-it-short.mp4`
- `episodes/veronica-all/*.mp4` (11 final-video copies total)

## Checks

- Selected each source from its generated render manifest.
- SHA-256 hashes match for the two added source/destination pairs.
- Destination contains 11 MP4 files.

## Risks and follow-up

No long-form videos were available to copy. Commit: `d9af441`.
