# Veronica speech-rate policy

Summary: Added a versioned, locale/variant Veronica speech-rate policy; pre-TTS segmentation persists its target WPM and 9:30–10:30 / 1:00–1:30 word-count guidance, while selected-audio QA persists observed WPM and thresholds. Selected audio remains the timing authority; post-TTS reconciliation now runs for both Veronica variants. Short calibration is bounded to one remediation.

Changed paths: `packages/speech/src/veronica-speech-rate-policy.ts`, speech pipeline/schema/segmentation/quality-gate files and tests; `apps/cli/src/index.ts`, `apps/cli/src/veronica-short-pacing.ts`; canonical-timing regression test.

Tests: focused Vitest policy, Short calibration, segmentation, and canonical-timing suites passed (77 tests); `pnpm --filter @mediaforge/speech --filter @mediaforge/cli typecheck` passed; Prettier wrote touched files; `git diff --check` passed.

Commit hash: `b18c451` (base; implementation uncommitted).

Unresolved risks: existing unrelated working-tree edits were preserved. No paid provider calls ran.
