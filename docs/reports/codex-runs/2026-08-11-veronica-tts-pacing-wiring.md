# Veronica TTS pacing wiring audit

Summary: Wired the centralized Veronica locale/variant WPM policy through staged and legacy CLI generation, provider instructions, chunk validation, selected-audio QA, runtime QA, and typed legacy provenance. Removed the OpenAI compatibility bridge's `180 × speed` WPM conflation by carrying target WPM independently. QA now measures the promoted narration WAV, while canonical timing reconciliation remains selected-audio based. German Short remediation remains one bounded retry.

Changed paths: `apps/cli/src/index.ts`; speech audio validation/instructions, narration pipeline/quality schemas, Short pacing, voice tests; speech platform contracts/OpenAI legacy adapters and tests.

Tests/checks: focused unit batch: 34 relevant tests passed; one unrelated creator-dispatch assertion failed. Exact voice pace override: passed. Legacy adapter integration: 2 passed after shrinking a timed-out fixture. Speech + CLI typecheck: passed. Touched ESLint and `git diff --check`: passed.

Commit hash: `b18c451` (base; changes uncommitted).

Risks/follow-up: Existing L05 selected WAVs were not regenerated. Its persisted reports still use old 188/190 targets; German selected audio is 202.4 WPM and needs an explicitly authorized paid regeneration to meet the new 140–160 soft range. No paid calls ran.
