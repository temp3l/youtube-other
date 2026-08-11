# OpenAI model policy run

Summary: Centralized typed OpenAI capability policy; migrated authoring, metadata, QA, History (including V36 shadow), media and legacy chat composition paths. Veronica now uses Mini → Terra → Sol final adjudication only. Removed the unused prompt-optimizer setting.

Changed paths: `packages/shared/src/openai-model-policy.ts`, `packages/config/src/index.ts`, `apps/cli/src/{index,story-*,veronica-*}.ts`, `packages/history/src/{history-research-*,v36/*}.ts`, media/chat adapters, focused tests, `.env.example`.

Tests/checks: focused Vitest policy/config/Veronica suite — PASS (64 tests); `pnpm exec tsc -p apps/cli/tsconfig.json --noEmit` — PASS; `git diff --check` — PASS.

Unresolved risks: existing package distributions are not rebuilt by this task; production deployment must run its normal build. Paid OpenAI calls: 0; image, TTS, and transcription calls: 0.
