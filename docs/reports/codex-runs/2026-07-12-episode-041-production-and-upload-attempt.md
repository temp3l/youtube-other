# Episode 041 production and upload

## Summary

Approved the English full script, produced the English static-visual video and metadata, added the legacy episode manifest required by the uploader, and uploaded the completed English full video privately. YouTube video ID: `G-OQ7Ts6UDU`. German remains only partially rendered.

## Changed files

- `episodes/041-the-town-that-calls-your-name/languages/script-de.md`
- `episodes/041-the-town-that-calls-your-name/manifest.json`
- Generated English and German narration/render artifacts under `episodes/041-the-town-that-calls-your-name/`
- `episodes/041-the-town-that-calls-your-name/state/upload/reports/youtube-upload.{json,md}`

## Checks run

- `pnpm test:focused -- packages/speech/src/script-markdown.unit.test.ts` — passed (11 tests)
- `pnpm test:focused -- packages/dark-truth/src/index.unit.test.ts` — passed (20 tests)
- Built `@mediaforge/speech`, `@mediaforge/dark-truth`, and `@mediaforge/cli` — passed.
- Parsed `manifest.json` with `episodeManifestSchema` — passed.
- `node apps/cli/bin/mediaforge.js youtube upload ... --privacy-status private` — uploaded successfully.

## Risks and follow-up

German rendering stopped after clips 001–011 without a persisted error, so no German video was uploadable. The English upload used scene 003 as its thumbnail because no dedicated Episode 041 thumbnail artifact existed.
