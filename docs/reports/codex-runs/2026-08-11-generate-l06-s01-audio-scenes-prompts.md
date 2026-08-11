# L06-S01 audio, scene plan, and image prompts

## Changed files

- `episodes/l06-s01-your-audience-remembers-the-old-you/` — English Short script, six-scene plan, reconciled timing, six provider prompts, narration WAV, chunk metadata, manifests, and provider telemetry.
- This report.

## Checks run

- `veronica-media prepare-production` (initial provider compilation and post-TTS reconciliation): passed.
- Canonical narration `generate`, `assemble`, and `validate`: completed; validation returned `READY_WITH_WARNINGS`.
- `ffprobe` and JSON integrity inspection: 61.779083-second WAV, six scenes ending at the same duration, six prompt records.

## Result

One authorized `gpt-5.6-terra` image-prompt compilation produced six prompts;
no images were generated. OpenAI `gpt-4o-mini-tts` generated and assembled the
English narration. Timing now uses selected canonical audio.

## Risks and follow-up

Audio is 61.78 seconds, above the 60-second preferred ceiling but below the
65-second rewrite threshold. Source-grounded QA remains cache-only and not
ready; human pre-image review and any image generation remain blocked.
