# M2-001: Refresh the post-refactor mathematics audit

Audit the current mathematics implementation after the repository refactor. This is a
read-only production-code task: update audit and task documentation, but do not repair
production source in this run.

## Read first

- `AGENTS.md`
- `docs/ai-context/context-pack.md`
- `docs/ai-context/mathematics/profile.md`
- `docs/mathe/audits/post-implementation-verification.md`
- `docs/mathe/audits/remediation-backlog.md`
- `docs/refactor/audit/README.md`
- current math-related Codex-run reports from 2026-07-14 onward
- this complete `todo-prompts/math-2/` task pack

Inspect current source in `packages/math-education`, `packages/math-rendering`,
`packages/educational-renderer`, `packages/workflow-engine`, `packages/speech`,
`packages/metadata`, `packages/youtube-upload`, and the relevant `apps/cli` entry points.
Do not preload unrelated documentation.

## Baseline

Record the branch, `HEAD`, working-tree status, recent history, and the revision audited
by the old audit. Inspect the math-relevant diff from that revision to current `HEAD` and
include pre-existing uncommitted changes without adopting or overwriting them.

Reconstruct the real runtime path:

```text
CLI -> workflow operator -> math task implementations -> artifacts/state
    -> verifier -> localization/speech -> visuals/render -> quality
    -> metadata/thumbnail -> publish dry-run
```

For every boundary, record the owner, input/output contract, current implementation,
artifact identity, cache/state behavior, public entry point, and focused test evidence.

## Historical disposition

Reassess every finding in `post-implementation-verification.md`, every `A-*` backlog
item, and every later `R-*` follow-up. Assign one current status:

- `FIXED_BY_REFACTOR`
- `STILL_OPEN`
- `SUPERSEDED`
- `NO_LONGER_APPLICABLE`
- `REGRESSED`
- `UNVERIFIED`
- `HUMAN_OR_EXTERNAL_BLOCKER`

Each classification requires a current path/symbol, test, or command result. Historical
reports alone are not acceptance evidence. Identify new gaps introduced or exposed by
the shared-engine migration.

At minimum, verify the baseline hypotheses in `todo-prompts/math-2/README.md`, including
whether math workflow registrations have real implementations, whether legacy production
commands remain simulation-backed, and whether the current curriculum and teacher assets
remain production-blocking.

## Focused checks

Inspect package scripts and Vitest config before selecting commands. Run at most three
distinct focused test commands. Prefer one profile/registry test, one real CLI boundary
test, and one renderer or verifier integration test. Do not run broad build, test, lint,
snapshot, fixture-regeneration, provider, render, or publish commands.

## Outputs

Create or replace the post-refactor documents:

- `docs/mathe/audits/post-refactor-implementation-audit.md`
- `docs/mathe/audits/remediation-backlog-v2.md`

The audit must contain the baseline, runtime map, historical disposition table, current
requirement matrix, command results, findings by severity, provider/mutation safety,
story/horror compatibility, verdict, and unverified areas.

The backlog must use `M2-*` IDs and align with this task pack. If current evidence makes
a later prompt materially wrong, update that prompt and the README in this audit run.
Do not invent additional implementation work without source evidence.

## Acceptance

- Every historical finding and task has a current disposition.
- Every new backlog item cites current evidence and has a matching prompt or explicit
  human/external gate.
- Task dependencies reflect current code, not historical ordering.
- The audit distinguishes implemented, focused-tested, inferred, and independently
  accepted behavior.
- A Codex-run report records changed files, commands, results, risks, and next task.

Do not commit unless explicitly requested.
