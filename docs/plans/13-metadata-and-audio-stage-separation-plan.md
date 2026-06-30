# Task 13: Metadata And Audio Stage Separation Plan

## 1. Scope And Non-Goals

Scope:

- Separate metadata and audio instructions from full and short narration generation.
- Make metadata and audio independent artifact owners by language, locale, and variant.
- Preserve compatibility readers for legacy rendered Markdown that includes metadata or audio sections.
- Ensure metadata/audio failures do not invalidate validated narration.

Non-goals:

- Do not redesign scene, image, render, thumbnail, or publication stages; Task 14 owns those.
- Do not change CLI command names, artifact paths, provider routing, or `.env` precedence.
- Do not replace prompt compiler, short contract, lineage, or validation abstractions from Tasks 08-12.
- Do not make paid API calls.

## 2. Confirmed Repository Findings

- `story-artifact-model.ts` already lists artifact owners including `narration`, `metadata`, `audio`, `scene-plan`, `image-plan`, `render`, and `publication`.
- `story-prompt-compiler.ts` rejects prompt modules whose owner is not `narration`.
- Legacy `story-localization.schemas.ts` full and short shapes include metadata/audio/visual fields in older mixed response schemas.
- `canonical-full-story.persistence.ts` persists canonical English full narration as a first-class artifact and renders compatibility Markdown.
- `short-rewrite.prompt.ts` imports audio-template helpers, which is a leakage risk for short narration prompts.
- Audio generation is currently orchestrated through `apps/cli/src/index.ts`, `packages/speech`, `packages/pipeline`, and legacy `packages/dark-truth`.
- YouTube metadata generation is owned by `packages/metadata`.

## 3. Dependencies And Assumptions From Tasks 08-10

- Task 08 provides validated localized full narration artifacts.
- Task 09 provides short contracts derived from validated full narration.
- Task 10 provides validated short narration artifacts and short prompt compiler behavior.
- Final narration artifact paths and schemas must be verified after Task 10 before metadata/audio dependency records are finalized.

## 4. Target Architecture And Ownership

- Narration artifacts contain narration-only model outputs and validation metadata.
- Metadata artifacts depend on validated narration, language, locale, variant, and optional full-video linkage for shorts.
- Audio instruction artifacts depend on validated narration and voice/speech configuration, not prompt diagnostics.
- TTS artifacts depend on audio instructions or narration chunks plus speech model/voice config.
- Metadata model/config is used for metadata; speech model/voice config is used for audio; story and short narration config must not be used except through a documented and tested fallback.

## 5. File-By-File Change Plan

- `packages/story-localization/src/story-prompt-compiler.ts`: add/verify tests that narration prompts exclude metadata, audio, thumbnails, render instructions, tags, hashtags, and visual instructions.
- `packages/story-localization/src/short-rewrite.prompt.ts`: remove audio-template dependency from short narration prompt construction after confirming Task 10 compiler path.
- `packages/story-localization/src/story-prompt-modules.ts` and registry: ensure any metadata/audio modules are not eligible for narration compilation.
- `packages/story-localization/src/story-markdown-renderer.ts`: preserve legacy compatibility rendering while keeping canonical narration artifacts clean.
- `packages/metadata/src/youtube-metadata.ts`: plan metadata artifact inputs by language/locale/variant and full-video linkage for shorts.
- `packages/speech/src/*` and `apps/cli/src/index.ts`: plan audio instruction/TTS ownership by language/locale/variant without moving CLI commands.
- Tests: add prompt exclusion, failure isolation, and short metadata dependency tests.

## 6. Compatibility And Migration

- Continue reading legacy Markdown sections for downstream commands while writing new canonical narration artifacts without metadata/audio sections.
- Keep current metadata and audio output paths readable.
- Add adapters rather than hard-cutting consumers from legacy fields.
- Do not let metadata/audio validation status affect narration validation status.

## 7. Tests And Verification Commands

- `pnpm test:unit -- packages/story-localization/src/story-prompt-compiler.unit.test.ts`
- `pnpm test:unit -- packages/story-localization/src/short-rewrite.unit.test.ts`
- `pnpm test:unit -- packages/metadata/src/youtube-metadata.unit.test.ts`
- `pnpm test:unit -- packages/speech/src/script-markdown.unit.test.ts`
- `pnpm test:unit -- apps/cli/src/index.unit.test.ts`

## 8. Ordered Implementation Steps

1. Verify Task 10 final narration artifact schemas and prompt compiler paths.
2. Add tests proving narration prompts exclude metadata/audio/visual/render/publication content.
3. Remove short prompt audio-template leakage and route any needed audio content to an audio-owned adapter.
4. Define metadata artifact dependencies on validated narration by language, locale, and variant.
5. Define audio instruction and TTS artifact dependencies on validated narration by language, locale, variant, and speech config.
6. Add compatibility readers/adapters for legacy Markdown metadata/audio sections.
7. Add failure-isolation tests so metadata/audio failures do not invalidate narration.

## 9. Risks

- Legacy media commands may still parse metadata/audio from rendered Markdown; adapters must be in place before clean artifacts become canonical.
- Metadata fallback to story model could reintroduce prompt leakage; require documented fallback tests if retained.
- Audio instructions can be confused with narration instructions; keep artifact owners explicit.

## 10. Acceptance Criteria

- Metadata and audio are independent artifact owners.
- Full and short variants have separate metadata and audio outputs.
- No narration model receives metadata or audio instructions.
- Metadata failure does not invalidate narration.
- Audio failure does not invalidate metadata or narration.

## 11. Post-Task-10 Verification Checklist

- Confirm final canonical full and short narration artifact paths.
- Confirm final short prompt compiler excludes metadata/audio sections.
- Confirm final short contract does not encode audio or metadata ownership.
- Confirm final manifest fields for language, locale, variant, and parent full linkage.
- Confirm compatibility renderer behavior for legacy Markdown consumers.
