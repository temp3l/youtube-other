# Task 01: Portable Scene-Shard And Assembly Contracts

## Objective

Split the current all-in-one math renderer into validated scene-video work units
and one local final-assembly boundary. Both local and future remote workers must
consume the same scene-shard contract. This task must not perform SSH, Docker,
remote mutation, or behavior-changing performance work.

## Inspect First

- `apps/cli/src/math-workflow-runtime.ts`
- `packages/math-rendering/src/composition/remotion-runner.ts`
- `packages/math-rendering/src/provider-free-media.ts`
- `packages/math-rendering/src/quality/media-qa.ts`
- `packages/math-education/src/orchestration/canonical-task-adapters.ts`
- Directly affected math-rendering and workflow-runtime tests

## Implementation

1. Define strict, versioned schemas owned by `@mediaforge/math-rendering`:
   - `math-render-plan.v1` for the ordered nine-scene composition
   - `math-scene-shard-request.v1`
   - `math-scene-shard-result.v1`
   - `math-final-assembly-request.v1`
   - `math-render-result.v1`
   - portable scene work containing scene ID/order, frame range, relative SVG
     path, SVG hash, animation/cue data, optional caption, expected frame count,
     encoding identity, and renderer/toolchain identity
2. Reject absolute paths, traversal, duplicate or reordered scene IDs, missing
   hashes, unexpected fields, incompatible timing, overlapping/gapped frame
   ranges, and output paths outside the declared job root.
3. Introduce a `MathSceneShardExecutor` port that renders one or more assigned
   scenes into silent H.264 fragments. A shard result must bind every fragment
   to its request, scene, image/toolchain identity, hash, byte length, exact
   frame count, dimensions, frame rate, pixel format, codec profile, and time
   base.
4. Introduce a local `MathFinalAssembler` that accepts all nine validated
   fragments in canonical order, concatenates them locally, applies the existing
   narration treatment/reveal cue, muxes audio once, and runs final media QA.
   Narration audio must never be part of a scene-shard request.
5. Provide a compatibility executor that runs all scene shards and assembly
   locally, preserving the current `renderProviderFreeMathMedia` behavior.
6. Refactor `materializeCanonicalPrivateMedia` to accept the render-plan
   executor without changing its default local behavior or workflow seam.
7. Return structured per-scene and assembly timings and cache counters.
   Use the current authoritative version constants rather than copying stale
   renderer literals from CLI output.
8. Extend canonical private-media evidence additively with optional
   `renderExecution` provenance. Keep existing evidence valid when the field is
   absent and include the field in the content hash when present.
9. Include scene assignment, fragment hashes, and toolchain identity in render
   fingerprints where they can affect bytes. Preserve fact binding, visual
   validation, audio treatment, output paths, and publication blockers.

## Required Tests

- Valid nine-scene plan, shard request/result, and assembly round trip.
- Unknown fields, traversal, absolute paths, duplicate scenes, hash mismatch,
  timing gaps/overlap, fragment incompatibility, and wrong output identity fail
  closed.
- Assembly rejects missing, duplicate, reordered, mixed-image, audio-bearing, or
  wrong-frame-count fragments.
- Scene shards contain no narration path or audio content.
- Default materialization still uses the local executor.
- Injected executor receives the exact validated inputs and cannot choose the
  canonical destination.
- Old evidence parses unchanged; new provenance is hash-bound and strict.
- Existing local render fingerprints and media QA remain semantically valid.

## Focused Verification

1. `pnpm test:focused -- packages/math-rendering/src/math-rendering.unit.test.ts`
2. `pnpm test:focused -- apps/cli/src/math-workflow-runtime.unit.test.ts`
3. One affected-package typecheck after focused tests pass.

Do not run a production render, broad test/build, provider call, or fixture
regeneration.

## Acceptance

- Local production behavior is unchanged by default.
- The shard boundary contains every input required to reproduce and validate
  one silent scene fragment, with no arbitrary workspace scan or narration
  dependency.
- Final assembly remains local and is the only boundary that reads narration.
- Invalid portable requests/results are rejected before filesystem mutation.
- Local and remote lanes can be added without duplicating scene-render logic.

## Stop Conditions

Stop if the portable contract would need provider credentials, arbitrary
absolute paths, narration transfer, weakening of strict evidence, or separate
local and remote scene-render implementations.
