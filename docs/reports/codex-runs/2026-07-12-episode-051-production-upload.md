# Episode 051 Production And Upload

Date: 2026-07-12

Changed files:
- `episodes/051-the-voice-message-from-tomorrow/**`
- `docs/reports/codex-runs/2026-07-12-episode-051-production-upload.md`

Summary:
- Produced EN and DE full videos.
- Authored corrected DE full script after localization validation failures.
- Fixed duplicate shared image artifacts by quarantining stale generated images.
- Produced corrected EN and DE shorts using `Jonah Valen` consistently.
- Added root episode manifest required by YouTube upload resolver.
- Generated YouTube metadata during upload and uploaded all four videos.

Uploads:
- EN full: `4LSw4gugEPU`
- DE full: `Cj9JW3RzFgw`
- EN short: `6vrCzVh-y9w`
- DE short: `HCQTDK42LZM`

Tests/checks:
- `episode dry-run --episode 051 --language de --artifact full --json`: passed.
- `episode validate` for EN/DE full and short: core artifacts valid; expected `visual-retention-manifest` missing because runs used `--no-visual-retention`.
- Review approvals created for EN/DE full and short.

Risks/follow-up:
- Upload report path is overwritten by each upload command; video IDs above were captured from command output.
- Visual-retention artifacts were intentionally not generated.
