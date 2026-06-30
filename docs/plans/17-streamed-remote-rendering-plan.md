# Task 17: Streamed Remote Rendering Plan

## 1. Scope And Non-Goals

Scope:

- Reduce remote render startup latency by allowing clips to start as soon as their own inputs are ready.
- Reduce tail latency by downloading clip outputs, logs, and metadata incrementally instead of only after full-batch completion.
- Improve remote render reliability while preserving the current SSH plus `rsync` operating model.
- Preserve current CLI commands and `RemoteRenderSettings` for this iteration.

Non-goals:

- Do not introduce a persistent remote daemon, message queue, HTTP API, or multi-host scheduler.
- Do not redesign render profiles, scene planning, image generation, or final render validation semantics.
- Do not change public CLI flags, `.env` naming, or operator-facing command structure.
- Do not remove local fallback behavior where `fallbackToLocal` is already supported.

## 2. Confirmed Repository Findings

- `packages/rendering/src/index.ts` owns `RemoteClipRenderer`, `HybridClipRenderScheduler`, SSH helpers, asset transfer, clip validation, and local fallback.
- `scripts/remote-render-worker.mjs` currently waits for input files to appear, renders clips, writes per-clip metadata, and writes `results.json` only after all worker tasks complete.
- The current implementation uploads shared assets through one background `rsync` process and only downloads `output/`, `logs/`, and `metadata/` after the remote worker exits.
- Remote inputs are already content-addressed by asset hash and clip requests already record per-clip input paths, output path, metadata path, and log path.
- Remote job inspection commands already read remote `metadata/` and `logs/`, so richer per-clip lifecycle metadata can be consumed without a new operator surface.

## 3. Target Architecture

- Keep one remote workspace per render run under `<baseDir>/jobs/<run-id>`.
- Split orchestration into three concurrent phases:
  - bootstrap: create workspace and upload job manifest plus worker code
  - readiness/upload: upload assets and publish per-clip ready markers only after each clip’s dependencies are present
  - sync-back: continuously download finished clip outputs, logs, and metadata while the worker continues rendering
- Move clip scheduling from “poll for raw input file existence” to “claim clips whose ready marker exists”.
- Treat per-clip metadata as the source of truth for lifecycle and reconciliation, with `results.json` kept only as an end-of-run summary.

## 4. File-By-File Change Plan

- `packages/rendering/src/index.ts`:
  - extend the remote manifest to include clip dependency hashes or resolved asset references needed to determine readiness
  - replace the single bulk background upload assumption with ordered asset transfer and per-clip ready marker writes
  - add an incremental sync loop that pulls remote `output/<clip>.mp4`, `logs/<clip>.log`, and `metadata/<clip>.json` during worker execution
  - validate and finalize remote clips locally as soon as each clip artifact is available
  - keep end-of-run reconciliation for any clips not finalized by the incremental loop
  - preserve per-clip fallback to local rendering when remote status is failed or remote validation does not pass
- `scripts/remote-render-worker.mjs`:
  - replace `waitForInputs()` polling with ready-marker based claim logic
  - write per-clip lifecycle metadata such as `queued`, `rendering`, `succeeded`, and `failed`
  - avoid claiming clips whose ready marker is missing or malformed
  - continue writing per-clip logs and keep `results.json` as final summary output
- Remote workspace contract:
  - add `ready/<clip-id>.json` markers
  - keep existing `metadata/`, `logs/`, and `output/` directories
  - keep asset storage content-addressed under the current remote asset root

## 5. Reliability And Failure Handling

- If asset upload fails before a clip is marked ready, that clip must remain unclaimed remotely and be eligible for local fallback or run failure handling.
- If a remote clip fails after being claimed, preserve its log and metadata immediately so local orchestration can decide per-clip fallback without waiting for other clips.
- If the remote worker exits nonzero, trust already-synced per-clip metadata first; only fail the batch outright when unresolved clips remain with no completed metadata and no valid fallback path.
- If incremental download misses a completed clip during execution, the end-of-run reconciliation must still fetch and finalize it.

## 6. Compatibility And Migration

- Preserve `render`, `render remote verify`, `render remote test`, `render remote status`, and `render remote logs`.
- Preserve `RemoteRenderSettings` fields and current `uploadMethod: "rsync"` behavior.
- Keep manifest changes additive where possible so remote status tooling can tolerate older and newer runs during rollout.
- Preserve `keepFiles` cleanup semantics after final reconciliation completes.

## 7. Tests And Verification Commands

- `pnpm test:unit -- packages/rendering/src/index.unit.test.ts`
- add focused tests for any worker-side helper extracted from `scripts/remote-render-worker.mjs`
- affected package typecheck only after focused tests pass:
  - `pnpm --filter @mediaforge/rendering typecheck`

## 8. Ordered Implementation Steps

1. Add characterization coverage for current remote batch assumptions and clip result reconciliation.
2. Extend the remote manifest and workspace contract with per-clip readiness metadata.
3. Replace worker-side raw input polling with ready-marker driven claim logic.
4. Change local orchestration to upload assets in readiness order and publish clip-ready markers after dependency upload.
5. Add incremental sync-back for per-clip outputs, logs, and metadata while the worker is still running.
6. Finalize remote clips locally as they arrive, preserving current validation and clip manifest writes.
7. Reconcile unresolved clips at the end of the run and preserve local fallback semantics.
8. Update remote status handling tests if richer lifecycle metadata changes summary behavior.

## 9. Risks

- Ready-marker and manifest state can drift if upload ordering or clip dependency mapping is wrong.
- Incremental sync can race with remote writes; local finalization must ignore incomplete partial files until metadata reports success.
- More orchestration loops increase control-flow complexity; per-clip state must be explicit to avoid duplicate finalization or duplicate fallback.

## 10. Acceptance Criteria

- A remote clip can start before all unrelated assets for the full batch are uploaded.
- Completed remote clips are downloaded and finalized before the full batch finishes.
- A failed remote clip does not block already-completed remote clips from being finalized locally.
- Existing CLI commands remain externally compatible.
- Remote runs remain fallback-safe and observable through per-clip metadata and logs.
