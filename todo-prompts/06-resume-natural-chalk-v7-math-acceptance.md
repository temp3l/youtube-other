Recommended model: GPT-5/Codex

Recommended reasoning: high

# Resume the Natural Chalk v7 Full-Lesson Acceptance Render

Continue the interrupted mathematics work in the existing repository on branch
`mathe-init`. The current base commit is `f29a43c`; the relevant implementation
and many unrelated user changes are uncommitted. Preserve the entire worktree.
Do not reset, clean, stash, overwrite, or broadly reformat it.

## Inspect First

Read completely before acting:

- `AGENTS.md`
- `docs/ai-context/context-pack.md`
- `docs/reports/codex-runs/2026-07-26-centerline-chalk-v7-fixture.md`
- `docs/reports/codex-runs/2026-07-25-math-raster-resume-v6-acceptance.md`
- `.cache/math-pipeline/m5-zo-001-natural-chalk-v7-acceptance/render-acceptance.mjs`
- `packages/math-rendering/src/composition/remotion-runner.ts`

Inspect the relevant current source, tests, output manifests, and cache before
changing anything. Treat source code and validated artifacts as authoritative.

## Current Checkpoint to Revalidate

The accepted preview contract is `math-semantic-chalk.v7` with
`math-semantic-keyframe-runner.v10`. The eight-second 1920×1080 fixture passed
frame-strip review. Supported glyphs use centerline SVG strokes; nested text
still uses the documented fallback.

The full five-minute acceptance render is under:

`.cache/math-pipeline/m5-zo-001-natural-chalk-v7-acceptance/`

At the interruption, its atomic progress manifest reported:

- state: `in-progress`
- total raster checkpoints: `1,819`
- completed: `488`
- remaining: `1,331`
- scene 1: `332/332`
- scene 2: `132/132`
- scene 3: `24/300`
- current scene: `scene-003`

Re-read the manifest instead of assuming those counts are still current:

`.cache/math-pipeline/m5-zo-001-natural-chalk-v7-acceptance/locales/de/render/.render-work/semantic-raster-progress.json`

## Objective

Resume the existing checkpointed run, finish the full v7 lesson, validate it,
and prepare a compact visual review pack for human acceptance. This is a render
continuation and acceptance task, not a redesign of the mathematics pipeline.

## Required Work

1. Check whether another process is actively writing this exact render. Do not
   start a concurrent writer. Use progress timestamps and safe process
   inspection; do not kill an unknown process.
2. Preserve `.render-work/`, the semantic SVG keyframes, and every valid raster
   checkpoint. Never delete or regenerate the cache wholesale.
3. Confirm that the acceptance script still targets v7, runner v10, the
   approved source unit, and the approved narration hash.
4. Resume with the repository-supported command. The expected command is:

   ```bash
   pnpm exec tsx .cache/math-pipeline/m5-zo-001-natural-chalk-v7-acceptance/render-acceptance.mjs
   ```

   If current scripts establish a different command, use the source-backed
   command and document the deviation. The runner must validate and reuse
   completed PNG checkpoints.
5. Let the render finish unless it reaches a real failure. Do not restart an
   unchanged failed command repeatedly. Diagnose one concrete failure at a
   time and make only the smallest justified repair.
6. Verify the completed progress manifest, all nine scene videos, the final
   mux, render fingerprint, renderer/runner provenance, and zero provider and
   publication actions.
7. Verify with `ffprobe` that the final video is 1920×1080, 30 fps,
   approximately five minutes, H.264 video with AAC audio. Hash the rendered
   narration and prove it remains byte-identical to the approved source audio.
8. Under the same v7 acceptance directory, create:
   - a nine-scene contact sheet;
   - a small writing-progression strip for representative heading, equation,
     zero-placement, correction, and challenge/reveal moments;
   - a concise machine-readable or Markdown validation summary.
9. Inspect the review images visually and sample the full video with audio.
   Check legibility, centerline stroke order, mostly blank scene openings,
   retained board context, pacing, challenge secrecy, the eight-second silent
   challenge, correction behavior, subtitle-bar absence, transitions, and
   audio/video synchronization.
10. Do not claim human visual acceptance. If the technical and agent review
    passes, clearly mark the full v7 video as awaiting human approval.

## Guardrails

- Make no TTS, image-generation, analytics, upload, scheduling, or publication
  request.
- Do not regenerate or modify the approved narration.
- Do not touch the horror-storytelling workstream.
- Do not run repository-wide tests, builds, lint, typecheck, snapshots, or
  fixture regeneration.
- If no source file changes, use artifact validation only. If a production
  defect requires a source change, run the directly affected Vitest file first
  and at most one affected-package typecheck after it passes.
- Preserve unrelated failures and classify them instead of repairing them.
- Do not commit or push unless the human explicitly asks. Never stage unrelated
  worktree changes.

## Completion

Create the required report at:

`docs/reports/codex-runs/YYYY-MM-DD-natural-chalk-v7-full-acceptance.md`

Keep it under 200 words and include only summary, changed paths, exact
checks/results, base or resulting commit hash, and unresolved risks. In the
final response, link the final video, contact sheet, progression strip,
validation summary, progress manifest, and report. State anything not verified.
