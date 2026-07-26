# Task 02: Bounded Scene Concurrency And Cache Separation

## Objective

Make scene work schedulable across bounded local and remote lanes while
retaining deterministic scene order, resumability, truthful cost estimates, and
validated cache behavior. This task implements the scheduler and local lane;
remote transport arrives later.

## Inspect First

- Task 01 implementation and report
- `packages/math-rendering/src/composition/remotion-runner.ts`
- `packages/math-rendering/src/composition/semantic-chalk.ts`
- `packages/math-rendering/src/profiles/profiles.ts`
- `packages/process-runner/src/index.ts`
- Current raster progress and cache tests

## Implementation

1. Separate temporary job paths from reusable cache paths:
   - keyframes, concat files, and partial outputs remain job-local
   - raster and per-scene video caches use an injected cache root
   - cache namespaces include renderer, Sharp, FFmpeg, encoding profile, and
     format identity as applicable
2. Add an internal CPU-slot scheduler:
   - derive the default budget from the container/host-visible CPU quota
   - never create an unbounded `Promise.all`
   - allocate explicit FFmpeg `-threads` per active scene encode
   - keep Sharp workers at `concurrency(1)`
   - avoid oversubscription when raster and encode phases overlap
3. Define worker capability/calibration records with immutable worker ID,
   image/toolchain ID, CPU slots, cache availability, measured raster samples
   per second, measured encode frames per second, startup latency, and transfer
   throughput when applicable.
4. Estimate scene cost from cache misses, semantic raster sample count, expected
   encoded frames, worker calibration, startup cost, and transfer cost. Do not
   use scene count or round-robin assignment as the cost model.
5. Add a deterministic earliest-finish scheduler:
   - sort unclaimed scenes by descending predicted cost
   - assign each scene to the compatible lane with the earliest predicted finish
   - allow a free lane to claim the next unstarted scene
   - never execute the same scene speculatively on both workers
   - preserve canonical order only at final assembly
6. Process independent scenes through the bounded local lane and return results
   keyed by scene identity, not completion order.
7. Keep atomic raster/video cache promotion. Validate dimensions, nonzero size,
   cache identity, and expected frame count before treating an entry as a hit.
8. Preserve the existing scene-bounded progress artifact, extending it with
   assigned worker, predicted/actual cost, active-worker, and cache metrics only
   when those values are truthful.
9. Add phase metrics for SVG generation, rasterization, scene encoding,
   validation, cache hits/misses, queue wait, and peak active work. Assembly
   metrics remain separate.
10. Make cancellation and failure stop new work, terminate owned subprocesses,
   retain valid completed cache entries, and remove partial outputs.

## Required Tests

- Slot accounting never exceeds its configured budget.
- Scene results remain ordered when workers complete out of order.
- Cost-weighted assignment balances unequal scenes better than round-robin in a
  deterministic fake-worker test.
- A faster or cache-warm lane receives proportionally more work without starving
  the other active lane.
- No scene is claimed twice.
- Cache entries cannot cross renderer/toolchain/encoding namespaces.
- Corrupt or truncated raster/video entries become misses.
- Cancellation preserves completed entries and removes partial files.
- Single-slot behavior remains compatible with the previous sequential path.
- Repeated execution under one unchanged toolchain produces stable fingerprints
  and equivalent media.

## Focused Verification

1. Focused concurrency/cache unit tests in `packages/math-rendering`.
2. The directly affected math media integration test with a short temporary
   fixture, not a 180–300 second production render.
3. `pnpm --filter @mediaforge/math-rendering typecheck`.

## Acceptance

- The configured CPU-slot budget is never exceeded.
- One render plan can keep multiple compatible scene lanes busy concurrently.
- Scheduling is based on predicted finish time and measured capability, not
  alternating scene IDs.
- Cache hits remain content- and toolchain-bound, validated, and resumable.
- Output scene order, fact semantics, duration, and media validation are
  unchanged.

## Stop Conditions

Stop if concurrency requires weakening deterministic ordering, disabling cache
validation, using unbounded subprocesses, duplicating scene work, or changing
the publishing codec.
