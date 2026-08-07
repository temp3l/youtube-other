export const MATH_EXECUTABLE_TASK_IDS = [
  "math.curriculum-import",
  "math.source-validation",
  "math.prerequisite-graph",
  "math.lesson-spec",
  "math.math-verification",
  "math.canonical-narration",
  "math.scene-timing",
  "math.localization",
  "math.visual-style",
  "math.visual-assets",
  "math.tts",
  "math.timing-reflow",
  "math.render",
  "math.quality-gate",
  "math.metadata-playlists",
  "math.publish-dry-run",
] as const;

export type MathExecutableTaskId = (typeof MATH_EXECUTABLE_TASK_IDS)[number];
