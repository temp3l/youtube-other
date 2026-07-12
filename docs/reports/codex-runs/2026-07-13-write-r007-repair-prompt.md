# Write R-007 repair prompt

- Summary: Added the recommended follow-up prompt to repair the three remaining R-007 acceptance areas: authoritative R-004 lineage and exact scene coverage, truthful SVG bounds/readability, and identical production/test timing resolution. The prompt keeps R-007 pending and prohibits R-008, providers, publishing, generated assets, fixture regeneration, and committed `dist` edits.
- Changed paths: `todo-prompts/math-followups/05-repair-r007-second-acceptance-blockers.md`; this report.
- Checks: inspected Git state and existing prompt numbering; targeted Markdown whitespace and path checks passed.
- Commit: HEAD `949022648057a7e09f50be3fdcdd981496644a9b`; uncommitted.
- Risks/follow-up: The repair may establish that production-runtime verification requires a narrowly authorized package-resolution change. Run prompt 05 in a fresh implementation session, then request a separate independent R-007 acceptance review.
