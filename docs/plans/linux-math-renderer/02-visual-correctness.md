# Batch 2 Prompt: Educational Renderer Visual Correctness

```text
Continue from the current repository state after Batch 1 release acceptance is
green. Read AGENTS.md,
docs/ai-context/context-pack.md,
docs/plans/linux-math-renderer/README.md,
docs/plans/linux-math-renderer/01-release-acceptance.md,
the completed Batch 1 implementation report,
todo-prompts/linux-math-video-rendering/planning.md,
packages/educational-renderer/README.md,
packages/educational-renderer/docs/adr/002-primary-renderer.md,
packages/educational-renderer/docs/adr/003-scene-level-output.md,
packages/educational-renderer/docs/adr/004-static-scenes.md,
packages/educational-renderer/docs/adr/005-ffmpeg-export.md,
packages/educational-renderer/docs/adr/007-fonts.md,
packages/educational-renderer/src/contracts.ts,
packages/educational-renderer/src/domain/cache-key.ts,
packages/educational-renderer/src/renderers/svg.ts,
packages/educational-renderer/src/composition/ffmpeg.ts,
packages/educational-renderer/src/application/renderer.ts,
all educational-renderer fixtures and tests, package.json, and pnpm-lock.yaml.

Inspect Git state and current rendered behavior before editing. Source is
authoritative. Preserve unrelated tracked/untracked work and all accepted Batch 1
changes. Do not clean, reset, rewrite history, commit, regenerate committed
fixtures/artifacts, integrate with Mediaforge, invoke providers, or publish.

Implement one bounded visual-correctness batch. Do not add TTS, AI planning,
images, thumbnails, Blender, web UI, database state, hardware work, or performance
optimization. Keep the renderer static unless Gate 3 explicitly approves a
composition-only transition contract.

## Gate 1: real mathematical typography

Treat formula rendering as the visual release blocker. The current KaTeX path
validates formulas but reduces them to approximate plain SVG text. Replace that
approximation with one deterministic mathematical rendering path.

1. Audit locally available/repository-compatible approaches before adding a
   dependency. Evaluate at minimum:
   - direct deterministic SVG output suitable for librsvg;
   - KaTeX output conversion feasibility without a browser;
   - a focused MathJax-SVG or equivalent implementation;
   - font embedding/subsetting and license implications.
2. Record the decision in an ADR. Choose one renderer; do not maintain parallel
   formula implementations or silently fall back to approximate text.
3. The chosen path must:
   - run locally on Linux without network or browser services;
   - produce deterministic, contained SVG fragments;
   - support fractions, roots, powers, subscripts, multiplication/division,
     parentheses, equality/inequality, and common German grade 5-10 notation;
   - reject unsupported/untrusted markup with a stable typed error;
   - respect the explicitly configured open font strategy where applicable;
   - avoid foreignObject if the actual FFmpeg/librsvg toolchain cannot render it;
   - fail closed rather than substitute or omit glyphs.
4. Include the exact formula renderer/version/font/tool identity and any
   output-affecting configuration in scene cache keys.
5. Prove formula-only changes invalidate the affected scene, while narration,
   audio, subtitle, and unrendered metadata changes do not.
6. Preserve strict public versioning. If formula semantics correct previously
   incorrect output without changing request shape, keep requestVersion 1 and
   increment internal renderer/cache format identity.

Add focused semantic tests for valid/invalid formulas, escaped text, deterministic
SVG, cache identity, and no network/browser dependency. Add real render tests and
inspect representative frames at preview, 1080p landscape, and portrait.

Do not proceed until equations and equation transformations are visibly correct
and unclipped.

## Gate 2: complete supported scene/layout coverage

1. Create minimal temporary or source-controlled input fixtures for every
   currently public scene type: title, text, equation, equation-transformation,
   coordinate-graph, geometry triangle/rectangle/circle, and summary.
2. Do not regenerate existing committed outputs. Render verification output only
   under fresh OS temporary directories.
3. Cover preview, youtube-full, and youtube-short layouts. Verify:
   - safe margins and no clipping;
   - long German words and multiline text wrapping;
   - graph axes/ranges/labels and points at boundaries;
   - geometry labels stay associated with shapes;
   - formulas fit or fail validation instead of being silently truncated;
   - configured fonts are actually used;
   - yuv420p-compatible even dimensions and expected frame rate.
4. Prefer semantic geometry/layout assertions over full-image snapshots. Small
   targeted pixel/bounding-box assertions are allowed when stable and explained.
5. Perform manual visual inspection of representative frames for every scene
   type and record exactly what was inspected in the implementation report.
6. Add a real minimal geometry fixture before claiming geometry integration.

## Gate 3: settle transition semantics

The public contract currently accepts fade metadata but renders hard boundaries.
Do not leave an accepted-but-inert field in a release-complete contract.

Before implementation, decide one of these paths from source and measured scope:

A. Implement composition-level fades with deterministic FFmpeg filters, explicit
duration semantics, audio/subtitle timeline behavior, final duration calculation,
cache identity rules, cancellation, and FFprobe verification.

B. Remove/deprecate fade from the current public contract and accept only hard
boundaries, using a documented versioning/migration decision. Do not silently
reinterpret existing requests.

Prefer B unless A remains small, testable, and does not destabilize audio/subtitle
timing. If A is selected, transition metadata belongs to composition identity,
not visual scene-segment keys, unless it changes cached segment bytes. Add real
multi-scene audio/subtitle timing tests. If neither path converges within the
verification budget, stop and report the decision blocker.

## Documentation and verification

Update README, relevant ADRs, contracts documentation, fixture documentation,
and package dependencies only for implemented behavior. Update pnpm-lock.yaml
only through pnpm if a dependency is approved. Do not claim animation, transition,
geometry, typography, or visual verification beyond what was actually rendered.

Use at most three distinct test commands:

1. Formula renderer/cache-key unit test file alone.
2. Directly affected contracts/renderers/architecture tests together.
3. Build first, then real fixture/layout/package smoke integration files together.

After focused tests pass, run one package typecheck, package lint, and git diff
--check. Render fresh temporary preview, 1080p landscape, and portrait outputs;
FFprobe final media and representative segments; inspect frames for every public
scene type. Do not run repository-wide checks, providers, publishing, benchmarks,
snapshot updates, or episode regeneration.

Because this prompt is under docs/plans/, create/update:
docs/reports/<YYYY-MM-DD>/02-visual-correctness-implementation-report.md

The report must satisfy AGENTS.md Plan Execution Reporting, including the formula
renderer decision, transition decision, visual inspection evidence, deviations,
exact checks/results, and remaining risks. Create a normal Codex run report only
if still independently required by AGENTS.md.

Stop under convergence rules rather than weakening visual or semantic assertions.
Final response must be under 200 words and list summary, changed paths, exact
checks with exit statuses, current commit hash, and unresolved risks. Do not commit.
```

