# Task 07: Benchmark Rollout And Final Verification

## Objective

Prove correctness, real local/VPS overlap, and a meaningful true-hybrid speed
improvement before configuring hybrid math rendering as the normal mode.

## Inspect First

- Tasks 01–06 implementations and reports
- Current scripts and Vitest configuration before selecting commands
- `docs/architecture/media-assets-and-delivery.md`
- `.env.example`
- Existing remote-render operator documentation
- Current target VPS deployment receipt and preflight output

## Implementation

1. Add `math renderer benchmark` with:
   - required lesson/workspace selection
   - isolated temporary output paths
   - no provider calls and no canonical output replacement
   - current native-local cold and warm baselines
   - all-local-container, all-remote-container, and true-hybrid cold/warm runs
   - end-to-end client wall time including transfer and local verification
   - per-scene worker assignment and predicted/actual duration
   - local/remote execution intervals proving overlap
   - render/assembly/QA timings, cache hits, transfer bytes, output size, CPU
     quotas, peak memory when truthfully available, and toolchain/image identity
2. Make benchmark output a strict versioned artifact. Distinguish unavailable
   measurements from zero and preserve raw durations needed to recalculate the
   result.
3. Report the acceptance ratio:
   `hybridWarmClientWallMs / nativeLocalWarmClientWallMs <= 0.80`.
   Also report `nativeLocalWarmClientWallMs / hybridWarmClientWallMs` as the
   observed speedup. A slower or inconclusive hybrid result blocks recommending
   hybrid as the configured default.
4. Compare the measured scheduler result with the ideal combined-throughput
   bound and explain startup, transfer, assembly, QA, cache, or tail imbalance
   that consumed the difference. Do not promise a fixed speedup.
5. Exercise scene-slot and batch-concurrency candidates only within explicit
   local/VPS capacity and authorization. Recommend values; do not rewrite `.env`
   automatically.
6. Update:
   - `.env.example`
   - the relevant media-delivery architecture section
   - a concise remote math renderer operations document covering deploy, check,
     enable, override, benchmark, status, logs, cleanup, fallback, rollback, and
     troubleshooting
7. Document rollback as setting the executor to `local`; do not require deleting
   remote cache or jobs to restore local production.
8. Ensure deployment/check/benchmark output contains no host address, secrets,
   local absolute paths, or narration content.

## Staged Verification

Before real execution, obtain explicit human authorization for Docker image
transfer, remote image load, smoke rendering, and benchmark resource use.

1. Run directly affected focused tests first, within the repository command
   budget.
2. Run one affected-package typecheck after focused tests pass.
3. Deploy the immutable image and run `check`.
4. Render one representative 3–5 minute lesson through native local,
   all-local-container, all-remote-container, and hybrid modes in isolated
   benchmark paths.
5. Repeat the warm hybrid run with the same image and inputs. Prove at least one
   local scene and one remote scene execute during an overlapping interval.
6. Validate all outputs locally with the canonical media QA and independently
   compare input/timing/scene identities.
7. Induce one transient remote-scene failure and prove only that scene is
   requeued locally without a provider call or full-video rerender.
8. Inspect status/logs and perform guarded cleanup on only the test job.

Do not run repository-wide tests/builds, the 37-lesson batch, provider calls,
YouTube upload, publication, snapshot updates, or fixture regeneration unless
separately authorized.

## Final Acceptance

- All focused tests and affected typechecks pass.
- Remote preflight passes with strict host keys and the expected image ID.
- Local and remote lanes use the same image ID.
- Native local, container local, remote, and hybrid outputs pass identical
  semantic and final media gates.
- Hybrid evidence proves distinct local/remote scene assignments with real
  execution overlap and exactly nine assembled scenes.
- Repeated runs within one image are reproducible under the supported guarantee.
- Transient remote-scene failure reassigns only that scene and records correct
  provenance.
- Integrity failures fail closed.
- Status, logs, resume, and exact cleanup work on the target host.
- Warm hybrid end-to-end time is at least 20% faster than the current warm native
  local path before `MEDIAFORGE_MATH_RENDER_EXECUTOR=hybrid` is recommended.

## Reporting

Create the required Codex run report listing exact commands, exit statuses,
image ID, benchmark timings/ratio, cache and transfer metrics, output validation,
per-scene assignments, overlap evidence, reassignment evidence, changed paths,
commit hash, remaining risks, and anything not measured. Do not include host
addresses or secrets.

## Stop Conditions

Stop and retain local mode if preflight fails, the image identity changes,
outputs fail local QA, the same focused failure survives two targeted fixes, the
benchmark lacks real local/remote overlap, or warm hybrid performance does not
meet the 20% threshold.
