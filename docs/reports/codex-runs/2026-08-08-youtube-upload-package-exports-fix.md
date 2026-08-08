# Fix youtube-upload package exports

## Summary

Fixed `pnpm mediaforge` failing with `ERR_MODULE_NOT_FOUND` for `youtube-mutation-seam.js` by pointing `@mediaforge/youtube-upload` package exports at compiled `dist/` output instead of raw `src/*.ts`.

## Cause

`package.json` exported `./src/index.ts` directly. Node resolved imports to `src/youtube-mutation-seam.js`, which does not exist (only `.ts` in source). Other workspace packages (e.g. `@mediaforge/image-generation`) correctly export `dist/`.

## Fix

- Updated `packages/youtube-upload/package.json` `main`, `types`, and all `exports` entries to `dist/`.
- Ran `pnpm exec tsc -p tsconfig.json` in `packages/youtube-upload` to refresh dist artifacts.

## Verification

- `node apps/cli/bin/mediaforge.js -- images generate ... --scene scene-001 --force` — exit 0
- `pnpm mediaforge -- images generate ... --scene scene-002` — exit 0
