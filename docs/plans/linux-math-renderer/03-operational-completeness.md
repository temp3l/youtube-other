# Batch 3 Prompt: Educational Renderer Operational Completeness

```text
Continue from the current repository state after Batches 1 and 2 are green. Read
AGENTS.md,
docs/ai-context/context-pack.md,
docs/plans/linux-math-renderer/README.md,
docs/plans/linux-math-renderer/01-release-acceptance.md,
docs/plans/linux-math-renderer/02-visual-correctness.md,
both completed implementation reports,
todo-prompts/linux-math-video-rendering/planning.md,
packages/educational-renderer/README.md,
packages/educational-renderer/docs/adr/008-hardware-encoding.md,
packages/educational-renderer/docs/adr/009-optional-tools.md,
packages/educational-renderer/src/contracts.ts,
packages/educational-renderer/src/application/renderer.ts,
packages/educational-renderer/src/infrastructure/media.ts,
packages/educational-renderer/src/infrastructure/process.ts,
packages/educational-renderer/src/cli.ts,
all benchmark/capability tests and fixtures,
package.json, and the isolated CI workflow or command contract from Batch 1.

Inspect Git state, current capabilities, benchmark behavior, and available host
hardware before editing. Preserve unrelated work and accepted earlier batches.
Do not clean, reset, rewrite history, commit, modify committed artifacts, invoke
providers, publish, integrate with apps/cli, or add production pipeline adapters.

Implement one bounded operational-completeness batch. This batch makes existing
capability and benchmark claims truthful; it does not add new scene types,
animation, distributed rendering, remote services, or Mediaforge integration.

## Gate 1: capability self-tests

1. Separate detection from verified usability for FFmpeg, FFprobe, SVG input,
   fonts, software encoding, VA-API, QSV, Graphviz, and Blender.
2. Keep Graphviz and Blender inspection-only. Rendering must not invoke either.
3. Add a deterministic software encoder self-test using a tiny temporary input,
   short encode, and FFprobe verification.
4. For VA-API/QSV, require all of:
   - encoder listing;
   - accessible render device;
   - short real encode on that device;
   - FFprobe verification of codec, dimensions, pixel format, and duration.
5. Do not mark hardware available from an encoder listing alone. Use existing
   statuses consistently: unavailable, untested, available, or failed-self-test.
6. Self-test failures must be typed, JSON-serializable, bounded by timeout, and
   must not prevent libx264 use.
7. Hardware encoders remain opt-in. Never change the default from libx264.
8. On a host without hardware, add adapter-driven unit coverage and report real
   hardware as not measured. Do not fake a successful real hardware test.

Do not proceed until capability JSON and documentation agree exactly.

## Gate 2: truthful measurements

1. Audit every BenchmarkResult field against actual collection.
2. Measure peak renderer subprocess RSS on Linux using a documented mechanism
   that accounts for active FFmpeg children. If reliable collection cannot be
   implemented portably, make the field explicitly unavailable/optional and do
   not emit a fabricated zero.
3. Measure temporary bytes from renderer-owned temporary, transaction, and
   composition paths. Distinguish cumulative bytes written from peak temporary
   disk occupancy; name and document the chosen metric accurately.
4. Preserve cache hit/miss counts, scene order, durations, output bytes, and
   validation/composition timings with finite nonnegative values.
5. Run benchmarks only in fresh OS temporary directories. Never write benchmark
   output into committed .artifacts.
6. Benchmark continues past unavailable optional encoders and records a skipped
   result with the exact capability reason.
7. Add deterministic adapter tests for measurement parsing, child cleanup,
   timeout, cancellation, and unavailable host facilities.
8. Do not optimize based on one machine. This gate is measurement correctness,
   not performance tuning.

## Gate 3: reproducibility and soak acceptance

1. Render the canonical fixture cold and warm on the same host/toolchain/font.
   Verify semantic media equivalence, scene keys, cache outcomes, manifest order,
   and final FFprobe properties.
2. Do not promise byte identity across CPUs/FFmpeg builds. Within one unchanged
   host, investigate byte differences before deciding whether byte reproducibility
   is a supported guarantee.
3. Run a bounded repeated-render soak in a temporary directory. Verify no live
   subprocesses, locks, promotion transactions, or temporary files remain after
   success, failure, timeout, and cancellation.
4. Test cache clean/inspect after the soak and preserve output hard links.
5. Test a cold 1080p landscape render and a portrait render. Record elapsed time,
   output size, cache behavior, peak/cumulative temporary metric, and RSS only if
   actually measured.
6. Do not establish performance thresholds without an explicit supported machine
   class and measured evidence. Report observations separately from acceptance.

## Gate 4: final package acceptance

1. Re-run the packed clean-consumer installation from Batch 1.
2. Re-run the isolated CI command contract locally where possible.
3. Confirm public runtime exports remain only createEducationalRenderer and that
   internal adapters/self-test hooks are not exported.
4. Confirm the package remains absent from apps/cli and production pipelines.
5. Reconcile README and ADRs with source. Remove stale future/current claims.
6. Create a concise release checklist covering prerequisites, installation,
   capability inspection, preview render, cache inspection/cleaning, interruption
   recovery, troubleshooting, and rollback/removal.
7. Keep the package private/internal unless publishing is separately authorized.
   Do not publish or create a production integration adapter.

## Verification and reporting

Use at most three distinct test commands:

1. Capability/self-test unit file alone.
2. Benchmark/measurement/process/architecture files together.
3. Build first, then packed-consumer, real renderer, and bounded soak integration
   files together.

After focused tests pass, run one package typecheck, package lint, frozen-lockfile
check, and git diff --check. Run the authorized benchmark only under a fresh OS
temporary directory. FFprobe all final outputs and representative segments.
Record hardware as unavailable/not measured when the host lacks the required
device. Do not run repository-wide checks, providers, publishing, snapshot
updates, episode generation, or unrelated package verification.

Because this prompt is under docs/plans/, create/update:
docs/reports/<YYYY-MM-DD>/03-operational-completeness-implementation-report.md

The report must satisfy AGENTS.md Plan Execution Reporting and include measured
versus unmeasured fields, real versus adapter-only hardware evidence, soak results,
deviations, exact commands/results, risks, and recommended next steps. Create the
normal Codex run report only if AGENTS.md still independently requires it.

Stop under convergence rules rather than weakening assertions or inventing
measurements. Final response must be under 200 words and list summary, changed
paths, exact checks with exit statuses, current commit hash, and unresolved risks.
Do not commit.
```

