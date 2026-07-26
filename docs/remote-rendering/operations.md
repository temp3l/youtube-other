# Remote Math Renderer Operations

Native-local is the safe default. Do not enable remote resource use until the
operator has authorized image transfer/load, smoke rendering, and benchmark
capacity. Commands emit immutable image IDs and job IDs, not hosts, secrets,
absolute paths, or narration.

## Configure And Check

Set the `REMOTE_RENDER_*` transport values in the untracked environment, keep
strict host-key verification enabled, and set a known-hosts file. Leave
`MEDIAFORGE_MATH_RENDER_EXECUTOR=local`. Configure explicit local/remote scene
slots and remote job concurrency within measured capacity.

Deploy and preflight only after authorization:

```sh
pnpm mediaforge -- math renderer remote deploy
pnpm mediaforge -- math renderer remote check
```

Both lanes must report the same immutable `sha256:` image ID. A mismatch,
missing strict host key, failed local Docker smoke, or failed remote preflight
blocks remote and hybrid use.

## Enable And Override

For one production run, prefer the explicit override:

```sh
pnpm mediaforge -- math production run ... --render-executor hybrid
```

The CLI option overrides `MEDIAFORGE_MATH_RENDER_EXECUTOR`. Set the environment
to `hybrid` only after an authorized benchmark passes. Do not update `.env`
automatically from a benchmark recommendation.

## Benchmark

A completed render-ready lesson supplies
`locales/de/render/benchmark-input.json`. After separate resource
authorization:

```sh
pnpm mediaforge -- math renderer benchmark \
  --lesson <lesson-id> \
  --workspace <private-workspace> \
  --authorize-resource-use
```

The command uses isolated temporary media roots and runs native-local,
local-container, remote-container, and hybrid cold/warm cases. It makes no
provider calls and does not replace canonical output. Accept hybrid only when
the artifact proves local/remote execution overlap and reports
`hybridWarmClientWallMs / nativeLocalWarmClientWallMs <= 0.80`. Treat
unavailable metrics, missing overlap, or a slower result as blocking.

## Status And Logs

```sh
pnpm mediaforge -- math renderer remote status
pnpm mediaforge -- math renderer remote status --job <math-job-id>
pnpm mediaforge -- math renderer remote logs <math-job-id>
```

Status and logs accept only schema-recognized generated job IDs. Logs are
bounded structured records and exclude input narration.

## Cleanup

```sh
pnpm mediaforge -- math renderer remote cleanup
```

Cleanup removes only old, completed, schema-recognized jobs after the configured
retention window. It does not remove the shared cache or active work. Keep a
failed benchmark job until its bounded diagnostics have been collected.

## Fallback, Rollback, And Troubleshooting

Retryable remote scene failures are bounded and reassign only that scene to the
local container lane. Identity, schema, dependency-hash, and result-hash
failures fail closed. Resume reconciles validated fragments before scheduling.

Rollback is:

```sh
MEDIAFORGE_MATH_RENDER_EXECUTOR=local
```

No remote cache or job deletion is required to restore local production. For a
failure, check in order: strict host-key configuration, matching image ID,
local Docker smoke, remote preflight, configured slot/job limits, exact job
status, bounded logs, local fragment QA, then disk/memory capacity. Keep local
mode if any check remains inconclusive.
