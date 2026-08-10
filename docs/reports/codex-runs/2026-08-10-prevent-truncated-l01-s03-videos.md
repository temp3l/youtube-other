# Prevent truncated L01 S03 videos

Date: 2026-08-10

## Summary

The renderer now extends a short visual timeline by holding its final frame through the complete narration before muxing. It no longer lets FFmpeg's `-shortest` truncate narration.

## Changed paths

- `packages/rendering/src/index.ts`
- `packages/rendering/src/index.unit.test.ts`
- Re-rendered final videos for L01 S03 (DE, EN, IT)

## Checks

- Focused rendering unit test: passed.
- Rendering package typecheck: passed.
- Final video versus narration duration: DE 0.004s, EN 0.015s, IT 0.020s drift.
- Full FFmpeg decode: passed for all three videos.

## Risks and follow-up

The legacy episode layout cannot use the generic `stories render` command without its newer visual manifests. The existing validated scene clips were preserved and only the final assembly was rebuilt. Commit: `d9af441`.
