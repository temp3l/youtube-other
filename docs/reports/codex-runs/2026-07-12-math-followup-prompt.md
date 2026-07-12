# Math follow-up prompt

- Summary: Added the next independent R-007 acceptance prompt. It preserves the prior green 180-second render evidence, requires adversarial source review plus fresh typecheck/unit/small-render checks, forbids R-008 work, and permits acceptance only if every R-007 contract remains supported. Recommended `gpt-5.6-sol` with `max` reasoning; fallback is `gpt-5.6-terra` with `xhigh`.
- Changed paths: `todo-prompts/math-followups/02-independently-accept-r007.md`; this report.
- Tests/checks: documentation-only `git diff --check`; no code tests or typecheck warranted.
- Commit: baseline `ac21261`; HEAD `9651a4036d8d29cc0a545eb5bceb53a02e4135da`; uncommitted.
- Risks: the prompt records the human-reported green typecheck but requires independent verification; R-007 must remain pending if any source or focused check contradicts prior evidence.
