# Recommended next prompt: finish educational renderer failure hardening

```text
Continue from the current repository state. Read AGENTS.md,
docs/ai-context/context-pack.md,
todo-prompts/linux-math-video-rendering/planning.md,
packages/educational-renderer/README.md,
packages/educational-renderer/docs/adr/006-cache.md,
packages/educational-renderer/docs/adr/007-fonts.md,
packages/educational-renderer/src/domain/cache.ts,
packages/educational-renderer/src/infrastructure/files.ts,
packages/educational-renderer/src/infrastructure/process.ts,
packages/educational-renderer/src/application/renderer.ts,
packages/educational-renderer/tests/unit/cache-filesystem-security.test.ts,
packages/educational-renderer/tests/unit/public-api-validation.test.ts,
packages/educational-renderer/tests/integration/render.integration.test.ts,
and docs/reports/codex-runs/2026-07-13-educational-renderer-audit-repair.md.

Inspect Git state and current source/tests before editing. Git is authoritative.
Preserve every unrelated tracked and untracked change, especially
.tmp/mock-openai-server.mjs, todo-prompts/math-followups/, the R-001 through
R-009 math work, and the existing educational-renderer stabilization changes.
Do not clean, reset, rewrite history, commit, regenerate episode assets, modify
committed packages/educational-renderer/.artifacts, or integrate the renderer
with apps/cli or any production Mediaforge pipeline.

Implement one bounded educational-renderer failure-hardening batch. This batch
is safe because crash-safe cache promotion, lock ownership, disk preflight,
write-failure mapping, and their adversarial tests share one filesystem
correctness boundary. Do not expand into hardware encoding, performance work,
animation, Mediaforge integration, geometry feature development, or unrelated
refactoring.

## Gate 1: preserve the prior cache pair across interrupted promotion

Treat this as the release blocker. Do not proceed until its focused tests pass.

1. Redesign scene video+manifest promotion so the cache exposes only a matching,
   validated pair. A process death or injected failure at every filesystem step
   must produce either the prior valid pair or a deterministic miss/corrupt
   entry that can recover without deleting that prior pair.
2. Never report a false hit. Validate strict cache key, manifest key, video hash,
   byte count, renderer identity, and representation before a hit.
3. Use a same-filesystem staging/transaction layout with explicit recovery.
   Do not rely on two independent renames being jointly atomic. Do not use an
   uncontained manifest value to derive a recovery, deletion, or promotion path.
4. Recovery and cleanup may mutate only the exact renderer-owned entry/staging
   paths under cacheDirectory. Recheck realpath/symlink containment immediately
   before every rename, unlink, recursive removal, or replacement.
5. Preserve a prior valid entry when promotion fails synchronously or the
   process is simulated as dying between any two promotion steps. Remove stale
   transaction remnants only after ownership and containment validation.
6. Keep output hard links and already promoted scenes valid. A later scene
   failure and subsequent rerun must retain canonical plan order.

Add deterministic fault-injection tests for every promotion step. Tests must use
temporary directories and semantic assertions, not timing or snapshots. Prove:

- prior valid video and manifest remain usable after every injected failure;
- an initially empty entry becomes miss/corrupt, never hit, after interruption;
- corrupt current data can recover from a validated prior transaction state;
- malicious manifests and symlinked transaction directories cannot escape;
- inspect and clean preserve sentinels outside cacheDirectory;
- concurrent/live locks cannot be removed by promotion or cleanup;
- a dead stale lock can be reclaimed, but age alone never removes a live lock.

Use an injected filesystem/promotion adapter or narrowly scoped hooks rather
than killing the Vitest worker. Keep hooks package-internal and unavailable from
the public root exports.

## Gate 2: implement truthful disk-space and ENOSPC handling

1. Add preflight checks before scene rendering, cache promotion, final
   composition, benchmark workspace creation, and other material writes.
2. Base required space on a documented conservative estimate derived from the
   requested profile, duration/frame rate, expected staging duplication, and a
   fixed safety margin. Check the actual target filesystem with statfs; do not
   check one root and write to another filesystem.
3. If free space is known and insufficient, fail before FFmpeg with
   INSUFFICIENT_DISK_SPACE. If statfs is unavailable, continue but still map
   actual ENOSPC failures deterministically.
4. Map ENOSPC from mkdir, open/write, copy/link fallback, rename/promotion,
   manifest/result writes, FFmpeg stderr, and FFprobe/output handling to
   INSUFFICIENT_DISK_SPACE without collapsing it into INTERNAL_ERROR,
   FFMPEG_FAILED, or SCENE_RENDER_FAILED.
5. Preserve completed promoted scenes and write an incomplete resumable result
   only when the result path itself remains writable. Never mask the original
   disk-space error with a secondary reporting failure.
6. Keep public request/result version 1 unless a demonstrated incompatible
   correction requires a documented version change.

Add focused tests using injected statfs/filesystem/process failures. Do not fill
a real disk. Assert exact typed codes and JSON serialization for preflight and
write-time ENOSPC, including cache promotion, final composition, result writing,
and CLI JSON mode. Prove stdout remains one JSON document and operational text
remains on stderr.

## Gate 3: close the coupled containment and recovery coverage gaps

Add or strengthen temporary-directory tests for:

- scene, audio, subtitle, fixture, output, cache, and temporary symlink escapes;
- a process CWD different from workspaceDirectory, proving the resolved path
  checked is the same path passed to FFmpeg/FFprobe;
- one-scene failure followed by deterministic cache-backed resume;
- configured-font identity: changing the actual used font changes the scene key,
  while narration/audio/subtitle-only changes do not;
- cache inspection/cleaning during a live promotion transaction;
- exact cleanup targets, with outside sentinels preserved.

Do not reintroduce removed inert CLI options or public fields. The root runtime
export must remain only createEducationalRenderer. Do not export SceneCache,
filesystem adapters, fault hooks, process adapters, or implementation classes.

## Documentation and verification

After behavior is green, update only packages/educational-renderer/README.md and
ADR 006 if their claims need correction. Document the promotion transaction,
recovery rules, lock semantics, disk estimate, statfs-unavailable behavior,
ENOSPC result/CLI behavior, and remaining limitations. Do not claim hardware,
memory, performance, transition, or geometry verification not performed.

Do not create a Codex run report for this task. Do not modify pnpm-lock.yaml
unless a dependency actually changes; prefer no dependency changes.

Follow AGENTS.md verification limits. Inspect package scripts and Vitest config
first. Use at most three distinct test commands in this order:

1. Run the focused cache promotion/containment test file alone.
2. Run all directly affected unit/architecture files together.
3. Build, then run the package/CLI smoke and real renderer integration files
   together.

After focused tests pass, run:

- pnpm --filter @mediaforge/educational-renderer typecheck
- pnpm --filter @mediaforge/educational-renderer lint
- git diff --check on changed files

The batch authorizes the isolated package build and a real preview render under
a fresh OS temporary directory. It does not authorize repository-wide tests or
builds, snapshot updates, fixture regeneration, provider/network calls,
publishing, benchmarks, or unrelated package checks. Stop under the AGENTS.md
convergence rules rather than weakening assertions.

Final response must be under 200 words and list summary, changed paths, exact
tests/checks with exit statuses, current commit hash, and unresolved risks. Do
not commit.
```
