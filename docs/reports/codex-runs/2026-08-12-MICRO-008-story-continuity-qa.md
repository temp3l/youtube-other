# MICRO-008 story continuity and locale parity QA

Date: 2026-08-12
Task: MICRO-008
Status: DONE

## Goal

Fail closed on canon, boundary, locale parity and season finale obligations; grant `STORY_APPROVED` only for exact script revisions.

## Files changed

- `packages/microdrama/src/v5-story-qa-contracts.ts`
- `packages/microdrama/src/v5-story-qa.ts`
- `packages/microdrama/src/v5-story-approval.ts`
- `packages/microdrama/src/v5-story-qa.unit.test.ts`
- `packages/microdrama/src/index.ts`
- `docs/tasks/microdrama/implementation-backlog.json`

## Validation

- `pnpm test:focused -- packages/microdrama/src/v5-story-qa.unit.test.ts` — 5 passed

## External calls

None.

## Backlog

- MICRO-008 → DONE
- MICRO-009, MICRO-012, MICRO-044, MICRO-045 → READY

## Risks

- Package `typecheck` still reports pre-existing cross-package resolution errors unrelated to this task.
