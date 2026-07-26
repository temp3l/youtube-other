# True Hybrid Math Rendering Implementation Tasks

## Goal

Render the independent scenes of one mathematics video on the local machine and
a trusted Linux VPS at the same time. Keep workflow state, provider credentials,
canonical evidence, final scene assembly, audio muxing, media QA, and artifact
promotion on the operator machine.

The implementation uses the same immutable math-specific Docker worker image on
local and remote scene lanes over the existing SSH/`rsync` connection model. It
does not send math jobs to
`scripts/remote-render-worker.mjs`: that worker accepts FFmpeg clip arguments,
whereas the active math path also performs semantic SVG preparation, Sharp
rasterization, per-scene encoding, audio treatment, and final media QA.

## Locked Decisions

- CPU-only Linux and `libx264`; no GPU or hardware-encoder work.
- Docker image delivery by SSH archive load; no registry and no persistent
  network service.
- True hybrid execution shards one lesson's scene-video work across local and
  VPS workers concurrently. It does not render the complete video twice.
- Hybrid local and remote scene lanes must use the same immutable Docker image
  ID so their silent H.264 fragments have one toolchain identity.
- The local process owns the workflow, manifests, quality gates, and final
  ordered concat, narration mux, media QA, and final output.
- Remote inputs are limited to validated scene SVGs, scene timing/cues, hashes,
  encoding identity, and a strict shard manifest. Narration audio never leaves
  the local machine.
- SSH host-key verification remains enabled.
- Remote execution is selected by math configuration, with a CLI override.
  Unconfigured installations remain local.
- A transient remote scene failure receives bounded retries and is then
  requeued on a local scene lane. Already completed scenes are not rerendered.
  Identity, containment, image-integrity, and checksum failures fail closed.
- Private assets may be stored temporarily with `0700` permissions and are
  removed by guarded retention cleanup.
- Routine activation requires a representative warm hybrid render to be at
  least 20% faster than the current local end-to-end path.

## Performance Model

For shardable scene work `W`, measured local throughput `L`, measured remote
throughput `R`, and serial/transfer/tail overhead `H`, estimate:

`hybrid time ≈ H + W / (L + R)`

Two equally fast machines have a theoretical ceiling near `2x`; final assembly,
QA, transfers, cache misses, and uneven scene tails make that unattainable in
practice. The planning target for similar machines is `1.5–1.8x` faster
(`33–44%` less time). A VPS twice as fast as local may reach roughly `1.8–2.4x`;
a VPS half as fast may yield only `1.15–1.35x`. These are sizing estimates, not
acceptance claims; Task 07 measures the actual target hosts.

## Task Order

Execute every task separately and preserve focused verification budgets.

| Task                                                            | Outcome                                                                | Depends on  |
| --------------------------------------------------------------- | ---------------------------------------------------------------------- | ----------- |
| [01](tasks/task-01-portable-render-contract-and-executor.md)    | Portable scene-shard and final-assembly contracts                      | none        |
| [02](tasks/task-02-bounded-scene-concurrency-and-cache.md)      | Bounded scene lanes, cost model, and reusable cache separation         | Task 01     |
| [03](tasks/task-03-docker-math-render-worker.md)                | Immutable local/remote scene-fragment worker                           | Tasks 01–02 |
| [04](tasks/task-04-ssh-transport-deployment-and-operations.md)  | Secure shard transfer, image loading, preflight, status, logs, cleanup | Task 03     |
| [05](tasks/task-05-math-workflow-remote-integration.md)         | True hybrid scheduling, local assembly, provenance, and shard fallback | Task 04     |
| [06](tasks/task-06-batch-render-overlap-and-resume.md)          | Global hybrid lanes across render-ready lessons                        | Task 05     |
| [07](tasks/task-07-benchmark-rollout-and-final-verification.md) | Local/remote/hybrid performance gate and final acceptance              | Tasks 01–06 |

Operator procedures live in
[Remote Math Renderer Operations](operations.md). Native-local remains the
default until a real authorized benchmark passes Task 07.

## Cross-Cutting Constraints

- Inspect current source and tests before editing; source is authoritative.
- Preserve the existing story remote-render commands and behavior.
- Do not expose API keys, OAuth credentials, environment dumps, absolute local
  paths, narration text, or SSH arguments in logs or remote metadata.
- Accept only relative, schema-validated job paths contained by an exact job
  root. Never accept worker-supplied local destination paths.
- Transfer only compressed silent scene fragments, not PNG sequences or
  narration audio.
- Validate every local and remote fragment before ordered local concat. Promote
  the final output only after local audio muxing and full media QA.
- Keep renderer and toolchain identity in fingerprints and cache namespaces.
- Require fragment compatibility and repeatability within the shared immutable
  worker image. Do not combine fragments from different image IDs.
- Do not run a real remote deployment, remote render, provider call, or
  publication action without explicit human authorization for that execution.
- Each implementation task that modifies files must create the report required
  by `AGENTS.md`. If a future task is moved under `docs/plans/`, it must also
  satisfy Plan Execution Reporting.

## Completion Criteria

- One canonical lesson distributes scene work across active local and VPS lanes,
  with measured overlap in their execution timelines.
- The local process assembles the canonical scene order, muxes narration once,
  validates the final media, and resumes without weakening existing gates.
- A failed transient remote shard retries and then moves to a local lane with
  explicit per-scene provenance.
- A malformed or transplanted result cannot be promoted or trigger fallback.
- Multiple render-ready lessons share global bounded local and remote lanes
  without CPU oversubscription while paid speech and cost accounting remain
  serial.
- Status, logs, cleanup, deployment identity, cache behavior, and transfer
  timings are operator-visible.
- The measured warm hybrid path is at least 20% faster than the current local
  path before `hybrid` becomes the configured operational default.
