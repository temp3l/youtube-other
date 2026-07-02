# Task 15: Remove Legacy Configuration

## Objective

Remove legacy-only configuration keys and defaults.

## Background

`narrationPipelineMode` defaults to `legacy`; legacy OpenAI aliases and old path flags may remain.

## Scope

Config schemas, `.env.example`, docs, CLI globals.

## Expected files

- `packages/config/src/index.ts`
- `.env.example`
- `apps/cli/src/index.ts`
- docs

## Procedure

1. Identify config keys used only by removed legacy code.
2. Remove or deprecate with explicit release decision.
3. Make staged narration the only production mode after rollout.

## Safety constraints

Do not remove secrets or provider config still used by active packages.

## Validation

```bash
pnpm test:focused -- packages/config/src/index.unit.test.ts
rg "NARRATION_PIPELINE_MODE|legacy" packages/config apps docs .env.example
```

## Completion checklist

- [ ] legacy defaults gone
- [ ] active provider config preserved
- [ ] docs match config

## Dependencies

Tasks 06, 11, and human rollout decision.

## Batching

Do not batch with first narration migration.
