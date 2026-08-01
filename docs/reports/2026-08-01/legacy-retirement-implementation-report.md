# Legacy retirement implementation report

Source plan: `docs/plans/legacy-retirement/README.md`

Date: 2026-08-01

Commits: Task 01 `0aceb6c`; Task 02 `be4577e`; Task 03 pending

## Summary and files

Task 01 is complete. Task 02 observability is complete locally but production
rollout is partial. Task 03 now fixes mixed-case migration traversal and records
a fresh read-only census. Changed migration command/test, plan statuses,
register, census, and reports.

## Task status and deviations

- Completed: Task 01; Task 02 local observability; Task 03 census repair.
- Partial: Tasks 02 and 03.
- Not completed: default promotion, producer cutover, artifact dispositions,
  and Tasks 04–08.
- Deviation: no production artifact was moved.

## Checks and results

Focused migration test: 6 passed. Corrected dry-run: 184 candidates; 127
canonical, 1 safe, 14 identical, 42 divergent, 0 errors. No paid provider ran.

## Risks and next steps

Record operator dispositions, migrate only the safe candidate with rollback
evidence, and cut producers over before deleting readers.
