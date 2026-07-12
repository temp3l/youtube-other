# Recommended next prompt: finish R-008 blocker-repair verification

```text
Continue from the current worktree. Read AGENTS.md,
docs/ai-context/context-pack.md,
docs/mathe/audits/remediation-backlog.md,
docs/mathe/plans/math-genre-implementation-plan.md,
docs/mathe/plans/math-genre-test-matrix.md,
docs/reports/codex-runs/2026-07-13-math-r008-independent-acceptance-review.md,
docs/reports/codex-runs/2026-07-13-math-r008-acceptance-blocker-repair.md,
and docs/reports/2026-07-12/math-genre-implementation-plan-implementation-report.md.

Inspect Git state first. Baseline is ac21261; expected HEAD is
ab9a32a7d880e3234b33f10b41e1a95917a195d3, but Git is authoritative. Preserve
all tracked and untracked changes, especially .tmp/mock-openai-server.mjs,
packages/educational-renderer/, todo-prompts/linux-math-video-rendering/, and
the uncommitted R-008 implementation, tests, review, and blocker-repair
documentation. Do not clean, reset, commit, regenerate fixtures, modify
generated episode assets, edit generated dist files, or revert accepted R-001
through R-007 work.

R-007 is accepted. R-008 remains unaccepted. Its documented acceptance blockers
were repaired on 2026-07-13, but the final combined CLI verification exhausted
the prior task's retry budget. The last failure was classified as a test-harness
defect: a file-level math-command mock caused the new real-entrypoint blocked
publish test to bypass the production command and return unclassified exit 1.
That mock was removed after the last run. Finish this repair/verification batch
only. Do not accept R-008 and do not start R-009.

Inspect current source and matching tests before running anything, especially:

- packages/math-education/src/orchestration/workflow.ts
- packages/math-education/src/orchestration/workflow-store.unit.test.ts
- apps/cli/src/math-commands.ts
- apps/cli/src/math-commands.unit.test.ts
- apps/cli/src/index.ts
- apps/cli/src/index-setup.unit.test.ts

Treat source as authoritative. Confirm the current index test imports the real
math command for the blocked-publish case while mocking only unrelated command
registrations and observability. Confirm the constructed workspace has a valid
canonical v2 stage chain, exactly one hash-valid workflow-owned quality output,
an identity-matching RENDER_BLOCKED report, and no publish packet requirement
before the semantic quality block. The actual `math publish --dry-run` action
must throw the classified math semantic error; the real top-level catch and
telemetry finalization must both retain exit 3. A generic/unclassified error
must ignore ambient `process.exitCode = 3` and finish with exit 1.

Run this outstanding check first:

1. pnpm test:focused -- apps/cli/src/math-commands.unit.test.ts apps/cli/src/index-setup.unit.test.ts

The focused wrapper was already inspected and forwards the second file to the
same Vitest invocation. If the command passes, do not edit production or tests.
If it fails, classify the exact failure before editing. Repair only a directly
reproduced R-008 blocker or the narrowly scoped real-entrypoint test harness.
Do not weaken assertions, replace the real command with a synthetic throw,
increase timeouts beyond the existing test-local 15 seconds, update snapshots,
or regenerate fixtures. Rerun the same command at most twice after targeted
fixes and stop under the AGENTS.md convergence rules.

After the CLI check passes, run:

2. pnpm --filter @mediaforge/math-education --filter @mediaforge/cli typecheck

Only if a repair changes workflow production code, insert this directly affected
check before typecheck:

pnpm test:focused -- packages/math-education/src/orchestration/workflow-store.unit.test.ts

Do not run render integration, the 180-second production render, repository-wide
tests, builds, lint, snapshot updates, fixture regeneration, provider/network
commands, or publish. Do not modify pnpm-lock.yaml if pnpm notices the preserved
untracked educational-renderer package.

When the focused checks pass, keep R-008 implemented and pending a new,
separate independent acceptance dated 2026-07-13. Do not mark it accepted.
Update only:

- docs/mathe/audits/remediation-backlog.md
- docs/reports/2026-07-12/math-genre-implementation-plan-implementation-report.md
- docs/reports/codex-runs/2026-07-13-math-r008-acceptance-blocker-repair.md

Accurately replace the outstanding-verification language with the final exact
results. Keep reports under 200 words. Report exact changed paths, exact
commands/results, current commit hash, remaining risks, deviations, and anything
not verified. Do not create an acceptance report, do not create another run
report, and do not commit. Recommend a separate independent R-008 acceptance
prompt as the next step only after all authorized checks are green.
```
