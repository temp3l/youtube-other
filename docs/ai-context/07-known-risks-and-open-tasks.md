# AI Context: Known Risks And Open Tasks

## Highest Risks

- Dirty worktree: many source/docs/report changes are uncommitted.
- Story pipeline CLI is dry-run skeleton-only; Tasks 11-17 remain unimplemented/proven.
- Provider edit-batch support remains blocked because `/v1/images/edits` batch file semantics are unknown.
- Repository episode artifacts are stale/invalid for some validation smoke cells.
- Built `dist` may be stale relative to source; `apps/cli/bin/mediaforge.js` runs built code.
- Older audits conflict with newer dirty-tree reports; prefer source plus newest reports.

## Recently Completed Or Likely Completed In Dirty Tree

- Story workflow Task 05 English rewrite wrapper.
- Story workflow Task 06 English source fallback.
- Story workflow Tasks 07-10 quality, locale, short, visual boundaries.
- FFmpeg motion Tasks 07-09 CLI flags, manifest/debug reporting docs.
- CLI batch short multilingual alias policy.
- Story Task 13 metadata/audio compatibility audit.
- Post-refactor no-paid smoke rerun, with partial failures classified as stale/invalid artifacts.

## Open Tasks

- Implement/prove story pipeline Tasks 11-17: media adapters, provider batch hybrid, cost/telemetry, status/inspect, resume/invalidation, legacy delegation, E2E hardening.
- Run provider reference semantics checklist only after explicit paid-call approval.
- Reconcile episode `022-the-whistler-in-the-woods` source identity and visual-retention artifacts.
- Backfill or reconcile reports for older plan-local remove-legacy work.
- Build packages when runtime verification against `dist` is needed.

## Tasks Not Safe In Parallel

- Resolver identity and downstream source metadata edits.
- Episode validation and cross-manifest validator edits.
- Visual-retention shot validation and episode validation semantics.
- Story workflow manifest schema/planner edits with stage wrapper execution edits.

## Tasks Safe Sequentially

- Story workflow wrappers, one task at a time, with focused tests.
- CLI docs updates after a source change lands and tests pass.
- Report backfills when they do not touch source.

## Evidence Sources

- `docs/reports/2026-07-07/*.md`
- `docs/reports/2026-07-07/unfinished-plans-audit.md`
- `docs/plans/follow-up-unfinished-tasks-2026-07-07.md`
- `docs/audits/post-refactor-stability/post-refactor-stability-audit.md` as historical, partly stale evidence.
- Current `git status --short`, `git diff --name-only`, `git diff --stat`.
