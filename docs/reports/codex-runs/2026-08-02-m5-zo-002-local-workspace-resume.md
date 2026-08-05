# M5-ZO-002 local workspace resume

Summary: Math production `run` and `resume` now default to the ignored repository-local `.cache/math-pipeline/production` workspace. The existing paid lesson was copied there without regenerating narration; its WAV SHA-256 remains `1421c87cf704de822d233f42355626094d8e20ee500ac4db20722878c4109aae`. The resumed render writes only beneath that workspace and is in progress.

Changed files: `apps/cli/src/math-commands.ts`; `apps/cli/src/math-commands.unit.test.ts`; `docs/mathe/plans/math-genre-implementation-plan.md`; `docs/mathe/plans/math-genre-task-breakdown.md`; this report.

Tests/checks: focused math CLI test exercised the new option and related commands; the only remaining file-level failure is an unrelated private batch owner-attestation/content-hash mismatch. `git diff --check` passed. CLI help confirmed the new default.

Risks/follow-up: wait for the active render, then verify `final.mp4` duration/dimensions and workflow result. The external workspace was read-only during this task; all new artifact writes are repository-local.
