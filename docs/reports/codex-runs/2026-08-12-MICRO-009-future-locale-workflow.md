# MICRO-009 future-locale generation and admission workflow

Date: 2026-08-12
Task: MICRO-009
Status: DONE

## Goal

Support new locale drafts without changing imported V5 revisions via glossary-bound generation, deterministic QA, semantic parity, and explicit ScriptRevision admission.

## Files changed

- `packages/story-localization/src/future-locale-contracts.ts`
- `packages/story-localization/src/future-locale-admission.ts`
- `packages/story-localization/src/future-locale-admission.unit.test.ts`
- `packages/story-localization/src/index.ts`
- `docs/tasks/microdrama/implementation-backlog.json`

## Validation

- `pnpm test:focused -- packages/story-localization/src/future-locale-admission.unit.test.ts` — 5 passed

## External calls

None (mock generation adapter only).

## Backlog

- MICRO-009 → DONE

## Risks

- Full V5 pack admission fixtures remain in MICRO-008; future-locale unit tests use minimal in-memory canon/production fixtures.
