# Veronica review-pack modes — Codex run

Summary: Added typed `compact`, `listening`, and `forensic` pre-image review packaging. Compact is default, validates canonical WAV before omission, and records audio/timing integrity. Listening creates a labeled 64 kbps Opus preview; forensic embeds the WAV. Rebuilt the eight-pack L02/L03 compact aggregate.

Changed paths: `apps/cli/src/veronica-pre-image-review-pack.ts`, `veronica-media-commands.ts`, focused tests, `scripts/build-veronica-semantic-regression-archive.ts`, and the operator guide.

Checks: CLI typecheck passed; targeted ESLint and diff check passed; focused compact/listening/forensic test passed; combined archive ZIP test and embedded-file hash audit passed.

Result: compact aggregate is 372,736 bytes versus 83,853,998 bytes forensic reference (99.555% reduction). No live TTS or image-provider calls; one local FFmpeg preview transcode in tests.

Risks: the historic L02/L03 corpus has legacy source-plan shapes, so its compact aggregate is repackaged from the verified final-coherent forensic corpus while revalidating current canonical audio.

Follow-up: migrate legacy source plans before using the normal packer directly for those archived episodes.
