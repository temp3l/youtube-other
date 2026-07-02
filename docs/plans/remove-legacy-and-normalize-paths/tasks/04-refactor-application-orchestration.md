# Task 04: Refactor Application Orchestration

## Objective

Create the stable application boundary between CLI/API/workers and low-level services.

## Background

CLI and `@mediaforge/dark-truth` currently call low-level scene, image, audio, and render helpers directly.

## Scope

Introduce typed use cases for full-video and Short setup paths and route active commands through them.

## Expected files

- `apps/cli/src/episode-commands.ts`
- `apps/cli/src/index.ts`
- candidate new app-use-case module under `packages/dark-truth` or a new package

## Procedure

1. Define use-case inputs: episode, language, variant, dry-run, validation-only, force/resume.
2. Resolve scripts centrally inside use cases.
3. Move sequencing out of CLI handlers.
4. Keep low-level package APIs focused on domain/infrastructure work.

## Safety constraints

Do not remove old functions until parity tests pass.

## Validation

```bash
pnpm test:focused -- apps/cli/src/episode-commands.unit.test.ts
pnpm test:focused -- apps/cli/src/index.unit.test.ts
```

## Completion checklist

- [ ] CLI calls typed use cases
- [ ] no CLI-local script path construction
- [ ] full and Short setup parity proven

## Dependencies

Task 03.

## Batching

Do not batch with legacy deletion.
