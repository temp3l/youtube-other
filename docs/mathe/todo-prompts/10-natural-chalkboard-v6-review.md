Recommended model: GPT-5/Codex
Recommended reasoning: high

# Review and implement the natural chalkboard v6 lesson

Continue the mathematics video pipeline on branch `mathe-init` from commit `f43b409`.

Read `AGENTS.md`, `docs/ai-context/context-pack.md`,
`docs/reports/codex-runs/2026-07-24-semantic-chalkboard-v4.md`, and
`docs/reports/codex-runs/2026-07-24-child-centered-place-value-v5.md`.

Review these artifacts carefully:

- Previous M5-ZO video:
  `.cache/math-pipeline/m2-009-paid-20260724-sZJ2zC/m5-zo-001-standard/locales/de/render/final.mp4`
- Current v5 review:
  `.cache/math-pipeline/m5-zo-001-v5-review/locales/de/render/final.mp4`
- Current contact sheet:
  `.cache/math-pipeline/m5-zo-001-v5-review/review-frames/contact-sheet.png`

Create a v6 review video that feels like a warm, experienced German Class 5
teacher is naturally developing the lesson on a real chalkboard, rather than
presenting a dashboard or a sequence of polished cards.

Review the full video with audio. Inspect every scene near its beginning,
middle, and end. Evaluate:

1. Mathematical and pedagogical clarity.
2. Age appropriateness for children around 10–11.
3. Natural teacher pacing and explanation.
4. Whether chalk marks appear in the order a teacher would write them.
5. Whether the board preserves useful earlier work.
6. Visual density, readability, and duplicated caption or board text.
7. Whether pauses give children genuine time to think.
8. Audio and visual synchronization and transition quality.

Prioritize these improvements:

- Begin scenes with a mostly blank board and build the solution progressively.
- Replace UI-like tabs, cards, and panels with simple chalk headings,
  underlines, arrows, circles, ticks, and margin notes.
- Keep useful intermediate work visible instead of resetting the board
  unnecessarily.
- Reveal one meaningful idea at a time.
- Animate text by words or mathematical chunks instead of exposing complete
  blocks instantly.
- Vary chalk timing naturally: quick headings, slower numbers, deliberate zero
  placement, and short pauses after questions.
- Use subtle chalk irregularity without reducing legibility.
- Correct mistakes like a teacher: write the misconception lightly, pause,
  cross it out, and repair it beside the original.
- Use pointing arrows, circles, and colored chalk only when they direct
  attention.
- Avoid decorative motion, bouncing elements, excessive boxes, and
  game-interface styling.
- Keep captions concise and secondary to the board.
- Preserve the eight-second silent challenge and deterministic local reveal
  cue.
- Do not reveal the challenge answer before the solution scene.

Reuse the existing narration audio. Make no paid provider calls and do not
publish anything. If the formal existing narration limits naturalness,
document that honestly and retain the revised narration as the proposed future
recording script.

Write every temporary and review artifact under:

`.cache/math-pipeline/m5-zo-001-v6-review/`

Never use `/tmp`.

Implement the strongest evidence-based improvements, run focused validation,
render the complete v6 MP4, create a nine-scene contact sheet and think/reveal
strip, and inspect them visually. Preserve unrelated changes.

Create the required Codex run report, then commit and push only the relevant
work. In the final response, provide clickable paths to the video, contact
sheet, reveal strip, revised script, validation results, commit hash, and
remaining risks.
