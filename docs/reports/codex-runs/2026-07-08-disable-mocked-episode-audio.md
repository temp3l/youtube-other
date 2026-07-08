# Codex Run Report

Summary: Added a dedicated narration TTS guard so episode narration generation now hard-fails unless OpenAI-compatible speech and an API key are configured. This guard is enforced for legacy `audio generate` and staged `audio narration generate|all`, and the CLI/docs now state that mocked narration is not allowed.

Changed paths: `apps/cli/src/narration-tts-guard.ts`, `apps/cli/src/narration-tts-guard.unit.test.ts`, `apps/cli/src/index.ts`, `docs/cli-audio.md`, `docs/example-cli-run-sample2.md`

Tests/checks:
- `pnpm test:focused -- apps/cli/src/index.unit.test.ts`
- `pnpm test:focused -- apps/cli/src/narration-tts-guard.unit.test.ts`
- `git diff --check -- apps/cli/src/index.ts apps/cli/src/narration-tts-guard.ts apps/cli/src/narration-tts-guard.unit.test.ts docs/cli-audio.md docs/example-cli-run-sample2.md`

Results: All passed.

Commit hash: `5d62c68`

Unresolved risks / follow-up: Existing narration artifacts from older runs were not audited or regenerated here. Non-generation commands may still accept `--tts-provider mock`, but they can no longer synthesize episode narration through the guarded paths.
