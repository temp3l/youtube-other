# MICRO-025 TikTok locale metadata projection

Date: 2026-08-12
Task: MICRO-025
Status: DONE

## Summary

Added revision-bound TikTok metadata contracts with separate editorial and provider-policy fields, provenance-derived AI/commercial disclosure validation, locale editorial projection for four V5 locales, and a new `@mediaforge/tiktok-publishing` orchestration package.

## Changed paths

- `packages/domain/src/tiktok-metadata-contracts.ts`
- `packages/domain/src/tiktok-metadata-lifecycle.ts`
- `packages/metadata/src/tiktok-locale-metadata.ts`
- `packages/tiktok-publishing/**`
- `vitest.unit.config.ts`
- `docs/tasks/microdrama/implementation-backlog.json`

## Validation

- `pnpm exec vitest run -c vitest.unit.config.ts --bail=1 packages/tiktok-publishing/src/locale-metadata-projection.unit.test.ts` — 7 passed

## Risks

- Metadata subpath export requires package build for non-vitest consumers until dist artifacts exist.

## Backlog

- MICRO-025 → DONE
- MICRO-027, MICRO-049 remain blocked on other dependencies
