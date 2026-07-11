# Codex Run: Episode 035 Production Validation

## Summary

Repaired full-story validation and canonical layout handling, then completed the
English full rewrite by resuming its canonical cache with zero new tokens. The
English short made direct initial and repair Responses API calls but remained
invalid, so no audio or image generation was started.

## Changed Paths

`apps/cli/src/story-full-rewrite-command.ts`, `packages/shared/src/episode-filesystem.ts`,
`packages/story-localization/src/generated-story-validator.ts`, their focused
unit tests, package build outputs, and episode 035 derived state/debug files.

## Tests

Focused validator and resolver tests passed. `@mediaforge/shared`,
`@mediaforge/story-localization`, `@mediaforge/image-generation`, and
`@mediaforge/cli` builds passed. Production status reports English full rewrite,
validation, and quality completed. No Batch API request was made.

## Risks

Short repair failed its hard 150-170 word range and short-quality contract checks.
The legacy `episode validate` command does not yet accept canonical-full manifests.
Audio/images remain intentionally unrun until short validation is corrected.
