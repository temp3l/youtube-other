# R-007 Semantic Math Media Implementation Prompt

Recommended execution settings: `5.6-sol`, extra-high reasoning.

```text
Continue from the current worktree. Read AGENTS.md,
docs/ai-context/context-pack.md,
docs/mathe/audits/remediation-backlog.md,
docs/mathe/plans/math-genre-implementation-plan.md,
docs/mathe/plans/math-genre-test-matrix.md,
docs/reports/codex-runs/2026-07-12-math-localization-remediation.md,
and the current math plan implementation report.

Baseline commit is ac21261; current HEAD is c97572e and the worktree contains
uncommitted R-006 acceptance repairs. Preserve every unrelated change,
including existing .tmp, .vscode, and report files.

R-006 is accepted. Implement R-007 only. Do not start R-008 or later work.

Build the smallest complete provider-free media slice satisfying every R-007
backlog acceptance criterion:

- deterministic, cache-keyed SVG formula and semantic diagram components
- structured AST input only, with no untrusted LaTeX
- fact IDs attached to every displayed mathematical value
- number-line, graph, geometry, table, measurement, and probability semantics
- explicit missing/invalid component failures
- local mock TTS artifacts
- narration-driven timing reflow and frame synchronization
- deterministic local Remotion composition and runner
- 1920x1080, 30fps, 180-300-second MP4 output
- FFmpeg/ffprobe validation for audio, video, duration, continuity, and corruption
- teacher presence capped at 25%, with missing-teacher behavior tested
- safe-area and readability failures blocking readiness

Inspect existing domain, localization, timing, rendering, speech, workspace,
artifact-lineage, workflow-fingerprint, quality, and CLI code before editing.
Reuse existing repo-native rendering and speech infrastructure where compatible,
but never fall back to the horror/story renderer when math semantics are absent.

Use deterministic local fixtures and mocks only. Do not call paid providers,
network media services, publishing, remote renderers, or modify generated
episode assets. Do not perform broad refactors, broad tests, snapshot updates,
or fixture regeneration.

Before implementation, identify the exact files and contracts being changed.
Use adversarial source review. Validate within AGENTS.md limits: at most three
focused test commands and one affected-package typecheck. Include focused
negative tests, deterministic hash checks, boundary durations, cue drift,
missing assets/components, corrupt media, one small local render, and FFmpeg
validation. Classify failures before repairing them.

If the complete R-007 contract cannot be implemented safely within the
verification budget, stop at a coherent boundary, leave R-007 pending, and
report the exact unfinished acceptance criteria. Do not weaken assertions or
mark partial work accepted.

After modifications, update:

- docs/mathe/audits/remediation-backlog.md
- docs/reports/2026-07-12/math-genre-implementation-plan-implementation-report.md
- the required Codex run report

Keep R-007 "implemented, pending independent acceptance" even when all focused
checks pass. Report exact checks, results, changed paths, current commit hash,
unverified behavior, and remaining risks. Do not commit unless explicitly asked.
```
