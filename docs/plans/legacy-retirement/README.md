# Legacy Retirement Plan

## Purpose

Retire the compatibility surfaces that intentionally remained after
`docs/plans/remove-legacy-and-normalize-paths/` completed. This is not a
big-bang deletion. Each task moves one authority or consumer to the canonical
path, proves the removal gate, and preserves rollback until the support window
closes.

## Governing policy

- New production attempts write only canonical artifacts.
- Legacy artifacts may be read only through named, versioned adapters.
- Conflicting canonical and legacy artifacts fail closed.
- A command or store has one writable authority per workflow instance.
- Publishing requires approval-bound, checkpointed execution.
- Compatibility is removed only with observed evidence, not repository search
  alone.

## Scope

The plan covers the remaining active compatibility identified after the prior
cleanup:

- `legacy|shadow|new` narration rollout and monolithic audio generation;
- root and alternate narration compatibility outputs used by render/operator
  paths;
- legacy artifact layouts and generated story/image compatibility writes;
- the active `uploadYoutubeEpisode` publishing route;
- legacy math simulation and CLI/package compatibility callers;
- legacy shot/layout migration readers and response normalization adapters.

Historical documentation and deliberately import-only formats are not removed
until their declared support windows close.

## Task order

| Task | Outcome | Depends on | Status |
| --- | --- | --- | --- |
| [01](tasks/task-01-inventory-owners-and-removal-gates.md) | Every compatibility surface has an owner, evidence source, and removal gate | None | Complete |
| [02](tasks/task-02-promote-staged-narration.md) | Staged narration becomes the production default with a bounded rollback window | 01 | In progress |
| [03](tasks/task-03-stop-legacy-writes-and-migrate-artifacts.md) | Producers write canonical artifacts only; existing artifacts have migration dispositions | 01 | In progress |
| [04](tasks/task-04-cut-over-downstream-media-consumers.md) | Render, status, and operator paths consume canonical staged artifacts | 02, 03 | Blocked by dependencies |
| [05](tasks/task-05-cut-over-youtube-publishing.md) | CLI publishing uses the approval-bound, checkpointed publisher | 01 | Ready |
| [06](tasks/task-06-cut-over-remaining-callers-and-authorities.md) | Math and other compatibility callers delegate to one canonical workflow authority | 01 | Ready |
| [07](tasks/task-07-remove-legacy-adapters-and-configuration.md) | Expired modes, paths, adapters, and migration tools are deleted | 02–06 | Blocked by dependencies |
| [08](tasks/task-08-final-retirement-evidence.md) | Removal is supported by focused checks, migration evidence, and release notes | 07 | Blocked by dependency |

Tasks 02, 03, 05, and 06 may be implemented independently after Task 01 if
their files do not overlap. Tasks 07 and 08 are sequential final gates.

## Global constraints

- Do not delete production episode or lesson data automatically.
- Do not weaken ambiguity, provenance, approval, or checksum validation to make
  migration pass.
- Run focused tests first and follow the repository verification budget.
- Paid-provider and real publishing checks require explicit human approval.
- After implementing any task, create the plan implementation report required
  by `AGENTS.md`.

## Completion definition

The plan is complete when new writes are canonical, every active consumer uses
canonical artifacts and workflow state, legacy publishing and generation paths
have no callers, support windows have closed, and remaining `legacy` references
are classified as historical data/schema imports or explicit false positives.
