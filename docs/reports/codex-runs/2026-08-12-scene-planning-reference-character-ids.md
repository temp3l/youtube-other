# Scene-planning reference character IDs

- Changed files: `packages/scene-planning/src/index.ts`; this report.
- Tests/checks run: `pnpm --filter @mediaforge/scene-planning build`.
- Result: passed; TypeScript now accepts the `Scene` produced by `OneToOneScenePlanner`.
- Risks remaining: the generic planner deliberately emits no canonical character references; character-aware adapters must continue to populate them where required.
- Follow-up: none for this compile failure.
