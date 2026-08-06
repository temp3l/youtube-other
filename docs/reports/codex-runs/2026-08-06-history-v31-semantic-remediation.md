# Codex run: History V3.1 semantic remediation

## Summary

Implemented the opt-in History V3.1 semantic remediation stack and regenerated Napoleon, Rome, and Black Death ChatGPT review packs. Packs contain complete narration-linked plans, quarantined entity diagnostics, typed claims/routes/diagrams, aspect-ratio adaptations, checksums, and self-review; they contain no generated media or approval commands.

## Changed paths

- `packages/history/src/history-{semantic,editorial,geo,artifact-lint,review-bundle}-v31.ts`
- `packages/history/src/visual-planner-v31.ts`, V3.1 unit tests, exports
- `apps/cli/src/history-commands.ts`, test, and `index.ts`
- `artifacts/chatgpt-review/*-v3.1*`
- V3.1 implementation reports

## Tests/checks

V3.1 focused tests: 24/24 pass. History build, History+CLI typecheck, targeted ESLint, checksum verification, four ZIP integrity checks, redaction scan, and no-media scan pass. Cross-genre characterization: Dark Truth, Veronica, dynamic/generic pass; Math Education 3/4.

## Commit

`2655c9e`; changes are not committed.

## Risks

Math has an unrelated task-order expectation failure. Packs are reviewable, not approval-eligible, because target-duration conflicts and unresolved claim provenance are explicit blockers.
