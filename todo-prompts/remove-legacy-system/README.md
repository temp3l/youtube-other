# Remove Legacy and Normalize Paths — Codex Execution Pack

This pack contains implementation prompts for the tasks under:

```text
docs/plans/remove-legacy-and-normalize-paths/
```

## Recommended execution order

| Wave |        Tasks | Prompt file                                        | Safety                                  |
| ---- | -----------: | -------------------------------------------------- | --------------------------------------- |
| 1    |           01 | `01-task-01-characterization-tests.md`             | Isolated safety net                     |
| 2    |        02–03 | `02-tasks-02-03-types-and-resolver.md`             | Safe combined foundation                |
| 3    |           04 | `03-task-04-application-orchestration.md`          | Isolated architecture change            |
| 4    |           05 | `04-task-05-entry-points.md`                       | Isolated runtime migration              |
| 5    |           06 | `05-task-06-cache-identity.md`                     | Cross-package, package-by-package       |
| 6    |           07 | `06-task-07-migration-tool.md`                     | Tool only; no repository writes         |
| 7    |           08 | `07-task-08-migrate-episodes.md`                   | Isolated, human-review gate             |
| 8    | 09 + 10 + 16 | `08-tasks-09-10-16-pipeline-removal.md`            | Safe only after approval/import cleanup |
| 9    | 11 + 12 + 13 | `09-tasks-11-12-13-generation-shared-contracts.md` | Phased deletion/classification          |
| 10   |           14 | `10-task-14-persistence.md`                        | Isolated; no data deletion              |
| 11   |           15 | `11-task-15-legacy-config.md`                      | Isolated rollout decision               |
| 12   |      17 + 18 | `12-tasks-17-18-tests-and-docs.md`                 | Safe cleanup batch                      |
| 13   |           19 | `13-task-19-remove-compatibility.md`               | Isolated after migration                |
| 14   |           20 | `14-task-20-final-validation.md`                   | Final gate only                         |

## Important sequencing notes

- Do not run Task 08 in the same Codex session as Task 07. Review the dry-run report first.
- Do not run Tasks 09/10/16 until active entry points have migrated and public command removal is approved.
- Task 14 must never drop or migrate production data automatically.
- Task 15 requires the narration rollout decision.
- Task 19 must wait until repository episodes and fixtures are canonical.
- Task 20 must contain no feature work.

## Model strategy

- **GPT-5.5:** orchestration, resolver design, cache identity, destructive cleanup, migration execution, and final validation.
- **GPT-5.4:** focused TypeScript implementation with a clear task specification.
- **GPT-5.4 mini:** characterization tests and straightforward test/documentation cleanup.
- Avoid weaker models for Tasks 04, 06, 08, 09/10/16, 19, and 20 because mistakes can silently break active pipelines or delete still-used code.
