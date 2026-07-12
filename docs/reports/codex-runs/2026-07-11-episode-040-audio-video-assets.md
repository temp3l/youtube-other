# Episode 040 Audio/Video Assets

Summary: Generated English and German narration plus full and short video assets for `040-room-1413`. English short initially failed on short-script heading parsing; the short script headings were normalized to the CLI's expected section names and the rerun succeeded. German short completed after one retryable image moderation block. No manual content QA was performed on the rendered videos. Commit: `8cc3876`.

Changed paths: `episodes/040-room-1413/languages/short/script-en.md`, `episodes/040-room-1413/languages/short/script-de.md`, `episodes/040-room-1413/locales/{en,de}/{full,short}/audio/narration.wav`, `episodes/040-room-1413/{en,de}/{full,short}/`, `episodes/040-room-1413/reviews/{en,de}/{full,short}/`.

Tests/checks: `pnpm mediaforge -- --tts-provider openai-compatible --narration-pipeline-mode new audio narration prepare|plan|generate|assemble|validate --episode 040-room-1413 --languages en,de --all-variants --resume`; targeted full regenerate for failed chunks; `DARK_TRUTH_ENABLE_PAID_PROVIDERS=true pnpm mediaforge -- episode english --episode 040-room-1413 ...`; `... episode localized --episode 040-room-1413 --languages de ...`; `... episode short --episode 040-room-1413 --language en|de ...`; review approvals for `en/full` and `de/full`; targeted `find` verification for audio, video, manifests, and review packages.

Unresolved risks: narration validation remained `READY_WITH_WARNINGS`; OpenAI pricing data was unconfigured; final videos were path-verified only, not manually reviewed.
