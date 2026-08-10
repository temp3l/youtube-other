# Codex Verification Guardrails

This repository keeps Codex verification focused, bounded, and cheap through instruction policy and a focused test runner.

Instruction hierarchy:

- Root `AGENTS.md` defines the repository-wide verification budget, fixture policy, and non-convergence stop rules.
- `packages/story-localization/AGENTS.md` adds story-localization-specific test and fixture rules.
- Codex follows these limits through repository instructions; no repository-local Codex hooks are installed.

Focused test command:

```bash
pnpm test:focused -- packages/story-localization/src/story-artifact-model.unit.test.ts
```

Optional exact-name narrowing:

```bash
pnpm test:focused -- packages/story-localization/src/story-artifact-model.unit.test.ts -t "normalizes full story artifacts"
```

Preferred commands:

- `pnpm test:focused -- <test-file>`
- `pnpm exec vitest run -c vitest.unit.config.ts --bail=1 <test-file>`
- `pnpm --filter @mediaforge/story-localization typecheck`

Commands Codex should not run by default:

- `pnpm test`
- `pnpm test:unit` without an explicit file
- broad recursive `pnpm -r ... test`
- `pnpm build`
- workspace-wide `pnpm typecheck`
- Vitest snapshot-update flags such as `-u` or `--update`
- broad fixture or snapshot regeneration commands
- chained `pnpm test:focused` commands in one shell invocation
- chained `pnpm ... build && pnpm test:focused` commands
- filtered package `pnpm --filter ... build` commands during agent tasks
- repeated identical focused-test commands more than twice in one session
- ad-hoc `node --input-type=module -e` debug scripts

Cursor hook override:

```bash
ALLOW_BROAD_VERIFICATION=1 pnpm test
ALLOW_ADHOC_DEBUG=1 node --input-type=module -e "..."
```

Use the override only when a human intentionally requests broader verification. The Cursor hook reads that environment variable and allows the command through without changing normal human terminal behavior outside Cursor hook execution.

Cursor agents use the same policy through `.cursor/hooks.json`.

Retry and convergence limits:

- Maximum three distinct test commands per implementation context
- Maximum two repair reruns of the same failing command
- No rerun of an unchanged failing command
- Stop when the same focused failure survives two targeted fixes
- Stop when more than three fixtures appear to need edits
- Report unresolved failures instead of continuing to experiment

Fixture policy:

- Classify failures before editing fixtures: production defect, intentional contract change, stale fixture from that change, or unrelated pre-existing failure.
- Change fixtures only when the approved task intentionally changed the contract.
- Do not broadly regenerate fixtures or snapshots.
- Do not change unrelated timestamps, hashes, ordering, formatting, metadata, or generated identifiers.

Non-convergence behavior:

- Stop when a broad command exposes unrelated failures.
- Stop when fixing the test would require weakening an assertion.
- Stop when repository evidence does not reconcile production behavior and fixture expectations.
- Report the exact failing command, exact test name, concise failure, classification, likely owner, and smallest recommended follow-up.

Hook installation status:

- No repository-local Codex hook is installed or enabled.
- Cursor agents continue to use `.cursor/hooks.json` for the same verification policy.

Examples:

- Allowed: `pnpm test:focused -- packages/story-localization/src/story-artifact-model.unit.test.ts`
- Allowed: `pnpm --filter @mediaforge/story-localization typecheck`
- Blocked: `pnpm test`
- Blocked: `pnpm build`
- Blocked: `pnpm test:unit`
- Blocked: `pnpm exec vitest run -c vitest.unit.config.ts -u`
