# Recommended next prompt: finish and verify R-007

Recommended model: `5.6-sol`.

Recommended reasoning: `extra-high`.

Why: this combines cross-package TypeScript contracts with Remotion bundling,
Chromium, FFmpeg packet validation, deterministic caching, and a real
boundary-duration render. If `5.6-sol` is unavailable, use the strongest GPT-5
Codex model available with high reasoning.

```text
Continue from the current worktree. Read AGENTS.md,
docs/ai-context/context-pack.md,
docs/mathe/audits/remediation-backlog.md,
docs/mathe/plans/math-genre-implementation-plan.md,
docs/mathe/plans/math-genre-test-matrix.md,
docs/reports/codex-runs/2026-07-12-math-media-remediation.md,
and docs/reports/2026-07-12/math-genre-implementation-plan-implementation-report.md.

Inspect actual Git state first. Baseline is ac21261; expected HEAD is
9651a4036d8d29cc0a545eb5bceb53a02e4135da, but Git is authoritative. The
worktree contains the uncommitted R-007 implementation and unrelated .tmp,
todo-prompts, and report files. Preserve every pre-existing change. Do not
clean, reset, regenerate fixtures, or modify generated episode assets.

R-006 is accepted. R-007 is pending and incomplete. Finish and verify R-007
only. Do not start R-008 or later work. Do not publish or call paid providers,
remote renderers, network media services, or story/horror fallbacks.

The last exact integration run booted the official @remotion/bundler output and
reached MathVideo, then failed with:

  TypeError: Cannot read properties of undefined (reading 'find')

The likely cause was empty resolved scene props in the direct VideoConfig. A
narrow repair now binds inputProps into VideoConfig.props/defaultProps and
renderMedia, but it was not rerun. DTS continuity, unbound-label restrictions,
measurement-unit semantics, and probability-bound repairs were also not rerun.
Treat these as hypotheses until source review and focused execution confirm
them.

Before editing, identify the exact files and contracts being changed. Inspect:

- packages/math-education/src/lesson/timing.ts
- packages/math-rendering/package.json and tsconfig.json
- packages/math-rendering/src/components/{math-components,svg-cache}.ts
- packages/math-rendering/src/audio/mock-tts.ts
- packages/math-rendering/src/assets/teacher.ts
- packages/math-rendering/src/composition/{composition,remotion-entry,remotion-runner}.ts*
- packages/math-rendering/src/{provider-free-media,profiles/profiles,quality/media-qa}.ts
- both current math-rendering focused test files
- math artifact schemas/store, workflow fingerprints, quality gates, workspace
  resolver, and math CLI only where R-007 lineage or operational wiring requires
  them
- relevant repo-native speech and rendering validation contracts

Use adversarial source review. Confirm every displayed mathematical value has a
fact ID; inputs are strict structured AST/units only; no caller-supplied LaTeX
or numeric unbound label is accepted; number-line, graph, geometry, table,
measurement, and probability semantics fail explicitly when invalid; SVG/cache
and render fingerprints are deterministic; teacher area and timeline presence
are each <=25%; and missing teacher/component, safe-area, or readability errors
block readiness.

Verification order, within a fresh AGENTS.md budget:

1. Rerun the exact failed integration test first:
   pnpm test:focused -- packages/math-rendering/src/math-media.integration.test.ts -t "creates cached mock speech, performs a local Remotion render, and rejects corrupt media"
2. If it passes, run:
   pnpm test:focused -- packages/math-rendering/src/math-rendering.unit.test.ts
3. Add or use one focused production-boundary test and run it exactly once. It
   must create an actual temporary 180-second 1920x1080, 30fps MP4 through the
   provider-free production runner and prove audio/video streams, duration,
   packet continuity, corruption scan, narration/frame synchronization, and
   no provider/network dispatch. Do not commit binary media. A schema-only or
   shortened substitute does not satisfy this criterion.
4. After focused tests pass, run only:
   pnpm --filter @mediaforge/math-rendering typecheck

The small render must prove the local Remotion path and corrupt-media negative.
The production-boundary render must prove the inclusive 180-second contract.
Unit coverage must retain deterministic hashes, both age profiles, missing
teacher/diagram, cue drift, 179/180/300/301 boundaries, safe area, readability,
measurement units, probability bounds, and DTS continuity. Confirm there is no
story/horror import or fallback.

Honor AGENTS.md: at most three distinct focused test commands, at most two
repair reruns of one failure, and one affected-package typecheck. Refresh only
the local math-education package output if stale dist masks accepted source;
classify that as environment setup. Classify every failure before repair. Do not
weaken assertions, broaden tests, update snapshots, or regenerate fixtures.

If all criteria pass, set R-007 to exactly "implemented, pending independent
acceptance"—not accepted. If any criterion remains unverified or the budget is
exhausted, keep R-007 pending and report the exact command, test, failure,
owning module, and smallest follow-up. R-008 must remain untouched.

Update:

- docs/mathe/audits/remediation-backlog.md
- docs/reports/2026-07-12/math-genre-implementation-plan-implementation-report.md
- the required Codex run report

Report exact changed paths, checks/results, current commit hash, unverified
behavior, and remaining risks. Do not commit unless explicitly asked.
```
