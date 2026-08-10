# Cross-genre production enforcement

Summary: `CROSS_GENRE_HARDENING_PRODUCTION_ENFORCEMENT: PASS`. Existing
workflow fingerprints now include deterministic shared plus genre/variant
hardening dependencies. History Short has separate trusted narration, 9:16
hook/payoff planning, isolated paths, and adaptive calibration. Local technical
pixel QA is shared; History/DarkTruth use blocking policy while Veronica keeps
its semantic policy.

Changed paths: `packages/shared/src/production-hardening*`,
`packages/history/src/{task-registry,history-short-workflow}*`,
`packages/dark-truth/src/profile-bindings.ts`,
`packages/image-generation/src/{technical-pixel-qa,episode-image-pipeline}*`,
`apps/cli/src/workflow-commands.ts`, dry-run artifacts, and the adoption audit.

Checks: focused shared hardening 11 passed; combined affected tests 20 passed;
focused History adapter rerun 2 passed after the shared rebuild.
Shared, History, DarkTruth, and image-generation builds passed; affected
typechecks (including CLI) and targeted ESLint passed; four offline fixtures
passed. TTS calls: 0; image calls: 0. Optional live canaries are listed in the
audit.

Commit: base `50c0984` (worktree changes uncommitted).

Risks: live provider canaries and human approvals remain intentionally pending.
