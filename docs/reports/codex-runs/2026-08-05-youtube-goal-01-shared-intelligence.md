# Goal 01 shared genre production intelligence

Summary: added opt-in, versioned shared production contracts in `@mediaforge/domain`; existing genre profiles remain inactive and unchanged.

Changed paths: `packages/domain/src/genre-production-intelligence.ts`, its unit test, `packages/domain/src/index.ts`, Goal 01 fixture, checklist, and progress checkpoint.

Tests: focused new-contract tests (9 passed); domain typecheck passed; targeted ESLint passed; history, math, strategic-reinvention, and dynamic-genre compatibility characterizations passed. Dark Truth profile-contracts has a pre-existing fixture failure: missing `episode.adaptationNotes.it`.

Commit: `e508d56`.

Unresolved risks: future profiles must explicitly opt in; no existing runtime consumes the new contracts yet.
