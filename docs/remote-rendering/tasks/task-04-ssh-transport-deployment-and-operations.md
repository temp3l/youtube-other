# Task 04: SSH Transport, Deployment, And Operations

## Objective

Add secure math-specific scene-shard transport, identical local/remote image
deployment verification, preflight, status, logs, and guarded cleanup using
`apps/cli` as the operator surface.

## Inspect First

- Task 03 implementation and report
- `apps/cli/src/render-remote-shell.ts`
- `apps/cli/src/render-remote-inspection.ts`
- Remote settings and SSH argument construction in `apps/cli/src/index.ts`
- `packages/rendering/src/index.ts` remote job behavior
- `docs/plans/code-review-follow-up/tasks/task-09-remote-rendering-hardening.md`

## Implementation

1. Reuse the existing `REMOTE_RENDER_HOST`, user, port, base directory, SSH key,
   known-hosts, timeout, retry, retention, and fallback semantics through a
   shared typed configuration parser. Preserve story defaults and behavior.
2. Add math-specific settings:
   - `MEDIAFORGE_MATH_RENDER_EXECUTOR=local|remote|hybrid`
   - `MEDIAFORGE_MATH_REMOTE_IMAGE_ID=sha256:...`
   - `MEDIAFORGE_MATH_LOCAL_SCENE_SLOTS=<positive integer>`
   - `MEDIAFORGE_MATH_REMOTE_SCENE_SLOTS=<positive integer>`
   - `MEDIAFORGE_MATH_REMOTE_JOB_CONCURRENCY=<positive integer>`
3. Add `math renderer remote` commands:
   - `deploy`
   - `check`
   - `status`
   - `logs`
   - `cleanup`
4. `deploy` must:
   - inspect the remote Docker architecture
   - build the matching worker image locally
   - save it to a temporary Docker archive
   - transfer it with partial-safe `rsync`
   - load it remotely and verify the exact image ID
   - delete the transferred archive
   - verify the same image ID exists in the local Docker engine
   - write a nonsecret ignored local deployment receipt bound to host,
     repository revision, scene-worker contract, and shared image ID
5. `check` must verify non-root SSH, strict host keys, Docker usability, loaded
   image identity on both Docker engines, base/job/cache permissions, available
   disk, CPU/RAM, and concurrent isolated local/remote shard smokes.
6. Create exact job IDs locally. Allow only validated base directories and job
   IDs; quote transport shell values safely. Do not use unresolved globs or
   broad recursive deletion.
7. Upload only content-addressed SVG shard inputs and strict timing/cue metadata
   before publishing an atomic ready marker. Never upload narration audio.
   Launch the container by immutable image ID and sync compressed scene
   fragments, logs, status, and results incrementally using partial files.
8. Validate each downloaded fragment's result hash and byte length before making
   it available to the hybrid scheduler. The workflow task performs the stronger
   local media validation in Task 05.
9. `cleanup` may remove only schema-recognized math job directories older than
   the configured retention. It must never delete the shared cache, base root,
   unknown entries, running jobs, or a path selected only by caller text.
10. Redact keys, SSH arguments, local absolute paths, environment values, and
   narration content from telemetry.

## Required Tests

- Config parsing and backward compatibility for story remote settings.
- SSH argument quoting, strict host keys, malicious host/user/base/job inputs,
  spaces, and traversal.
- Deploy receipt and image-ID mismatch behavior.
- Hybrid preflight fails if local and remote image IDs differ.
- Interrupted upload/download resume and incomplete-file rejection.
- Status/log parsing for queued, running, succeeded, failed, fallback, malformed,
  and missing jobs.
- Cleanup preserves base/cache/running/unknown paths and removes only an exact
  eligible job.
- Fake transport tests make no real network connection.

## Focused Verification

1. Focused CLI remote config/shell/inspection tests.
2. Focused deployment/transport adapter tests with fake process execution.
3. `pnpm --filter @mediaforge/cli typecheck`.

No real SSH, Docker load on the VPS, remote cleanup, or remote render is allowed
without explicit human authorization.

## Acceptance

- Operators can deploy and inspect one immutable worker image without a
  registry.
- Local and remote lanes prove the same image/toolchain identity before hybrid
  work begins.
- Remote jobs and cleanup are contained by exact validated paths.
- Interrupted transfer is resumable but incomplete data is never promoted.
- Scene transfer excludes narration audio and uncompressed PNG sequences.
- Existing story remote commands remain compatible.

## Stop Conditions

Stop if safe completion would require disabling host-key verification, accepting
mutable image tags, broad remote deletion, shell interpolation of unvalidated
paths, or exposing secrets in diagnostics.
