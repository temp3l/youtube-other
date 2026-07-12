# Recommend math follow-up prompt

- Summary: Added the next review-only prompt for independent R-007 acceptance. It recommends GPT-5.3-Codex with `xhigh` reasoning and targets fact authority, artifact lineage, timing/runtime resolution, SVG overflow/readability, media evidence, and the remaining math-education typecheck gap before R-008.
- Changed paths: `todo-prompts/math-followups/04-independently-accept-repaired-r007.md`; this report.
- Checks: inspected Git state, AGENTS/context, prior math follow-up prompts, current backlog/reports, and targeted R-007 source contracts. Official Codex-manual fetch failed integrity verification; official OpenAI model search identified GPT-5.3-Codex and its reasoning levels. Targeted `git diff --check` and prompt path check passed.
- Commit: HEAD `949022648057a7e09f50be3fdcdd981496644a9b`; uncommitted prompt/report changes.
- Risks/follow-up: Model availability can vary by Codex surface. Run prompt 04 in a fresh session; do not begin R-008 until its acceptance decision is recorded.
