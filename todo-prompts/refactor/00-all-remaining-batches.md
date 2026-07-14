# Codex Prompt — Complete Remaining Repository Refactor Batches

Implement all remaining work in `docs/refactor/`: Batches 12, 13, and 14.

Treat this as one persistent execution request containing three sequential,
independently reviewable and reversible implementation contexts. Do not combine
the batches into one undifferentiated refactor. Continue autonomously while the
current gate is converging; stop dependent work when a prerequisite fails.

## Required context

Before implementation, read completely:

- `AGENTS.md`
- any closer `AGENTS.md` for an affected package
- `docs/ai-context/context-pack.md`
- `docs/development/codex-verification-guardrails.md`
- `docs/refactor/README.md`
- `docs/refactor/02-safe-implementation-batches.md`
- `docs/refactor/03-compatibility-and-migration.md`
- `docs/refactor/06-duplicate-elimination.md`
- `docs/refactor/07-ai-content-pack.md`
- `docs/refactor/08-validation-and-release.md`
- `docs/refactor/audit/README.md`
- `docs/reports/codex-runs/2026-07-14-batch-11-production-caller-migration.md`

Treat current source and tests as authoritative. Inspect relevant code, package
scripts, Vitest configuration, command registration, and existing tests before
editing or choosing validation commands.

## Worktree and safety contract

- Record `git status -sb` and the current commit before editing.
- The worktree is substantially dirty and includes accepted Batch 0-11 work and
  unrelated user-owned changes. Never reset, clean, restore, overwrite, stage,
  or commit those changes.
- Maintain a per-batch changed-path ledger that distinguishes new edits from
  pre-existing changes. If an essential file already has edits, inspect and
  preserve them; stop if ownership cannot be reconciled safely.
- Do not modify generated assets, production media, `.artifacts/`, episode
  output/state/generated-assets trees, or unrelated fixtures.
- Do not invoke paid providers, uploads, publishing, credentialed network calls,
  or remote rendering. Use deterministic fixtures, mocks, dry runs, and explicit
  mutation seams.
- Do not weaken assertions, regenerate snapshots broadly, or silently resolve
  artifact conflicts.
- Follow the command, retry, fixture, and non-convergence budgets in `AGENTS.md`
  independently for each batch.

## Batch 12 — Migration Utilities and Publish Approval

Implement the complete Batch 12 contract from the refactor plans.

- Provide deterministic, dry-run-first migration plans with stable IDs.
- Verify source and destination hashes immediately before any write.
- Detect ambiguity, conflicting valid destinations, traversal, containment,
  schema, provenance, and interruption failures; fail closed.
- Promote artifacts atomically, append migration events, preserve rollback
  manifests, and never overwrite a differing valid destination.
- Keep legacy reads until explicit migration acceptance. Never perform an
  automatic bulk move.
- Bind publish approval to the exact artifact revisions and hashes, metadata,
  channel/account, locale, variant, dry-run evidence, and approving actor.
- Reject absent, stale, mismatched, or unattributable approval before reaching
  the publishing mutation seam.
- Preserve documented compatibility command JSON, stderr, and exit behavior.
- Add focused tests for zero-write dry-run, conflicts, interrupted migration,
  rollback validation, stale approval, wrong channel/locale/variant, changed
  metadata/artifacts, and proof that publishing cannot be reached without a
  current approval.

Run directly affected tests first, then at most one affected-package typecheck
after focused tests pass. Record targeted searches and diff checks. Create:

`docs/reports/codex-runs/2026-07-14-batch-12-migration-publish-approval.md`

Update refactor status only if the completion criteria genuinely pass. Do not
start Batch 13 unless Batch 12 is accepted.

## Batch 13 — Remove Duplicates and Deprecated Logic

Re-run the current source-backed caller inventory. Process one production
family at a time in the order required by `06-duplicate-elimination.md`.

- Search executable callers, imports, scripts, npm wrappers, Codex prompts,
  production writers, provider construction/endpoints, path literals, prompt
  reads, file-existence success checks, and alternate cache/state/approval/batch
  writers.
- Classify every match as canonical implementation, intentional strategy, thin
  compatibility adapter, obsolete duplicate, or unresolved.
- Remove logic only when all active callers are migrated and every removal gate
  passes. Never infer that untracked external automation is absent.
- Keep delegating aliases when the support window or acceptance condition is
  unmet. Record the exact replacement and removal condition.
- Do not delete intentional provider, rendering, execution-mode, or profile
  strategies merely because they share an interface.
- For every removal, record symbols/paths, former callers, canonical owner,
  retained adapter, characterization tests, searches, compatibility result,
  and rollback method.
- Validate each affected family before moving to the next one.

Create:

`docs/reports/codex-runs/2026-07-14-batch-13-duplicate-removal.md`

Batch 13 may be accepted with retained adapters only when each adapter is
explicitly classified as compatibility debt with a documented removal gate.
Do not start Batch 14 while unexplained duplicate application logic remains.

## Batch 14 — AI Pack and Final Release Gate

Implement the complete AI-pack and release contracts.

- Add deterministic `pnpm ai-pack:build`, `pnpm ai-pack:validate`, and
  `pnpm ai-pack:status` commands using repository conventions.
- Use an explicit source configuration; lexical ordering; normalized line
  endings; atomic writes; source, symbol, size, and SHA-256 tracking; and stable
  generated content for unchanged inputs.
- Generate the curated structure, `MANIFEST.json`, `source-index.json`, and a
  compatible generated `context-pack.md`.
- Reject stale or missing sources/symbols, invalid manifests/JSON, duplicate
  outputs, path escapes, broken internal links, binaries, generated media,
  oversize files/packs, and credential-like content. Report secret matches only
  by file and redacted key type.
- Verify two consecutive unchanged builds produce identical content hashes
  apart from fields explicitly documented as variable.
- Update documentation only where architecture, commands, configuration, or
  behavior actually changed.
- Run the final duplicate/writer/stale-import/legacy-command/path scans and
  compare results with the recorded baseline.

I explicitly authorize the broad deterministic release checks listed in
`docs/refactor/08-validation-and-release.md`, but only after focused checks pass
and after inspecting the current scripts/configuration. Use the repository's
required broad-verification override. Do not run provider, upload, publish,
remote-render mutation, or production-media commands. Stop and classify broad
failures rather than turning release verification into unrelated repair work.

Create:

`docs/reports/codex-runs/2026-07-14-batch-14-ai-pack-release.md`

Update the master refactor status and final acceptance evidence accurately.

## Failure and completion behavior

- Never rerun an unchanged failure.
- Classify failures before changing fixtures.
- Stop when the same focused failure survives the allowed targeted repairs,
  more than three fixtures would need edits, assertions would need weakening,
  or a broad command exposes unrelated failures.
- When blocked, report the exact command, test name, concise failure,
  classification, likely owner, and smallest safe follow-up.
- After every modifying batch, create its required Codex-run report with changed
  files, checks/results, remaining risks, follow-ups, and current commit hash.
- Final output must identify completed, partial, and uncompleted batches; changed
  paths; exact verification; commit hash; unresolved risks; and confirmation
  that no paid provider, upload, publish, or remote mutation ran.

