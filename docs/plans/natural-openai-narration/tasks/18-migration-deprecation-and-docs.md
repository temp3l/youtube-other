# Task 18: Migration, Deprecation, and Docs

## Objective

Finalize rollout documentation, compatibility cleanup criteria, and operator guidance.

## Rationale

Existing successful production workflows must continue during migration and have a clear rollback path.

## Current Relevant Files and Symbols

- `docs/architecture/episode-production-pipeline.md`
- `docs/architecture/story-localization.md`
- `docs/development/commands.md`
- `apps/cli/src/index.ts`: legacy command behavior.

## Exact Files Likely Modified or Created

- `docs/architecture/episode-production-pipeline.md`
- `docs/development/commands.md`
- `docs/plans/natural-openai-narration/13-implementation-roadmap.md`
- Potential CLI help snapshots/tests if added earlier.

## Dependencies

All implementation tasks.

## Implementation Steps

- Document `legacy`, `shadow`, and `new` modes.
- Document artifact paths and status commands.
- Add migration steps for already-generated episodes.
- Add rollback procedure.
- List obsolete code paths and deletion criteria.
- Update roadmap status if implementation changed task order.

## Types or Interfaces

No new production types unless implementation introduced names that need docs.

## Runtime Validation Requirements

Docs-only task; validate paths and command names against source.

## Error-Handling Behavior

Document expected operator responses to `BLOCKED`, partial failures, and fallback usage.

## Observability Requirements

Document log fields and quality-gate report locations.

## Performance Considerations

Document cache/resume cost controls.

## Security Considerations

Document that logs and reports must not include secrets or full story text.

## Test Requirements

Path existence checks and focused CLI help tests if help snapshots exist.

## Acceptance Criteria

Operators can enable, inspect, roll back, and deprecate the old path safely.

## Explicit Non-Goals

No production code changes except doc-linked command help fixes if tests require them.

## Rollback Considerations

Revert docs if feature rollout is abandoned.

## Recommended Minimum Model

GPT-5 mini.

## Recommended Best Model

GPT-5.

## Parallelization

Sequential; run after all implementation tasks.
