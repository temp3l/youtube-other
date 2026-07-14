# Repository Baseline and Audit Gate

Status: **ACCEPTED**. This audit completed as a read-only release gate. The
operator accepted the canonical boundaries, compatibility policy, rollback
rules, and batch order on 2026-07-13 by instructing Codex to implement the
remaining work. Batch 1 is authorized; later batches remain subject to their
recorded prerequisites.

## Baseline

| classification | path                                          | symbol_or_command | line            | behavior                                                                                                                                                                                                                                                        | confidence | evidence                                                                                                  |
| -------------- | --------------------------------------------- | ----------------- | --------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------- | --------------------------------------------------------------------------------------------------------- |
| FACT           | `.git`                                        | `HEAD`            | repository      | Audit commit is `b67dd6343a0922dbab328f5977329f55f10a3585` on `mathe-init`, tracking `origin/mathe-init`.                                                                                                                                                       | high       | `git rev-parse HEAD`; `git branch --show-current`; `git rev-parse --abbrev-ref --symbolic-full-name @{u}` |
| FACT           | repository                                    | `git status -sb`  | start of audit  | Initial status was `## mathe-init...origin/mathe-init`, modified `docs/README.md`, and untracked `.artifacts/`, `.tmp/mock-openai-server.mjs`, `docs/refactor/`, `docs/reports/codex-runs/2026-07-13-repository-refactor-plans.md`, and `math-video-examples/`. | high       | Captured before inspection and again after baseline commands.                                             |
| FACT           | repository                                    | audit writes      | gate            | Only files below `docs/refactor/audit/` and the audit run report are created by this gate. Existing modified/untracked content is user-owned and preserved.                                                                                                     | high       | Final `git status -sb`; changed-path review.                                                              |
| FACT           | `pnpm-workspace.yaml`                         | workspace roots   | 1               | The monorepo contains `apps/*` and `packages/*`; the lockfile has an importer for every discovered workspace.                                                                                                                                                   | high       | `package.json`/`pnpm-lock.yaml` inventory.                                                                |
| FACT           | `docs/refactor/00-baseline-and-audit-gate.md` | audit scope       | current section | Content scans excluded dependencies, generated outputs/state/assets, media roots, transcripts, logs, `.artifacts/`, and sample media. `dist` was consulted only for packaged-runtime drift.                                                                     | high       | Recorded search commands and targeted reads.                                                              |

The exact start status is intentionally retained here even though this audit
adds documentation afterward. No listed path was cleaned, staged, rewritten,
or adopted.

## Gate outputs

| Register                                     | File                                                                       | Coverage                                                                                                                                         |
| -------------------------------------------- | -------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| Entry points and callers                     | [01-entrypoints-and-orchestration.md](01-entrypoints-and-orchestration.md) | Root scripts, workspace bins, CLI/API/web/bootstrap paths, command registrations, wrappers, helpers, task/orchestration families, test coverage. |
| Contracts, configuration, prompts, providers | [02-contracts-config-prompts.md](02-contracts-config-prompts.md)           | Domain/schema ownership, env readers, profiles, prompt versions, provider adapters, retries/timeouts, debug logging.                             |
| Artifact matrix                              | [03-artifact-matrix.md](03-artifact-matrix.md)                             | Producers, consumers, current paths, locale/variant policy, resolver keys, canonical writes, legacy reads, risks.                                |
| State and production profiles                | [04-state-quality-profiles.md](04-state-quality-profiles.md)               | Caches, fingerprints, invalidation, state, approvals, batches, Dark Truth, mathematics, AI-pack freshness.                                       |
| Duplicate register                           | [05-duplicate-register.md](05-duplicate-register.md)                       | All known duplicate candidates, callers, behavior differences, risk, owner, characterization, adapters, removal gates, disposition.              |
| Failure register                             | [06-failure-register.md](06-failure-register.md)                           | Exact commands and failing test names, classifications, evidence, and owning modules.                                                            |

Every workspace and production family is represented. Packages with no direct
tests (`source-ingestion`, `transcript-cleaning`, API, and web) are called out
as coverage gaps rather than silently omitted.

## Accepted-on-approval canonical boundaries

These selections follow `01-target-architecture.md`; they are recommendations
until the operator accepts this gate.

| classification | path                                                          | symbol_or_command                | line                        | behavior                                                                                                                                                                                                    | confidence | evidence                                                                |
| -------------- | ------------------------------------------------------------- | -------------------------------- | --------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------- | ----------------------------------------------------------------------- |
| RECOMMENDATION | `packages/domain/src/index.ts`                                | domain contracts                 | current exports             | Own stable IDs, locale/variant/profile enums, task/artifact/workflow envelopes, quality and approval contracts. Capability packages may refine but not redefine them.                                       | high       | Duplicate/schema register D01-D06; target architecture ownership table. |
| RECOMMENDATION | `packages/config/src/index.ts`                                | `loadRuntimeConfig`              | 860                         | Own environment parsing, precedence, secret names, capability profiles, retry/timeout policy, and redacted config diagnostics.                                                                              | high       | Config register C01-C06.                                                |
| RECOMMENDATION | `packages/shared/src/episode-filesystem.ts`                   | `createEpisodePathResolver`      | 1280                        | Own containment-safe physical path resolution and legacy discovery. It remains free of orchestration and product policy.                                                                                    | high       | Artifact matrix; target architecture lines 27, 97-99.                   |
| RECOMMENDATION | `packages/workflow-engine`                                    | new package                      | target architecture line 28 | Own the task registry, DAG, attempts/events, locks, state, cache decisions, invalidation, approvals, overrides, reconciliation, error normalization, and batch coordination.                                | high       | Existing orchestration register O01-O13; Batch 2 plan.                  |
| RECOMMENDATION | capability packages                                           | one application service per task | package boundary            | Story, image, speech, render, metadata, upload, and math packages own task behavior; provider implementations are selectable infrastructure strategies.                                                     | high       | Task register and duplicate policy.                                     |
| RECOMMENDATION | `apps/cli/src/index.ts`                                       | CLI composition root             | 4421                        | Parse arguments, compose dependencies, invoke registered tasks, format output, and keep compatibility aliases thin. It must not own schemas, hidden writers, or task behavior.                              | high       | CLI registration and hidden-writer evidence.                            |
| RECOMMENDATION | `packages/math-rendering` and `packages/educational-renderer` | math rendering boundary          | package roots               | `math-rendering` owns math-semantic adapters/contracts; `educational-renderer` owns deterministic render transport. Keep both as explicit strategies until integration characterization proves equivalence. | medium     | Math register M08-M12; duplicate register D11.                          |

## Compatibility, rollback, and removal policy

1. New writes are canonical-only and atomic. Reads validate the canonical
   candidate first, then ordered legacy candidates. Ambiguous valid candidates,
   hash mismatch, schema mismatch, traversal, or symlink escape fail closed.
2. Every legacy read returns provenance: resolver version, selected path,
   legacy/canonical class, fingerprint, and validation result. It never silently
   repairs or overwrites a source artifact.
3. A compatibility command normalizes legacy input, delegates to the canonical
   task, and translates only the documented output/exit shape. A wrapper with
   this behavior is an adapter, not a duplicate.
4. Migration defaults to dry-run; copy/validate/promote is atomic, never
   overwrites a differing valid destination, and emits a hash-bound rollback
   manifest. Code rollback restores adapters; state rollback appends a
   compensating event. Publish/upload has no automatic rollback.
5. A legacy writer or duplicate can be removed only after all callers are
   migrated, characterization and packaged-CLI tests pass, telemetry shows the
   compatibility window has elapsed, rollback is proven, and operator approval
   is recorded.

The current authored-script resolver deliberately rejects stale layouts instead
of reading them. That is a documented conflict with the selected read-compatible
policy; it remains unchanged until the resolver batch.

## Safe batch order

The accepted order remains the dependency order in
`02-safe-implementation-batches.md`:

1. Stabilize and classify the baseline.
2. Introduce contracts and the workflow engine.
3. Canonicalize artifact resolution and migration primitives.
4. Consolidate profiles, configuration, providers, and observability.
5. Establish durable state, approvals, cache decisions, and batches.
6. Add the canonical operator loop.
7. Migrate story/Dark Truth, media, then mathematics production families.
8. Migrate remaining callers and provide dry-run migration/publish approval.
9. Remove duplicates only after their individual gates pass.
10. Generate the AI pack and run the final release gate.

Within every batch: capture `git status -sb`, characterize first, implement one
owner plus adapters, run focused checks, verify dry-run/write boundaries, and
stop on the guardrails in `docs/development/codex-verification-guardrails.md`.

## Baseline verification summary

| classification | path           | symbol_or_command                           | line               | behavior                                                                                              | confidence | evidence                                                            |
| -------------- | -------------- | ------------------------------------------- | ------------------ | ----------------------------------------------------------------------------------------------------- | ---------- | ------------------------------------------------------------------- |
| FACT           | `package.json` | `ALLOW_BROAD_VERIFICATION=1 pnpm typecheck` | script `typecheck` | Failed with four `math-verifier.v2` values incompatible with the canonical `math-verifier.v3` union.  | high       | One audit run; exact sites in failure register.                     |
| FACT           | `package.json` | `ALLOW_BROAD_VERIFICATION=1 pnpm lint`      | script `lint`      | Failed with 12 errors: eleven undefined `NodeJS` names and one undefined `YoutubeUploadCommandInput`. | high       | One audit run; exact sites in failure register.                     |
| FACT           | `package.json` | `ALLOW_BROAD_VERIFICATION=1 pnpm test:unit` | script `test:unit` | 148 files passed, 17 failed; 1,128 tests passed, 64 failed, 5 todo.                                   | high       | One audit run; exact names and classifications in failure register. |

No assertion, fixture, snapshot, generated output, or production implementation
was changed. Batch 1 should treat the classifications in the failure register
as hypotheses to verify with its accepted contract owner before repair.

## Reproducible search probes

Run from the repository root with generated/media exclusions applied:

```bash
rg -n '(writeFile|appendFile|rename|copyFile|mkdir|rm|unlink|createWriteStream|writeJsonAtomic|writeTextAtomic|copyAtomic)' apps packages scripts \
  -g '!**/dist/**' -g '!**/coverage/**' -g '!**/node_modules/**'
rg -n '(new OpenAI|fetch\(|/v1/|google\.youtube|OpenAiCompatible|OPENAI_API_KEY|YOUTUBE_)' apps packages scripts \
  -g '!**/dist/**' -g '!**/node_modules/**'
rg -n 'path\.(join|resolve)\(' apps packages scripts -g '!**/dist/**' -g '!**/node_modules/**'
rg -n 'z\.(object|strictObject|enum)|supportedLanguages|localeSchema|variantSchema' apps packages \
  -g '!**/dist/**' -g '!**/node_modules/**'
rg -n 'packages/.*/dist|from "@mediaforge/' apps packages scripts \
  -g '!**/dist/**' -g '!**/node_modules/**'
```

Content searches must additionally exclude `episodes/**/output/`,
`episodes/**/state/`, `episodes/**/generated-assets/`, `audio/`, `video/`,
`images/`, `transcripts/`, `logs/`, `.artifacts/`, and sample media.

## Explicit documentation conflicts

| classification | path                                                   | symbol_or_command            | line                         | behavior                                                                                                                                                                                                         | confidence | evidence                                           |
| -------------- | ------------------------------------------------------ | ---------------------------- | ---------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------- | -------------------------------------------------- |
| FACT           | `docs/migrations/media-consolidation-plan.md`          | `packages/pipeline`          | 3, 83, 99, 266               | The document assigns behavior to a package that does not exist. The current owners are CLI and capability packages.                                                                                              | high       | Workspace/package inventory.                       |
| FACT           | `docs/audits/restored-story-docs-and-prompts-audit.md` | active template loader claim | 27-38, 93                    | It describes legacy story templates as actively loaded; production localization compiles modular prompts and no production caller uses the template loader.                                                      | high       | Prompt imports/callers; compiler entry points.     |
| FACT           | `docs/ai-context/context-pack.md`                      | current-state claim          | heading and refresh metadata | The pack predates the current mathematics/educational renderer surface and dirty-tree baseline.                                                                                                                  | high       | AI-pack register A01-A08.                          |
| FACT           | `packages/shared/src/episode-filesystem.ts`            | authored script resolver     | 140-360                      | Source rejects stale layouts when canonical authored script is absent; `03-compatibility-and-migration.md` requires ordered legacy discovery. Code remains authoritative until an accepted migration changes it. | high       | Source, resolver tests, migration plan lines 5-41. |
| FACT           | `docs/architecture/system-overview.md`                 | CLI ownership guidance       | CLI section                  | Architecture says the CLI is an adapter, but current CLI constructs schemas, providers, and some artifacts.                                                                                                      | high       | CLI bootstrap/read-manifest inventory.             |

## Acceptance record

- Reviewer: repository operator (recorded through the active user instruction).
- Date: 2026-07-13.
- Canonical boundaries: accepted as recorded above.
- Compatibility and rollback policy: accepted as recorded above.
- Batch ordering: accepted without amendment.
- Authorization scope: begin and sequence the remaining implementation batches;
  every later batch still requires its predecessor's completion evidence.
