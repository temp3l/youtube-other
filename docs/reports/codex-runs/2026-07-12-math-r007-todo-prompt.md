# Math R-007 todo prompt

- Summary: Added a copy-ready prompt for implementing R-007 semantic math visuals, mock TTS, timing reflow, local Remotion rendering, and FFmpeg media QA. It preserves the strict remediation order, requires provider-free execution, limits verification according to `AGENTS.md`, leaves R-007 pending independent acceptance, and excludes R-008, publishing, remote services, generated assets, and unrelated refactors.
- Changed paths: `todo-prompts/math-r007-semantic-media-implementation.md`; this report.
- Tests/checks: targeted Prettier check and `git diff --check`.
- Commit: HEAD `c97572e`; changes uncommitted.
- Risks: the prompt depends on the current worktree’s uncommitted R-006 acceptance state and should be updated if HEAD or acceptance status changes before use.
- Follow-up: run the prompt with the strongest available coding model; recommended setting is `5.6-sol` with extra-high reasoning.
