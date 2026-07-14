# Baseline and Audit Gate

## Goal

Establish a reproducible, read-only repository baseline and a complete
duplicate/caller/artifact inventory before any production implementation is
changed. The audit is a release gate, not background documentation.

## Recorded Baseline

Date: 2026-07-13. Branch: `mathe-init` tracking `origin/mathe-init`.

The initial worktree contained modified and untracked mathematics-renderer
work, sample media, fixtures, reports, and prompts. These paths are user-owned
and must be preserved. The current exact list must be captured again at the
start of each implementation batch with `git status -sb`.

Validation observed during planning:

| Command | Result | Initial classification |
| --- | --- | --- |
| `pnpm typecheck` | Failed in `@mediaforge/math-rendering`; four `math-verifier.v2` values conflict with the `math-verifier.v3` union. | Contract/source drift; classify before repair. |
| `pnpm lint` | Failed with 12 errors: eleven undefined `NodeJS` references and one undefined `YoutubeUploadCommandInput`. | ESLint environment/type-import defects. |
| `pnpm test:unit` | 148 files passed, 17 failed; 1,128 tests passed, 64 failed, 5 todo. | Mixed production defects, stale fixtures, contract drift, and possible stale `dist` imports. |

The most material failing areas were story prompt/response contracts, Short
prerequisites, image generation and dimension validation, authored-script
fallback expectations, math verifier lineage, math thumbnail generation,
workflow outcome normalization, and shared render clip profiles. This is not a
complete failure register; exact test names and classifications belong in the
audit output.

## Audit Scope

Inspect these areas without scanning excluded generated trees:

- all root and workspace `package.json` files and the lockfile;
- CLI bootstrap, registrations, compatibility commands, npm wrappers, scripts,
  shell helpers, API and web entry points;
- domain schemas, configuration/env parsing, prompt registries, provider
  adapters, retry/timeout logic, path utilities, filesystem writers, cache
  stores, state stores, batch services, logs, and migrations;
- story generation, localization, story workflow, image/reference/thumbnail,
  speech/caption, render, metadata, upload, mathematics curriculum,
  verification, visual rendering, pedagogy, and accessibility;
- matching unit, integration, E2E, fixture, help, and packaged-CLI tests;
- relevant architecture, development, migration, plan, report, Codex, and agent
  instructions;
- the current `docs/ai-context/` pack and any generation or validation tooling.

Exclude `node_modules/`, `dist/`, `coverage/`, generated episode output/state,
generated assets, media roots, transcripts, logs, `.artifacts/`, and sample
media from content scans. Inspect generated `dist` only when diagnosing source
versus packaged-runtime drift.

## Required Registers

The audit produces machine-readable or Markdown tables for:

1. entry points and every command/script caller;
2. task and orchestration implementations;
3. domain types and schema duplicates;
4. configuration and environment readers;
5. artifact producers, consumers, current paths, names, locale/variant rules,
   proposed resolver keys, legacy fallback, and risk;
6. prompts, versions, profiles, providers, retry/timeout, and debug logging;
7. caches, fingerprints, invalidation, workflow state, approvals, and batches;
8. Dark Truth bibles, continuity, references, and quality gates;
9. mathematics curriculum, correctness, visuals, pedagogy, and accessibility;
10. AI-pack sources, freshness, exclusions, secrets, binaries, and size.

For every duplicate implementation record all callers, observable differences,
risk, intended canonical owner, characterization test, migration adapter,
removal gate, and final disposition. A delegating wrapper is an adapter, not a
duplicate.

## Evidence Format

Each material row must include:

```text
classification: FACT | INFERENCE | RECOMMENDATION | UNRESOLVED
path: repository-relative file
symbol_or_command: exact identifier
line: current line or nearest stable section
behavior: concise observed behavior
confidence: high | medium | low
evidence: source, test, help output, or focused command
```

Documentation conflicts are recorded explicitly. Code and tests win unless a
documented product decision deliberately changes the contract.

## Failure Classification

Before editing a failing fixture or assertion, classify it as:

- `PRODUCTION_DEFECT`: implementation violates an accepted contract;
- `INTENTIONAL_CONTRACT_CHANGE`: approved behavior changed and consumers must
  migrate;
- `STALE_FIXTURE`: fixture represents the prior accepted contract;
- `STALE_BUILD_OUTPUT`: runtime imported outdated generated output;
- `UNRELATED_PREEXISTING`: outside the active batch and unchanged by it.

Assertions may not be weakened to make a batch pass. A failure that survives
two targeted fixes or stops converging is reported according to `AGENTS.md`.

## Gate Outputs

The audit gate is complete only when:

- all registers exist and cover every workspace and production family;
- canonical boundaries and temporary adapters are selected;
- the artifact matrix includes canonical write and legacy read policy;
- the compatibility, rollback, and safe-batch order are accepted;
- baseline failures have exact commands, test names, classifications, and
  owners;
- hidden-writer and direct-provider search patterns are recorded;
- no production file has been modified.

After acceptance, Batch 1 in `02-safe-implementation-batches.md` may begin.

