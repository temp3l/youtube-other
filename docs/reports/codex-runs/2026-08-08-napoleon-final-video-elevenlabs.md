# Napoleon final video (ElevenLabs) — blocked

## Summary
Prepared `history-youtube-history-10-video-story-pack-02-napoleons-invasion-of-russia` for paid production: approved v1 visual plan, refreshed config/speech builds for ElevenLabs CLI support, fixed legacy ElevenLabs consent in speech adapter. Narration generation failed: ElevenLabs API returns HTTP 402 `paid_plan_required` for the configured history voice and for premade voices — free-tier API TTS is not available on this account.

## Changed paths
- `episodes/.../source/history-visual-approval.json` (approved)
- `packages/speech/src/platform/legacy-application-adapter.ts`
- `packages/config/dist/*`, `packages/speech/dist/*` (tsc rebuild)
- `apps/cli/dist/narration-tts-guard.js`, `apps/cli/dist/index.js` (ElevenLabs wiring)

## Checks run
- `history visuals approve` — OK
- `audio generate --tts-provider elevenlabs` — failed (402 payment_required)
- Direct ElevenLabs API probe — 402 for history voice and premade Rachel

## Risks / follow-up
- Upgrade ElevenLabs subscription (or use an API key with TTS permissions), then rerun audio/images/render.
- Alternatively rerun with `--tts-provider openai-compatible` if OpenAI TTS is acceptable.
- Full `pnpm build` still recommended; CLI dist was patched incrementally for this run.
