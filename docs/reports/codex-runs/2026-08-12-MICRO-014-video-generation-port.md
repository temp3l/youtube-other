# MICRO-014 provider-neutral video generation port

Date: 2026-08-12
Task: MICRO-014
Status: DONE

## Goal

Model optional generated video clips without choosing or calling a live provider.

## Files changed

- `packages/video-generation/package.json`
- `packages/video-generation/tsconfig.json`
- `packages/video-generation/src/contracts.ts`
- `packages/video-generation/src/cache-key.ts`
- `packages/video-generation/src/approval-policy.ts`
- `packages/video-generation/src/cost-policy.ts`
- `packages/video-generation/src/effect-reconciliation.ts`
- `packages/video-generation/src/fake-adapter.ts`
- `packages/video-generation/src/microdrama-video-port.ts`
- `packages/video-generation/src/index.ts`
- `packages/video-generation/src/microdrama-video-port.unit.test.ts`
- `vitest.unit.config.ts`
- `docs/tasks/microdrama/implementation-backlog.json`

## Validation

- `pnpm test:focused -- packages/video-generation/src/microdrama-video-port.unit.test.ts` — 6 passed

## External calls

None.

## Backlog

- MICRO-014 → DONE

## Risks

- Provider adapters and workflow task registration remain future work.
- Approval gate uses existing `render-qa` scope until a dedicated asset-generation gate lands in domain.
