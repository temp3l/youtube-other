# Legacy retirement Task 03 census

## Changed files

- `apps/cli/src/episode-layout-migration-command.ts`
- `apps/cli/src/episode-layout-migration-command.unit.test.ts`
- Legacy-retirement plan, register, census, and reports

## Checks and results

- `pnpm test:focused -- apps/cli/src/episode-layout-migration-command.unit.test.ts`: 6 passed
- Read-only source planner census: 184 candidates; 127 canonical, 1 safe
  move, 14 identical duplicates, 42 divergent duplicates, 0 errors
- `git diff --check`: passed before documentation edits

No production artifact was moved and no paid provider ran.

## Risks and follow-up

The safe candidate still needs operator-approved write mode and rollback
evidence. Divergent and identical duplicates need recorded retention or cleanup
decisions. Active compatibility writers remain for later Task 03 slices.

## Commit

`bd08793` (`fix(cli): census mixed-case episode layouts`).
