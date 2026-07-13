# Batch 4 Prompt: Educational Renderer Animated Chalk Writing

```text
Continue from the current repository state after the accepted linux math renderer batches. Read
AGENTS.md,
docs/ai-context/context-pack.md,
docs/plans/linux-math-renderer/README.md,
docs/plans/linux-math-renderer/01-release-acceptance.md,
docs/plans/linux-math-renderer/02-visual-correctness.md,
docs/plans/linux-math-renderer/03-operational-completeness.md,
the completed linux math renderer implementation reports,
packages/educational-renderer/README.md,
packages/educational-renderer/src/contracts.ts,
packages/educational-renderer/src/renderers/svg.ts,
packages/educational-renderer/src/composition/ffmpeg.ts,
packages/educational-renderer/src/application/renderer.ts,
packages/educational-renderer/src/domain/cache-key.ts,
packages/educational-renderer/src/domain/cache.ts,
packages/educational-renderer/src/cli.ts,
relevant fixtures,
and relevant educational-renderer tests.

Inspect Git state and current renderer capabilities before editing. Preserve unrelated work and accepted
earlier batches. Do not clean, reset, rewrite history, commit, invoke providers, publish, integrate with
apps/cli, modify production pipelines, or add remote rendering dependencies.

Implement one bounded batch: animated chalk-writing support for math-writing scenes inside
`packages/educational-renderer`. This batch adds a deterministic local animation mode for equation content.
It does not add new scene families, distributed rendering, external services, or Mediaforge integration.

## Gate 1: contract and feature boundary

1. Keep the existing package isolated and private/internal.
2. Add an opt-in animated representation for `equation` and `equation-transformation` scenes only.
3. Preserve current static output for scenes that do not opt into animation.
4. Do not silently change existing fixture behavior unless a fixture is intentionally updated for animation.
5. Keep `libx264` as the default encoder. Hardware remains opt-in.
6. Keep Graphviz and Blender unused by rendering.

## Gate 2: animation behavior

1. Equations must be written progressively character-by-character or token-by-token, never appearing fully
   completed at scene start.
2. Timing must be deterministic yet visibly uneven.
3. Include brief pauses around operators, equals signs, fraction bars, and transformation step boundaries.
4. Add chalk-like texture or stroke breakup that remains deterministic across reruns on the same host.
5. Add slight wobble/hand-drawn instability without making the result unreadable.
6. Add a moving chalk tip or simple hand indicator synchronized to the active writing position.
7. Equation-transformation scenes must visibly write the `from` expression, operation cue, and `to`
   expression as a sequence rather than showing all final text at once.
8. Keep final frames semantically equivalent to the existing completed equations.

## Gate 3: renderer architecture

1. Extend scene contracts with the minimum animation configuration needed; default remains static behavior.
2. Distinguish static and animated representations in cache keys and cache manifests so entries cannot collide.
3. Keep rendering deterministic and local-only. No browser automation, no remote services, no provider calls.
4. Use the existing renderer/composition architecture where possible; do not introduce broad package refactors.
5. If animated output requires frame generation, keep the implementation bounded and package-local.
6. Preserve final FFprobe validation and existing error typing behavior.

## Gate 4: truthful verification

1. Add focused tests for animation contract parsing, deterministic timing, cache-key separation, and renderer
   behavior relevant to the new mode.
2. Keep existing static fixtures rendering successfully.
3. Produce three sample videos for manual verification that clearly show:
   - progressive writing;
   - uneven timing and brief pauses;
   - chalk texture;
   - slight wobble;
   - moving chalk tip or hand indicator.
4. Verify final outputs with FFprobe.
5. Do not weaken assertions just to pass animation output checks.

## Gate 5: docs and reporting

1. Update docs only where behavior or supported scene configuration actually changes.
2. Reconcile README claims with the implemented animation boundary; remove stale static-only claims if the
   package now supports animated equation writing.
3. Because this prompt is under `docs/plans/`, create/update:
   `docs/reports/<YYYY-MM-DD>/04-animated-chalk-writing-implementation-report.md`
4. Also create the normal Codex run report required by `AGENTS.md`.

## Verification budget

Use at most three distinct test commands:

1. One focused command for animation unit/integration behavior.
2. One focused command for cache/contracts/composition coverage affected by the change.
3. One focused render command producing the three manual-verification sample outputs.

After focused checks pass, run at most one affected-package typecheck and `git diff --check`. Do not run
repository-wide tests, builds, providers, publishing, snapshot updates, or unrelated package verification.

## Stop conditions

Stop under convergence rules rather than weakening assertions or inventing capability. Stop and report if:

1. the same focused failure survives two targeted fixes;
2. the design requires broad repo integration beyond the package boundary;
3. deterministic local rendering cannot support the requested animated behavior within this package scope;
4. more than three fixtures appear to need updates;
5. the implementation would require misrepresenting current capabilities.

Final response must be under 200 words and list summary, changed paths, checks with exit statuses, current
commit hash, sample output paths, and unresolved risks. Do not commit.
```
