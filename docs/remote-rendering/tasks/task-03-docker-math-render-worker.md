# Task 03: Docker Math Render Worker

## Objective

Package the scene-shard executor as an immutable, non-root, CPU-only Docker
worker used identically by local and VPS scene lanes. It processes assigned
scenes into silent compressed fragments and exits. Do not add a daemon, HTTP
API, registry dependency, provider access, audio handling, or publication
capability.

## Inspect First

- Tasks 01–02 implementations and reports
- Workspace package build conventions and lockfile importers
- `packages/math-rendering/package.json`
- `apps/cli/package.json`
- `scripts/remote-render-worker.mjs` only for lessons about result/log layout;
  do not reuse its unvalidated FFmpeg job contract

## Implementation

1. Add a multi-stage worker Dockerfile using the repository Node and pnpm
   versions. Install FFmpeg/FFprobe and only runtime libraries required by
   Sharp and the built math packages.
2. Copy/build the minimum workspace dependency closure needed by the worker.
   Do not include `.env`, Git metadata, episode trees, reports, generated media,
   provider configs, or OAuth files in the build context.
3. Add a scene-worker entrypoint that accepts exactly:
   - one mounted job root
   - one mounted cache root
   - one request manifest path contained by the job root
4. Run as a fixed non-root UID/GID with a read-only root filesystem. The launch
   contract must use `--network none`, drop capabilities, disable privilege
   escalation, cap PIDs, and mount only the job and cache roots.
5. Validate the shard request before rendering. Write one silent H.264 fragment
   and result per assigned scene through temporary files plus atomic rename.
   Do not concatenate the full lesson, accept narration, mux audio, or run final
   full-media QA in the worker.
6. Record image/build revision, Node, Sharp, FFmpeg, renderer, encoder, CPU
   quota, and cache namespace identity. Never record environment dumps or input
   narration text.
7. Return stable exit classes for invalid job, containment/integrity failure,
   insufficient resources, transient process failure, cancellation, and
   successful completion.
8. Add a tiny two-scene offline smoke fixture under test ownership. Run one
   scene through a local container invocation and the other through a second
   invocation, then validate both as compatible silent fragments. Do not commit
   rendered video output.

## Required Tests

- Image builds for the detected target platform.
- Worker runs without root, network, writable root filesystem, or extra mounts.
- Invalid and escaping manifests fail before output mutation.
- Worker result and logs are schema-valid and bounded.
- SIGTERM cancels owned work and leaves no promoted partial output.
- The smoke jobs return compatible silent H.264/yuv420p fragments with exact
  frame counts and no audio streams.
- No secret/config/episode paths enter the image or result.

## Focused Verification

1. Worker contract and entrypoint unit tests.
2. Build the worker image and run the tiny offline container smoke.
3. One affected-package typecheck.

Do not push an image, contact the VPS, run providers, or publish.

## Acceptance

- The same image can process any subset of a portable math render plan with
  networking disabled and return strict per-scene results.
- The image is content-identifiable and contains no operator secrets.
- The container cannot write outside its two mounted roots.
- The worker has no narration, muxing, final-output, or publication capability.

## Stop Conditions

Stop if the image requires host source mounts, root execution, network access,
provider credentials, narration audio, or an unpinned mutable runtime
dependency.
