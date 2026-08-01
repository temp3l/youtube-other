# Legacy artifact migration census

Recorded: 2026-08-01

Source task: `docs/plans/legacy-retirement/tasks/task-03-stop-legacy-writes-and-migrate-artifacts.md`

## Scope and method

`planEpisodeLayoutMigration` scanned the current `episodes/` population in
dry-run mode. Generated output, state, media, transcript, log, and batch
directories were excluded by the planner. No file was moved or rewritten.

## Result

| Classification | Count | Disposition |
| --- | ---: | --- |
| Already canonical | 127 | Retain |
| Safe move | 1 | Await operator-approved migration |
| Identical duplicate | 14 | Retain read-only pending cleanup approval |
| Divergent duplicate | 42 | Operator-owned; never overwrite |
| Target collision | 0 | None |
| Stale/unsupported | 0 | None |
| Invalid | 0 | None |
| Filesystem error | 0 | None |

The sole safe move is
`episodes/026-bloody-mary-in-the-mirror/source/026-bloody-mary-in-the-mirror-en-full.md`
to `episodes/026-bloody-mary-in-the-mirror/languages/script-en.md`.

## Decision

This census does not authorize production-data mutation. Task 03 remains open
until the safe move and all duplicate candidates receive recorded operator
dispositions and active producers stop legacy-layout writes.
