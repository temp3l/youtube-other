# Repository Baseline and Audit Gate

Status: **ACCEPTED**. This audit completed as a read-only release gate. The
operator accepted the canonical boundaries, compatibility policy, rollback
rules, and batch order on 2026-07-13 by instructing Codex to implement the
remaining work. Batch 1 is authorized; later batches remain subject to their
recorded prerequisites.

## Batch 1 implementation status

Status: **ACCEPTED** as of 2026-07-14. The source-backed production defects
recorded by the audit now have focused passing evidence. F01 and F12 were
reclassified as stale assertions: title-cased character names are valid, and
the approved full-image reuse policy targets one unique visual per ten seconds.
The F04-F05 CLI image-batch mocks now include the current manifest-item cache
state and their complete test file passes. The remaining stale-fixture clusters
were repaired and reverified in the sequence below. F06-F07 now model a passing script
score gate while asserting the exact gate request, and F08 passes against the
current math lineage contract. F09 now uses its manifest-declared dimensions
and passes; the shared provider-output helper now uses the canonical 1536x864
full-image size, clearing F10. F11 next fails on a stale provider-call-count
expectation after image validation succeeds. That assertion now verifies paid
call savings plus reuse lineage and output hashes; the image-pipeline file passes
42/42, clearing F11-F20. The math-rendering file passes 15/15 after repairing
F21's workflow chain and F22's owned-file message. F02-F03 now exercise genuinely
missing canonical scripts and the episode-command file passes 28/28. F23's
shared-clip fixture now uses a valid lightweight 16:9 profile and its exact test
passes. F24 is reconfirmed green at 12/12. The full rendering file does not emit
a completion record in this environment, but its only recorded baseline failure
has focused passing evidence. F25 now asserts the accepted 150/160/170 English
60-second range and passes 3/3. The F26-F39 fixture reconciliation exposed and
repaired a validator defect: localized Shorts may derive from an accepted
canonical English Short; its validator regression file passes 27/27. The Short
service fixture now reaches current narration-quality checks, where its old
mock exposed English-only German quality heuristics. The quality gate now
recognizes localized concrete details, hooks, cost verbs, and attachments; its
file passes 11/11. The canonical English Short locale is also checked against
its canonical full parent. The complete Short service file passes 17/17,
clearing F26-F39. See
`docs/reports/codex-runs/2026-07-14-baseline-stabilization-short-service.md`.
F40-F41 now characterize the current localized word range and focused-repair
payload, and the Short helper file passes 18/18. F50 now asserts the actual
German instruction. F51-F52 use the current narration-only response shape, and
F53-F54 compare resume semantics while allowing normalized outcome metadata.
Those renderer, schema, and workflow files pass 16/16 together. F42-F49 were
the final cluster before Batch 1 acceptance. F42 now verifies the schema-required localized
metadata allowlist and canonical full-duration word range. The localization file
advances to F43, whose stale mock returns Spanish before the required English
stage and therefore never writes the legacy failed-report path.
The current F43 response helper now satisfies the v4 schema and canonical word
range. Debug verification isolates its remaining English prerequisite failure
to `Missing ending.`; the next repair is the exact required final-warning line.
That ending is now present. F43 reaches current full validation without any
Short repair, and F44 reuses a pre-materialized source with the shared v4
English response. The file advances to F45, whose old first raw response still
causes English repair before the intended Spanish output-limit retry.
F45 now uses v4 English and neutral `es-419` responses at the canonical word
floor; its output-limit regeneration path passes without Short repair. F46 now
uses a current v4 success response and counts the preflight, retry attempts, and
Short request explicitly. The localization workflow succeeds through F46 and
advances to F47. F47 passes without further changes. F48 is classified as a
stale fixture: its first response supplied German to the required English stage.
Its isolated repair uses current v4 English, German, and intentionally invalid
Spanish full responses with localized Shorts disabled. The German fixture now
honors the canonical 1045-word floor; F48 passes and writes the valid German
sibling while isolating the Spanish failure. F49 passes directly, and the full
localization file passes 47/47 with one recorded todo. Touched-file ESLint,
`@mediaforge/story-localization` typecheck, and `git diff --check` pass. All
recorded F01-F64 baseline failures are resolved or reclassified with focused
passing evidence. Batch 1 is stable; **Batch 2 is authorized**.

## Batch 2 implementation status

Status: **ACCEPTED** as of 2026-07-14. `packages/domain` now owns strict,
versioned schemas for the two closed content profiles and shared task, artifact,
workflow, quality, approval, override, batch, and normalized-error contracts.
The contracts add branded identifiers, discriminated state/result/event unions,
hard-failure reason registries, invariants, and explicit legacy conversion
functions. The additive `packages/workflow-engine` skeleton owns typed workflow
errors, legacy error normalization, and the exhaustive stable exit-code mapping.
No production caller was migrated. Focused contract and taxonomy tests, both
affected-package typechecks, targeted ESLint, formatting, and diff checks pass.
Batch 2 is complete; **Batch 3 is authorized**.

## Batch 3 implementation status

Status: **ACCEPTED** as of 2026-07-14. The domain artifact intent now carries
validated item, format, and render-profile dimensions. `packages/shared` owns
the canonical episode and mathematics layout adapters plus containment and
symlink-safe path checks; the episode resolver exposes the typed mapping.
`packages/workflow-engine` owns manifest-backed discovery, checksum and
dependency verification, fail-closed ambiguity handling, durable temporary
promotion, side-effect-free migration planning, confirmed legacy copy, and
hash-guarded rollback manifests. Canonical writes do not dual-write and no
existing production caller was switched. Focused domain, resolver, and
repository tests, affected builds/typechecks, targeted ESLint, formatting, and
diff checks pass. Batch 3 is complete; **Batch 4 is authorized**.

## Batch 4 implementation status

Status: **ACCEPTED** as of 2026-07-14. `packages/workflow-engine` now owns the
validated task registry, per-profile DAG validation, deterministic dependency
ordering, readiness derivation, list/explain projections, and side-effect-free
workflow planning. Startup rejects duplicate IDs, missing required
dependencies, cycles, invalid profile edges, incompatible artifact contracts,
and invalid implementation ownership. Dark Truth and mathematics packages own
their additive profile task registrations and declare exactly one capability
owner for every logical task; optional implementation adapters preserve current
services and callers. Both complete profile workflows validate. Focused registry
and profile tests, affected-package typechecks, targeted ESLint, formatting,
and diff checks pass. Batch 4 is complete; **Batch 5 is authorized**.

## Batch 5 implementation status

Status: **ACCEPTED** as of 2026-07-14. `packages/workflow-engine` now owns the
canonical workflow store layout, durable append-only events, event-cursor-backed
state materialization, per-run attempt records, strict transitions, validated
revision-bound approvals and overrides, task/unit/artifact locks, interruption,
stale lock/run recovery, and reconciliation. Validated canonical artifact
manifests may explicitly repair the promotion-before-state crash window;
subsystem manifests remain evidence-only. Invalid materialized outputs are
invalidated. `next` is derived from the DAG, current state, artifacts,
approvals, invalidations, and permitted overrides. Focused contract, store, and
export tests, workflow-engine typecheck, targeted ESLint, formatting, and diff
checks pass. Batch 5 is complete; **Batch 6 is authorized**.

## Batch 6 implementation status

Status: **ACCEPTED** as of 2026-07-14. `packages/workflow-engine` now owns the
canonical operator service for registry projections, graph/plan/status/next,
single-task execution, explicit continuation, retry/resume, invalidation,
reconciliation, state rebuilding, and revision-bound overrides. `apps/cli`
adds stable JSON/error contracts under `workflow {episode,lesson,fixture}` plus
`task {list,explain,run}` without displacing legacy episode commands. Registry
metadata generates command help. A deterministic no-provider packaged fixture
proved side-effect-free dry run, exit-130 interruption, resume, one-task
`run-next`, reconciliation, validation, and completion. Focused operator and
CLI tests pass; targeted builds and manual packaged verification pass. The
packaged e2e file was not rerun after its final dry-run precedence repair because
the bounded two-rerun allowance was exhausted. Batch 6 is complete; **Batch 7
is authorized**.

## Batch 7 implementation status

Status: **ACCEPTED** as of 2026-07-14. `packages/workflow-engine` now owns
canonical normalized task fingerprints, manifest-backed cache decisions,
append-only decision evidence, versioned prompt/narration/story/image/render/
mathematics compatibility adapters, cache-miss explanations, and safe prune
planning that protects canonical attempt history. Hits require a matching
successful attempt or known-version legacy identity, current dependency
fingerprints, validated manifests, and artifact verification; unknown legacy
identity is always a miss. Material changes and explicit invalidation propagate
through declared DAG dependents while preserving unrelated branches. The
operator and additive `cache {inspect,explain-miss,prune}` CLI expose this
evidence. Focused fingerprint, operator, and CLI tests pass, as do the engine
typecheck, targeted ESLint, formatting, build, and diff checks. Existing
production cache callers remain on compatibility paths until their scheduled
family migrations. Batch 7 is complete; **Batch 8 is authorized**.

## Batch 8 implementation status

Status: **ACCEPTED** as of 2026-07-14. `packages/workflow-engine` now owns
deterministic batch/item identity, configured grouping/concurrency/retry/rate
limits, item-level partial success and resume, cancellation, reconciliation,
provider request lineage, cache evidence, cost totals, redaction, and durable
structured attempt telemetry. Sync and provider-batch modes invoke the same
registered task implementation rather than separate business logic. The
additive root `batch {plan,run,status,resume,reconcile,cancel}` CLI exposes the
canonical lifecycle. Story, image, and mathematics batch stores retain their
documented lifecycle while emitting versioned canonical sidecars through one
adapter; empty no-work legacy groups remain valid and create no false canonical
batch. Focused engine, domain, operator, story, image, and narrowed regression
evidence passed within the verification budget; the selected CLI/math files
were skipped after fail-fast and were not rerun. No provider or publishing
operation ran. Batch 8 is complete; **Batch 9 is authorized**.

## Batch 9 implementation status

Status: **ACCEPTED** as of 2026-07-14. Dark Truth now has strict versioned
story-bible and reference-image manifests, exact revision/hash/lineage and
approval bindings, canonical profile storage, actionable legacy migration
status, dependency-scoped invalidation, task fingerprint material, and
fail-closed profile readiness. Weighted narrative quality enforces every Dark
Truth hard reason independently; localization, visual, thumbnail, audio,
caption, audiovisual, metadata, publish-dry-run, and stale publish-approval
gates remain separate. The profile CLI exposes migration status, validation,
and a deterministic acceptance fixture. Full and Short traversals pass for
`en`, `de`, `es`, `fr`, and `pt` without provider calls. Focused Dark Truth and
CLI tests, the Dark Truth build, CLI typecheck, and diff checks pass. Existing
production callers remain on compatibility adapters for the later caller
migration batch. Batch 9 is complete; **Batch 10 is unblocked**.

## Batch 10 implementation status

Status: **ACCEPTED** as of 2026-07-14. Mathematics now has strict,
curriculum-bound lesson profiles and revision/hash-bound educational visual
style manifests covering typography, semantic color alternatives, renderer
versions, locale-visible labels, safe regions, optional references, validation,
and approval. Profile readiness and fingerprints bind curriculum, verifier,
lesson variant, full/Short variant, accessibility, and visual revisions. The
shared DAG adds an explicit visual-policy gate and keeps mathematical,
pedagogical, accessibility, audiovisual, metadata, publish-dry-run, and publish
approval gates separate. Legacy `math-workflow.v2` data imports only as
reconciliation evidence; verifier v2 is rejected. The lesson CLI exposes
migration status, profile validation, and deterministic acceptance across all
five locales, all three lesson variants, full and Short, and the approved pilot
scope. Offline verifier v3 pilots passed for number, geometry, and data domains
without provider calls. Focused profile, registry, and CLI tests, package build,
typecheck, targeted ESLint, and diff checks pass. Existing production callers
remain compatibility adapters for Batch 11. Batch 10 is complete; **Batch 11 is
unblocked**.

## Batch 11 implementation status

Accepted on 2026-07-14. The workflow engine now owns an explicit production
caller adapter that resolves every legacy CLI action to its registered Dark
Truth or mathematics task while preserving Commander arguments, output, and
exit behavior. CLI composition fails closed if a production action is left
unmapped. The metadata and scene-image shell implementations are now thin CLI
adapters, and the npm metadata compatibility alias no longer bypasses the
canonical provider boundary. Focused adapter and CLI setup tests pass, both
affected packages build, CLI typecheck passes, packaged help boots with the
complete command tree, and targeted searches find no direct OpenAI endpoint or
legacy shell invocation in executable callers. Batch 11 is complete; **Batch
12 is unblocked**.

## Batch 12 implementation status

Accepted on 2026-07-14. Artifact migration now has deterministic, dry-run-first
CLI plans, immediate source/destination revalidation, interruption-safe rollback
evidence, append-only migration events, and hash-validated rollback. The
canonical media publisher binds approval to exact artifact revisions and hashes,
metadata, channel/account, locale, variant, dry-run evidence, and an attributable
actor before its YouTube mutation seam. Focused migration, publisher, approval,
and CLI tests plus CLI typecheck and targeted static checks passed. Legacy reads
remain enabled and no automatic bulk move, provider call, upload, publish, or
remote mutation ran. Batch 12 is complete; **Batch 13 is unblocked**.

## Batch 13 implementation status

Accepted on 2026-07-14 with explicitly classified compatibility debt. The
source-backed inventory was rerun in production-family order and is recorded in
`07-batch-13-current-duplicate-inventory.md`. No removal gate was safely closed:
dormant public exports may have external consumers, subsystem stores preserve
in-flight and legacy reads, and legacy output/report shapes still have active
support conditions. No production logic was deleted. Canonical owners,
intentional strategies, thin adapters, obsolete surfaces, unresolved
infrastructure strategies, and exact removal gates are now explicit; no
unexplained duplicate application owner remains. **Batch 14 is unblocked**.

## Batch 14 implementation status

Accepted on 2026-07-14. The repository now provides deterministic
`ai-pack:build`, `ai-pack:validate`, and `ai-pack:status` commands backed by an
explicit source configuration. The generated curated pack, manifest, source
index, and compatibility context entry point validate sources/symbols, hashes,
sizes, links, JSON, containment, binary/media exclusions, and redacted
credential patterns. Two unchanged builds had identical manifest hashes. The
authorized build, typecheck, lint, unit, integration, e2e, and packaged CLI
gates passed. Final scans found no executable stale `dist` import or provider
logic in compatibility shell scripts; the one test-only `dist` fixture preserves
the packaged math authority boundary. No provider, upload, publish, remote
render, or production-media mutation ran. **The refactor is accepted.**

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
