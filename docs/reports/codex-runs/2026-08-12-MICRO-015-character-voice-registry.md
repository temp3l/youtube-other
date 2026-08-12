# MICRO-015 character voice registry

Date: 2026-08-12
Task: MICRO-015
Status: DONE

## Goal

Persist stable character/narrator voice profiles by locale with immutable versioned
provider intent, pronunciation revisions, and consent references.

## Files changed

- `packages/narrative-core/src/voice-registry.ts`
- `packages/narrative-core/src/voice-registry.unit.test.ts`
- `packages/narrative-core/src/revision.ts`
- `packages/narrative-core/src/validators.ts`
- `packages/narrative-core/src/index.ts`
- `packages/persistence/src/character-voice-persistence-port.ts`
- `packages/persistence/src/character-voice-sqlite-schema.ts`
- `packages/persistence/src/character-voice-sqlite-repository.ts`
- `packages/persistence/src/character-voice-sqlite-repository.integration.test.ts`
- `packages/persistence/src/index.ts`
- `packages/speech/src/character-voice-registry.ts`
- `packages/speech/src/character-voice-registry.unit.test.ts`
- `packages/speech/src/index.ts`
- `packages/speech/package.json`
- `vitest.integration.config.ts`
- `vitest.unit.config.ts`
- `docs/tasks/microdrama/implementation-backlog.json`

## Validation

- `pnpm test:focused -- packages/narrative-core/src/voice-registry.unit.test.ts` — 3 passed
- `pnpm test:focused -- packages/persistence/src/character-voice-sqlite-repository.integration.test.ts` — 3 passed
- `pnpm test:focused -- packages/speech/src/character-voice-registry.unit.test.ts` — 3 passed

## External calls

None.

## Backlog

- MICRO-015 → DONE

## Risks

- Provider voice binding remains `unbound` until a later canary records evidence.
- Locale slug normalization uses lowercase BCP-47 in profile IDs.

## Checkpoint

Pending commit.
