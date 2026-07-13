# Batch 1 Prompt: Educational Renderer Release Acceptance

```text
Continue from the current repository state. Read AGENTS.md,
docs/ai-context/context-pack.md,
docs/plans/linux-math-renderer/README.md,
todo-prompts/linux-math-video-rendering/planning.md,
packages/educational-renderer/package.json,
packages/educational-renderer/tsconfig.json,
packages/educational-renderer/README.md,
packages/educational-renderer/docs/adr/001-package-isolation.md,
packages/educational-renderer/docs/adr/006-cache.md,
packages/educational-renderer/src/index.ts,
packages/educational-renderer/src/cli.ts,
packages/educational-renderer/src/application/renderer.ts,
packages/educational-renderer/src/domain/cache.ts,
packages/educational-renderer/src/infrastructure/files.ts,
packages/educational-renderer/src/infrastructure/process.ts,
every test under packages/educational-renderer/tests/,
pnpm-workspace.yaml, the educational-renderer importer in pnpm-lock.yaml,
and the newest educational-renderer report under docs/reports/codex-runs/.

Inspect Git state, existing CI conventions, package scripts, Vitest configuration,
and the built output layout before editing. Git and source are authoritative.
Preserve every unrelated tracked and untracked change, especially
.tmp/mock-openai-server.mjs, todo-prompts/math-followups/, R-001 through R-009
math work, and existing educational-renderer stabilization. Do not clean, reset,
rewrite history, commit, regenerate episode assets, modify committed
packages/educational-renderer/.artifacts, or integrate with apps/cli or a
production pipeline.

Implement one bounded release-acceptance batch for
@mediaforge/educational-renderer. Do not add visual features, animation,
hardware encoding, benchmark expansion, Mediaforge adapters, publishing,
providers, or unrelated refactors.

## Gate 1: packed clean-install contract

Treat this as the first release blocker.

1. Build the package from a clean package output state without deleting or
   changing committed artifacts.
2. Produce the package archive through the normal pnpm pack workflow into an OS
   temporary directory. Do not commit archives.
3. Install the archive into a fresh temporary consumer project using the
   repository lock/store strategy. Do not use source-relative aliases, Vitest
   aliases, workspace self-reference, or direct package bin paths as a bypass.
4. From the consumer, prove:
   - import by @mediaforge/educational-renderer;
   - import of ./contracts and ./errors;
   - runtime root exports contain only createEducationalRenderer;
   - declarations resolve for a strict TypeScript consumer;
   - the package-manager-linked educational-renderer bin is executable;
   - educational-renderer --help exits 0 with no stderr;
   - one preview render succeeds offline after installation.
5. Ensure main, types, exports, files, source maps, declaration maps if used,
   shebang, and executable mode match the archive contents.
6. Add truthful package metadata: Node engine and supported package-manager
   assumptions. Keep the package private/internal unless the repository already
   has an approved publishing policy. Do not publish.
7. Confirm pnpm install --frozen-lockfile recognizes the importer. Modify
   pnpm-lock.yaml only through pnpm and only if package metadata/dependencies
   require it. Do not upgrade unrelated dependencies.

Add a package acceptance test or script that exercises the archive. It must use
fresh temporary directories and clean them safely. If an offline installation
cannot be made deterministic with the current pnpm store, report the exact
blocker rather than silently using the source tree.

Do not proceed until the packed-consumer test passes.

## Gate 2: deterministic CLI failure acceptance

1. Keep the standalone CLI on the same public API implementation. Do not create
   separate render, validation, cache, or composition logic.
2. Refactor CLI construction only if necessary to allow package-internal adapter
   injection. Keep injection APIs unavailable from the public root and package
   exports.
3. Add spawned CLI coverage for every command family, required and invalid
   arguments, exact exit codes, JSON parsing, and stdout/stderr separation.
4. Add deterministic spawned CLI ENOSPC coverage without filling a real disk.
   Prefer a spawned package-internal test harness using the real CLI command
   builder with injected statfs/filesystem/process adapters. Do not add a
   production environment variable or public option solely for tests.
5. In JSON mode, assert exactly one JSON document on stdout for structured
   failed/incomplete results. Commander/setup/thrown errors belong on stderr.
   Never mix human text into JSON stdout.
6. Cover ENOSPC during preflight, cache promotion, final composition, and result
   persistence. Assert INSUFFICIENT_DISK_SPACE and prove already promoted scenes
   remain resumable.
7. Keep SIGINT/SIGTERM job assertions race-safe. Use a controlled long-running
   fake executable for exact subprocess termination behavior, plus at least one
   real FFmpeg CLI render. Do not depend on a signal arriving during a specific
   frame.

## Gate 3: real process-death cache recovery

1. Retain deterministic promotion-step fault tests.
2. Add a child-process worker that promotes a cache entry with package-internal
   synchronization hooks, reports the exact reached promotion step to its parent,
   and pauses without modifying paths outside its temporary cache root.
3. Kill the worker at each externally observable promotion boundary. Reopen the
   cache in a new process and prove it exposes either the prior validated pair or
   a deterministic miss/corrupt first entry, never a false hit.
4. Prove recovery itself is idempotent across a second interruption.
5. Prove live locks and transaction directories cannot be removed by inspect or
   clean, while validated dead stale locks are reclaimable.
6. Preserve strict containment and outside sentinels throughout.

Do not weaken semantic fault-injection tests or use sleeps as the synchronization
contract.

## Gate 4: isolated CI

Inspect existing workflow conventions first. Add one isolated educational-
renderer job only if repository policy permits CI changes. The job must:

- use the repository-supported Node and pnpm versions;
- install FFmpeg/FFprobe and the configured open font explicitly;
- use pnpm install --frozen-lockfile;
- run the package build, focused unit/architecture suite, packed-consumer smoke,
  real integration suite, typecheck, and lint;
- avoid providers, uploads, episode generation, broad monorepo builds/tests,
  benchmarks, hardware assumptions, and committed artifact writes;
- retain concise diagnostic output on failure.

If CI changes are not permitted or cannot be validated locally, add a documented
CI command contract inside the package and report the external follow-up. Do not
claim CI exists when it does not.

## Documentation and verification

Update package README and relevant ADRs only where behavior or commands changed.
Document archive installation, supported runtime, bin invocation, JSON/error
semantics, process-death recovery, and CI status exactly.

Follow AGENTS.md verification limits. Use at most three distinct test commands:

1. Cache process-death/recovery test file alone.
2. Directly affected unit/architecture/CLI files together.
3. Build first, then packed-consumer smoke and real renderer integration together.

After focused tests pass, run exactly one package typecheck, package lint, frozen
lockfile verification, and git diff --check. Perform one installed-package preview
render under a fresh OS temporary directory and FFprobe the final video, audio,
subtitles, and representative segments. Do not run repository-wide tests/builds,
snapshot updates, fixture regeneration, providers, publishing, benchmarks, or
unrelated checks.

Because this prompt is under docs/plans/, create/update:
docs/reports/<YYYY-MM-DD>/01-release-acceptance-implementation-report.md

The report must follow AGENTS.md Plan Execution Reporting and accurately list
the source plan path, completed/partial/not-completed tasks, deviations, exact
checks and results, risks, and next steps. Also create the normal Codex run report
only if AGENTS.md still independently requires it; do not duplicate content when
repository policy permits one report to satisfy both requirements.

Stop under the AGENTS.md convergence rules rather than weakening assertions.
Final response must be under 200 words and list summary, changed paths, exact
checks with exit statuses, current commit hash, and unresolved risks. Do not commit.
```

