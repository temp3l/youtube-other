# Codex Prompt — Refactor Batch 14: AI Pack and Release Gate

Implement Batch 14 from `docs/refactor/02-safe-implementation-batches.md`.
Do not proceed unless repository evidence shows Batch 13's duplicate-removal
gate is accepted, including explicit removal conditions for retained adapters.

## Required reading

Read `AGENTS.md`, closer package instructions, `docs/ai-context/context-pack.md`,
`docs/development/codex-verification-guardrails.md`, and:

- `docs/refactor/02-safe-implementation-batches.md`, Batch 14
- `docs/refactor/07-ai-content-pack.md`
- `docs/refactor/08-validation-and-release.md`
- `docs/refactor/audit/README.md`
- accepted Batch 12 and Batch 13 Codex-run reports

Inspect current package scripts, generator conventions, tests, CLI help, and
Vitest configuration before editing. Record `git status -sb`; preserve all
pre-existing dirty-tree changes; do not reset, clean, restore, stage, or commit.

## AI-pack implementation

- Add deterministic `pnpm ai-pack:build`, `pnpm ai-pack:validate`, and
  `pnpm ai-pack:status` commands.
- Use an explicit source configuration, lexical ordering, normalized line
  endings, SHA-256 source/output hashes, atomic writes, and deterministic content
  for identical inputs.
- Produce the documented curated directory structure, `MANIFEST.json`,
  `source-index.json`, and generated compatibility `context-pack.md`.
- Track generator/schema versions, revision/dirty state, included files, source
  mappings, exclusions, sizes, required sections, limitations, and unresolved
  mappings.
- Validate freshness, source paths and required symbols, internal links,
  manifest/JSON schemas, duplicate outputs, path containment, binary/generated
  media exclusion, per-file/total limits, and credential-like content.
- Secret diagnostics must disclose only the file and redacted key type.
- Verify two consecutive builds from unchanged inputs have identical content
  hashes apart from fields explicitly documented as variable.
- Update docs only when commands, configuration, architecture, or behavior
  changed.

Add focused generator/status/validation tests first and follow the AGENTS.md
verification budget. Run targeted lint/typecheck after focused tests pass.

## Final release authorization

I explicitly authorize the broad deterministic commands listed in
`docs/refactor/08-validation-and-release.md`, but only after focused checks pass
and after inspecting their current definitions/configuration. Use the required
repository broad-verification override. Also perform the final targeted
duplicate-writer, stale-import, legacy-command, and artifact-path searches.

Never run provider credentials, paid generation, YouTube upload/publishing,
remote rendering mutation, production media generation, snapshot updates, or
fixture regeneration. Do not rerun unchanged failures. If a broad command
exposes unrelated failures, stop repair, classify them against the baseline,
and report them for explicit operator acceptance; introduced regressions block
release.

Create `docs/reports/codex-runs/2026-07-14-batch-14-ai-pack-release.md`. Update
the master refactor status only when the documented completion criteria are
evidenced. Report completed/partial/uncompleted work, changed files, exact
commands/results, deterministic-build evidence, accepted baseline failures,
unresolved debt, unverified behavior, current commit hash, and explicit
confirmation that no provider, upload, publish, or remote mutation ran.

