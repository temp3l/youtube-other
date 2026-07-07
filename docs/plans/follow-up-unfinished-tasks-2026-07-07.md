# Follow-Up Unfinished Tasks - 2026-07-07

## HIGH

- [ ] Story pipeline Task 05: implement the English rewrite stage wrapper against the existing workflow manifest store.
- [ ] Story pipeline Task 06: add English source fallback as a typed outcome, not a silent provider failure.
- [ ] Story pipeline Tasks 07-10: wire quality gates, locale isolation, independent short outcomes, and visual branch boundaries.
- [ ] Post-refactor Task 07: rerun controlled no-paid verification for dry-run, `episode validate`, `shots validate`, and focused package tests.
- [ ] Create implementation reports under `docs/reports/2026-07-07/` for any newly executed plan task.

## MEDIUM

- [ ] FFmpeg motion Task 07: expose render-motion CLI flags, including `--motion-render-preset`, without overloading visual-retention `--motion-preset`.
- [ ] FFmpeg motion Task 08-09 follow-up: ensure CLI-driven motion reports and docs match the final operator flags.
- [ ] CLI batch images: run disposable provider reference semantics verification before enabling edit-batch support.
- [ ] CLI batch images: design and test short multilingual alias policy for shared portrait outputs.
- [ ] Story Task 13: audit compatibility metadata/audio fields and either document intentional adapters or remove unsupported story-prompt ownership.

## LOW

- [ ] Backfill required implementation reports for completed plan sets that currently have only code evidence or misplaced reports.
- [ ] Move or duplicate useful plan-local remove-legacy reports into the required `docs/reports/<date>/` structure with accurate current-state notes.
- [ ] Reconcile stale audit/evidence docs that still describe pre-implementation post-refactor failures.
- [ ] Keep story pipeline docs labeled as skeleton-only until executable stages are implemented and verified.

## Suggested Codex Prompts

- "Implement `docs/plans/story-pipeline-tasks/05-english-rewrite-stage-wrapper.md` only. Inspect current workflow code first, add focused tests, and write the required implementation report."
- "Run post-refactor Task 07 no-paid verification from `docs/plans/post-refactor-stability/tasks/task-07-verification-and-controlled-smoke.md`, update evidence, and create the required report."
- "Finish `docs/plans/ffmpeg-motion-presets/tasks/task-07-cli-and-manifest-integration.md` by adding render-motion CLI flags and focused tests."
- "Use `docs/plans/cli-batch-images/provider-reference-semantics-checklist.md` to verify provider edit-batch semantics with disposable assets, then document the result."
