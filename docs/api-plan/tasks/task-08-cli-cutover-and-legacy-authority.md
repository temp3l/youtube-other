# Task 08: CLI Cutover And Legacy Authority

## Objective

Make connected CLI commands thin adapters to the same application layer as the API while preventing dual writers.

## Scope

- migrate read/plan/status/create first, then generation/render/approval by characterized command family
- preserve documented stdout, stderr, exit codes, and normalized outcomes
- mark every mutable aggregate and workflow instance `filesystem-legacy` or `database-v1`
- reject wrong-authority writes and make compatibility JSON projection-only
- retain read-only importers and a new-instance rollback switch for one release window

## Tests And Verification

Run focused command tests and the relevant packaged CLI help/smoke checks; do not run the entire repository suite.

## Acceptance Criteria

Connected CLI and API mutations use the same database revision checks and handlers, and no migrated command assembles repositories or workflow logic itself.
