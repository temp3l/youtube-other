# MICRO-021 YouTube microdrama coexistence projection

Date: 2026-08-12
Task: MICRO-021
Status: DONE

## Summary

Added YouTube locale metadata revisions, series/playlist projection, coexistence adapter into provider-free `YoutubePublicationIntent`, application orchestration service, and fake-executor tests reusing embedded publication-domain safety.

## Changed paths

- `packages/metadata/src/microdrama-youtube-locale-metadata.ts`
- `packages/youtube-upload/src/microdrama-youtube-coexistence.ts`
- `packages/application/src/microdrama-youtube-coexistence-service.ts`
- `packages/youtube-upload/src/microdrama-youtube-coexistence.unit.test.ts`
- `vitest.unit.config.ts`
- `docs/tasks/microdrama/implementation-backlog.json`

## Validation

- `pnpm exec vitest run -c vitest.unit.config.ts packages/youtube-upload/src/microdrama-youtube-coexistence.unit.test.ts` — 5 passed

## Risks

- YouTube export approval still flows through the TikTok-named revision schema until a provider-specific approval task lands.

## Backlog

- MICRO-021 → DONE
- MICRO-022, MICRO-025, MICRO-030 remain READY
