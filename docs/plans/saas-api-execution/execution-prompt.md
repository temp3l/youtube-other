# Single-Task Execution Prompt

Use this prompt with `terra/high`, replacing `<TASK_FILE>` with exactly one task
path from this pack.

```text
Implement exactly <TASK_FILE> on the current branch.

Before editing, read the repository AGENTS.md, docs/ai-context/context-pack.md,
docs/plans/saas-api-execution/README.md, the task file, and only the directly
linked API-plan documents. Inspect current source and tests; source is
authoritative when the plan is stale.

Stay inside the task's scope and dependencies. Do not perform paid provider
calls, provision external infrastructure, use customer credentials/data, expose
the API publicly, or mutate YouTube unless the task explicitly requires it and
I have separately authorized the exact effect and numeric ceiling. Preserve the
canonical application/workflow layer, tenant isolation, one-writer authority,
and fail-closed uncertain effects.

Before edits, state the files you expect to change and why. Run the directly
affected focused test first. Stay within the AGENTS.md verification budget; do
not run broad builds/tests or regenerate fixtures. Classify failures before
editing expectations.

Complete the task only when its acceptance criteria are met. Create the required
plan implementation report under docs/reports/<YYYY-MM-DD>/ and the Codex run
report under docs/reports/codex-runs/. Report changed files, exact checks and
results, commit hash, unresolved risks, and the next unblocked task. Do not start
the next task.
```

## Human-Gated Tasks

- Task 00 must stop for unresolved business/vendor choices.
- Task 13 requires explicit external-system and cost authorization.
- Task 14 requires explicit publication credentials/effect authorization.
- Task 15 may run release validation only after explicit broad-release-check approval.
