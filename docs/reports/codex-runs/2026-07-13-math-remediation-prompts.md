# Math remediation prompt sequence

## Changed files

- `docs/mathe/todo-prompts/README.md`
- `docs/mathe/todo-prompts/01-a001-packaged-cli.md` through
  `09-a009-independent-pilot.md`
- This report

## Tests/checks run

- Targeted file listing and source reads for the remediation backlog, source audit,
  AI context pack, math test matrix, existing implementation prompt, and package scripts.
- `git diff --check -- docs/mathe/todo-prompts docs/reports/codex-runs/2026-07-13-math-remediation-prompts.md`

## Results

- All ten prompt files exist in strict execution order.
- Every prompt begins with a model and reasoning recommendation.
- Targeted `git diff --check` passed.

## Risks remaining

- A-003/A-004 require human evidence or approval.
- A-008 broad verification requires explicit authorization.
- A-009 must use a fresh independent session.

## Follow-up tasks

- Execute and accept prompts strictly in filename order.
