# Math R-007 repair prompt

- Summary: Added the next copy-ready prompt for repairing R-007 fact-semantic binding and scene/audio frame synchronization. It requires exact upstream AST/unit lineage, scene-local binding, adversarial negatives, bounded adjacent fail-closed review, and keeps R-007 pending independent acceptance. Recommended `gpt-5.6-sol` with `max` reasoning; fallback is `gpt-5.6-terra` with `xhigh`.
- Changed paths: `todo-prompts/math-followups/03-repair-r007-acceptance-blockers.md`; this report.
- Tests/checks: targeted Prettier check passed for both changed Markdown files; no code tests or typecheck warranted.
- Commit: baseline `ac21261`; HEAD `9651a4036d8d29cc0a545eb5bceb53a02e4135da`; uncommitted.
- Risks/follow-up: the prompt records current dirty-worktree evidence and must preserve it. Run the prompt next, then perform a separate independent R-007 acceptance review. R-008 remains out of scope.
