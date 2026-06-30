# Codex Verification Guardrails

This repository keeps Codex verification focused, bounded, and cheap by combining instruction policy, a focused test runner, and a repo-local Codex hook that blocks broad shell verification commands by default.

Instruction hierarchy:

- Root `AGENTS.md` defines the repository-wide verification budget, fixture policy, and non-convergence stop rules.
- `packages/story-localization/AGENTS.md` adds story-localization-specific test and fixture rules.
- `.codex/hooks.json` enforces the shell-command guard for Codex CLI `PreToolUse` Bash commands.

Focused test command:

```bash
pnpm test:focused -- packages/story-localization/src/story-artifact-model.unit.test.ts
```

Optional exact-name narrowing:

```bash
pnpm test:focused -- packages/story-localization/src/story-artifact-model.unit.test.ts -t "normalizes full story artifacts"
```

Allowed by default:

- `pnpm test:focused -- <test-file>`
- `pnpm exec vitest run -c vitest.unit.config.ts --bail=1 <test-file>`
- `pnpm --filter @mediaforge/story-localization typecheck`

Blocked by default:

- `pnpm test`
- `pnpm test:unit` without an explicit file
- broad recursive `pnpm -r ... test`
- `pnpm build`
- workspace-wide `pnpm typecheck`
- Vitest snapshot-update flags such as `-u` or `--update`
- broad fixture or snapshot regeneration commands

Override:

```bash
ALLOW_BROAD_VERIFICATION=1 pnpm test
```

Use the override only when a human intentionally requests broader verification. The hook reads that environment variable and allows the command through without changing normal human terminal behavior outside Codex hook execution.

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

- Repository-local hook support is available in the installed Codex CLI version used for this setup.
- The active repository hook file is `.codex/hooks.json`.
- The hook event used here is `PreToolUse` with the `Bash` matcher.

Hook payload notes:

- Current Codex `PreToolUse` Bash payloads arrive on `stdin` as JSON and include `tool_name`, `tool_input.command`, `cwd`, `session_id`, `turn_id`, `permission_mode`, and related context.
- The guard script parses only that documented JSON input and never executes payload content.

Examples:

- Allowed: `pnpm test:focused -- packages/story-localization/src/story-artifact-model.unit.test.ts`
- Allowed: `pnpm --filter @mediaforge/story-localization typecheck`
- Blocked: `pnpm test`
- Blocked: `pnpm build`
- Blocked: `pnpm test:unit`
- Blocked: `pnpm exec vitest run -c vitest.unit.config.ts -u`
