# History image prompt wiring

## Summary

Wired history episodes to a dedicated image prompt profile that uses `shared/scenes.json` `imagePrompt` text and V3.5 `plan.json` visual concepts instead of horror short-story fallbacks. Regenerated Napoleon scenes 001–005.

## Changes

- `packages/image-generation/src/history-image-plan.ts` — load V3.5 plan, resolve per-scene guidance, skip map-only windows.
- `packages/image-generation/src/history-image-prompt.ts` — history documentary prompt renderer and period-aware scene space.
- `packages/image-generation/src/episode-image-pipeline.ts` — `history-documentary` profile, skip compiled-visual scenes, `buildEpisodeImageMediaContext`.
- `packages/image-generation/src/history-image-prompt.unit.test.ts` — regression tests.
- `apps/cli/src/index.ts` — pass `contentGenre: "history"` into image plan/generate.
- `scripts/history-regenerate-scene-images.mjs` — targeted history scene regeneration helper.

## Verification

| Command | Result |
|---------|--------|
| `pnpm test:focused -- packages/image-generation/src/history-image-prompt.unit.test.ts` | 3/3 pass |
| `pnpm exec tsx scripts/history-regenerate-scene-images.mjs ... scene-001..005` | 5/5 `generated` |

Scene-001 prompt now uses `Historically grounded documentary reconstruction` and the scene `imagePrompt`; no `altered family photograph` or horror style.

## Risks

- `pnpm mediaforge -- images generate` still fails on missing `youtube-upload` build artifact; use the tsx script until CLI packaging is fixed.
- Scene-level images remain decoupled from per-beat map/diagram renders; skip only applies to windows with exclusively compiled modalities.
