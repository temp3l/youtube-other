# Batch 0 Prompt: Educational Renderer Audit Blocker Repairs

```text
Continue from the current repository state. Read AGENTS.md,
docs/ai-context/context-pack.md,
docs/plans/linux-math-renderer/README.md,
packages/educational-renderer/README.md,
packages/educational-renderer/package.json,
packages/educational-renderer/src/application/renderer.ts,
packages/educational-renderer/src/cli.ts,
packages/educational-renderer/src/infrastructure/files.ts,
packages/educational-renderer/src/infrastructure/media.ts,
packages/educational-renderer/src/infrastructure/process.ts,
packages/educational-renderer/src/domain/cache-key.ts,
packages/educational-renderer/src/renderers/svg.ts,
all educational-renderer tests, and the latest independent educational-renderer
audit evidence. Inspect Git state and source before editing. Preserve unrelated
tracked and untracked work. Do not integrate the renderer with apps/cli or any
production pipeline, invoke providers, publish, or modify episode/generated
assets.

Implement the following tasks in order. Stop if a task cannot meet its acceptance
criteria without weakening containment, media correctness, or test assertions.

## Task 1: isolate the mergeable change set (ER-H003, ER-M011)

1. Identify the exact renderer-owned source, fixture, documentation, test, and
   lockfile-importer changes.
2. Separate unrelated apps/cli, config, math-education, math-rendering,
   youtube-upload, report, prompt, and temporary-file work from the renderer
   change set without discarding user work.
3. Remove generated renderer videos, caches, benchmark outputs, archives, dist,
   and build-info from the mergeable renderer change set. Add narrowly scoped
   ignore rules where required; do not delete user-owned verification evidence
   without explicit approval.
4. Prove the renderer requires no external runtime registration beyond workspace
   discovery and its pnpm-lock importer.

Acceptance: the renderer can be reviewed/reverted independently; no production
command, dependency, environment loader, renderer, or pipeline changes with it.

## Task 2: close writable-path symlink escapes (ER-C001)

Treat this as the critical merge blocker.

1. Audit every writable target used for scene materialization, hard-link/copy,
   final composition, manifests, results, cache promotion/recovery/cleaning,
   temporary SVG/video files, benchmark output, and cleanup.
2. Replace the unsafe linkOrCopy behavior with a contained operation that checks
   every existing path component immediately before mutation and refuses symlink
   parents or targets. Stage replacement files in the destination directory and
   promote atomically on the same filesystem.
3. Do not remove a target until containment is proven. Convert boundary failures
   to FILESYSTEM_BOUNDARY_VIOLATION without exposing or changing the outside file.
4. Account for cache-hit and cache-miss paths, pre-existing output trees, path
   collisions, spaces/special characters, and rename/copy fallback behavior.
5. Document residual race assumptions. Prefer directory-handle/openat-style
   operations if lexical/repeated realpath checks cannot close the race.

Required tests:

- symlink at output root, renderer, scenes, scene ID directory, final directory,
  temporary directory, cache prefix, cache entry, promotion transaction, and
  individual target;
- outside sentinel preserved for cache hits and misses;
- malicious IDs, absolute paths, ../ traversal, dangling symlinks, in-root
  symlinks, and concurrent path replacement;
- successful hard-link or copy fallback for safe paths.

Acceptance: no renderer operation can create, replace, truncate, link, rename, or
delete a file outside its configured writable root. The independent exploit from
the audit must fail closed and leave its sentinel byte-identical.

## Task 3: make CLI failure and overwrite semantics reliable (ER-H002, ER-M010)

1. Return the documented nonzero invalid-input exit code whenever validate
   returns valid=false, including INVALID_FORMULA.
2. Convert Zod/profile/plan failures into stable renderer error codes instead of
   INTERNAL_ERROR.
3. Verify every command family's success, validation, adapter failure,
   composition failure, cancellation, and unknown-option exit code.
4. Keep JSON stdout to exactly one structured result when a command has one;
   keep Commander/setup diagnostics on stderr. Make verbose stack behavior
   consistent for global and subcommand failures.
5. Define an explicit output policy: refuse existing final outputs by default or
   require a documented --overwrite flag. Never allow overwrite policy to bypass
   Task 2 containment.

Acceptance: invalid formula validation exits nonzero; invalid profiles are typed;
all documented exit codes and stdout/stderr contracts match spawned CLI tests.

## Task 4: repair packed-package acceptance (ER-M001)

1. Reproduce the pnpm-packed installed-manifest behavior in a fresh consumer.
2. Remove or replace the assertion that requires packageManager metadata after
   pnpm strips it. Test only metadata pnpm actually preserves and runtime policy
   the package genuinely enforces.
3. Retain strict consumer type compilation, package-name imports, subpath exports,
   executable linked bin, offline preview render, and FFprobe video/audio/subtitle
   checks.

Acceptance: the normal package acceptance command exits 0 from a clean build and
does not use source-relative or workspace-resolution bypasses.

## Task 5: harden the dependency boundary (ER-M002)

1. Replace string-only TypeScript scanning with an enforceable dependency check
   covering TypeScript, JavaScript, package manifests, static/dynamic imports,
   relative imports escaping the package, workspace dependencies, CLI/plugin
   registries, and both dependency directions.
2. Add a disposable mutation test proving a forbidden renderer-to-Mediaforge
   import and a forbidden existing-app-to-renderer import both fail.
3. Keep package-internal test imports possible without exposing internal package
   subpaths publicly.

Acceptance: the boundary test detects both deliberate violations and passes with
no mutation left in the working tree.

## Task 6: sanitize public unknown failures (ER-M012, ER-L002)

1. Return a generic INTERNAL_ERROR message for unknown exceptions at public API
   and CLI boundaries. Preserve detailed causes only in opt-in verbose diagnostics.
2. Decide whether toRendererErrorData is a stable public API. Document and test it
   if public; otherwise remove it from the exported errors subpath without
   leaking an alternative internal helper.

Acceptance: default JSON/human results contain no internal paths, tool arguments,
stack traces, environment data, or raw unknown exception messages.

## Task 7: hand off remaining ordered repairs

After Tasks 1-6 are green, execute the existing plans in this order:

1. docs/plans/linux-math-renderer/01-release-acceptance.md
2. docs/plans/linux-math-renderer/02-visual-correctness.md
   - ER-H001 real mathematical typography;
   - ER-M007 bounded graph ranges/layout;
   - transition semantics and documentation.
3. docs/plans/linux-math-renderer/03-operational-completeness.md
   - ER-M003 capability self-tests;
   - ER-M004 cache/toolchain identity and truthful cache metrics;
   - ER-M005 global concurrency/cache resource controls;
   - ER-M006 complete audio/subtitle FFprobe verification;
   - ER-M008 documentation reconciliation;
   - ER-L001 truthful benchmark measurements.

Do not mark this Batch 0 complete merely because the later batches contain the
remaining work. Batch 0 is complete only when Tasks 1-6 pass and their reports
state that Tasks 7's dependent batches remain pending.

## Focused verification

Stay within AGENTS.md limits. Use at most three distinct test commands:

1. Writable-path/cache filesystem security tests, including the reproduced audit
   exploit.
2. CLI, public-error, package-boundary, and package-acceptance tests together.
3. Build first, then packed-consumer and real renderer integration tests together.

After focused tests pass, run one package typecheck, package lint, frozen-lockfile
check, and git diff --check. Render a fresh preview in an isolated temporary
directory and independently FFprobe video, audio, and subtitles. Run the smallest
existing CLI startup check needed to classify current behavior; do not repair
unrelated Mediaforge failures in this batch.

Because this prompt is under docs/plans/, create/update:
docs/reports/<YYYY-MM-DD>/00-audit-blocker-repairs-implementation-report.md

The report must include the source plan path, tasks completed/partial/not
completed, deviations, exact checks and exits, exploit regression evidence,
changed files, remaining risks, and next steps. An independent follow-up security
audit is required before proceeding to final acceptance.

Final response must be under 200 words and list summary, changed paths, checks,
current commit hash, and unresolved risks. Do not commit.
```
