# API durable continuation

## Summary

Added strict persisted workflow dispatch and execution controls; initial Dark Truth story/localization bindings; immutable webhook subjects; atomic workflow/provider quotas; asset-migration and channel-lease persistence; evidence-backed release gates; stricter API auth/math validation; SDK compatibility checks; and connected API CLI commands.

## Changed paths

- `apps/{api,cli}/`
- `packages/{api-sdk,application,dark-truth,persistence,workflow-engine}/`
- `docs/{api-plan/PLAN-STATUS.md,development/configuration.md}`
- This report

## Tests and checks

- Affected seven-package topological build: passed.
- Focused unit suite: 19 files, 126 tests passed.
- HTTP integration: 14 tests passed.
- Agent-focused persistence/application/SDK/CLI checks: passed.
- Dark Truth adapter build passed; its focused test timed out during repair and was not rerun after the bounded retry limit.
- `git diff --check`: passed before documentation updates.

## Commit

`HEAD` (commit containing this report).

## Unresolved risks

Remaining media/math bindings, production worker composition, live PostgreSQL/provider drills, IdP/KMS/S3 decisions, YouTube recovery evidence, and external pilot approval remain open. Upload/public transfer mutations remain disabled.
