Recommended model: GPT-5/Codex  
Recommended reasoning: high

# Implement A-008: green release and compatibility gates

Proceed only if A-007 is accepted. Implement A-008; do not run the independent pilot yet.

Read `AGENTS.md`, `docs/ai-context/context-pack.md`, A-008/F-108/F-109,
`docs/mathe/plans/math-genre-test-matrix.md`, affected scripts/Vitest configs, and current
focused failures. Confirm every wrapper honors file filters before using it.

First map C01-H04 to exact existing test files and identify missing coverage. Add only
focused semantic tests or source/config repairs needed for the approved release gate.
Classify every failure as production defect, intentional approved contract change, stale
fixture, or unrelated pre-existing failure. Do not weaken assertions, broadly update
snapshots/fixtures, or hide failures. A quarantine must name an owner, reason, and expiry.

This stage requires broad verification beyond the default repository budget. Before
running repository-wide format, lint, typecheck, build, or the complete matrix, obtain the
human's explicit authorization if it has not already been given. Until then, prepare and
run only focused affected checks. Never use providers, credentials, remote rendering,
publishing, or live channel mutation.

Record exact C01-H04 pass/fail/skip evidence, including corruption, interruption/resume,
provider-zero, packaged CLI, and horror defaults. Do not call A-008 accepted with skipped
required gates.

Create `docs/reports/codex-runs/YYYY-MM-DD-a008-release-gates.md`. Because this work uses a
file under `docs/mathe/plans/`, also apply the repository's plan-execution reporting rule
to the applicable implementation report. Include changed paths, exact commands/results,
matrix totals, quarantines, commit hash or `not committed`, risks, and acceptance status.
