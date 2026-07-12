# Episode 039 Short Retry Image Safety Blocked

Date: 2026-07-12

Summary: Retried EN/DE short production for `039-the-photograph-that-changed`. OpenAI speech recovered and both short narration runs completed, but both short jobs then failed during OpenAI image generation because several short-scene prompts were rejected by the safety system. German full approval was also recorded so the DE short gate now passes.

Changed paths:
- `episodes/039-the-photograph-that-changed/reviews/de/full/approval.json`
- `episodes/039-the-photograph-that-changed/en/short/`
- `episodes/039-the-photograph-that-changed/de/short/`
- `episodes/039-the-photograph-that-changed/shared/short/images/generated/`
- `docs/reports/codex-runs/2026-07-12-episode-039-short-retry-image-safety-blocked.md`

Tests/checks:
- `pnpm mediaforge -- episode review approve --episode 039-the-photograph-that-changed --language de --artifact full --reviewer codex`
- `DARK_TRUTH_ENABLE_PAID_PROVIDERS=true MEDIAFORGE_SCRIPT_LANGUAGE=en pnpm mediaforge -- episode short --episode 039-the-photograph-that-changed`
- `DARK_TRUTH_ENABLE_PAID_PROVIDERS=true MEDIAFORGE_SCRIPT_LANGUAGE=de pnpm mediaforge -- episode short --episode 039-the-photograph-that-changed`

Result: EN short failed on image safety rejections for scenes `002`, `005`, `009`, and `010`. DE short failed on image safety rejection for scene `009`. No short render or YouTube upload was attempted.

Commit: none.

Unresolved risks: Short image prompts need moderation-safe rewrites or another approved image path before EN/DE shorts can render and upload.
