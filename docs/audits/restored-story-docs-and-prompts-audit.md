# Restored Story Docs And Prompts Audit

Date: 2026-06-29

Scope:

- `docs/templates/audio/system-prompt.md`
- `docs/templates/audio/short-story-prompt.md`
- `docs/templates/audio/full-story-prompt.md` because validation showed the restored prompt set was still missing this runtime dependency
- `docs/multilingual-story-localization-settings.md`
- `docs/cli.md`

Source-of-truth implementation reviewed:

- Prompt loaders: `packages/story-localization/src/prompt-template-loader.ts`, `localization-prompt-builder.ts`, `short-rewrite.prompt.ts`
- Runtime TTS: `packages/speech/src/index.ts`, `packages/speech/src/voice-settings.ts`
- Language support: `packages/story-localization/src/story-localization.types.ts`, `language-profiles.ts`, `short-rewrite.constants.ts`
- StoryIR and contracts: `story-artifact-model.ts`, `full-story-contract.ts`, `genre-policy.ts`, `stable-json.ts`
- Localization and short rewrite services: `story-localization.service.ts`, `short-rewrite.service.ts`, `short-rewrite.persistence.ts`, `story-localization-cache.ts`
- CLI registration: `apps/cli/src/index.ts`, `story-localization-commands.ts`, `story-full-rewrite-command.ts`, `story-short-rewrite-command.ts`, `episode-commands.ts`
- Runtime config: `packages/config/src/index.ts`

## File Status

| File                                               | Status before update                                                                                                                                                                                                                     | Status after update                                                                                                                              |
| -------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| `docs/templates/audio/system-prompt.md`            | Partially stale and misleading. Runtime story prompt was in a legacy `audio` directory and did not mention StoryIR/full-contract/genre-policy boundaries or separate TTS responsibilities.                                               | Current as a story-rewrite system prompt loaded from a legacy path. It explicitly excludes TTS, metadata, image, scene, render, and upload work. |
| `docs/templates/audio/short-story-prompt.md`       | Partially stale. It was consumed by short rewrite but did not state that it is not a TTS prompt and did not clearly exclude metadata/image/scene/audio-production outputs.                                                               | Current for the implemented short-rewrite flow. It preserves the existing variables and structured output contract.                              |
| `docs/templates/audio/full-story-prompt.md`        | Obsolete by absence. The loader referenced it, but the active file was missing.                                                                                                                                                          | Restored as a full-story rewrite template aligned with the current response schema and supplied compiler variables.                              |
| `docs/multilingual-story-localization-settings.md` | Partially stale. Language style sections were usable, but integration notes claimed broader locale variants and omitted canonical source/materialized artifact, cache/resume, StoryIR, full-contract, model config, and repair behavior. | Current for implemented language sections and runtime integration.                                                                               |
| `docs/cli.md`                                      | Partially stale. It mixed a small command sample set with outdated or incomplete command inventory and omitted several registered commands/options.                                                                                      | Rebuilt from actual Commander registration and root scripts.                                                                                     |

## Stale Findings

- `docs/templates/audio/system-prompt.md` described a generic multilingual horror writer and localization editor but was not accurate about the Task 04 contract surface. Evidence: `localization-prompt-builder.ts` and `short-rewrite.prompt.ts` load it for full and short story prompts; `packages/speech` does not load it.
- The `docs/templates/audio` directory name suggested TTS-stage prompts. Evidence: TTS loads `docs/voice-settings.md` through `packages/speech/src/voice-settings.ts`, while story rewrite loads `docs/templates/audio/*.md` through `loadAudioTemplate`.
- `docs/templates/audio/short-story-prompt.md` was correctly consumed by `buildShortRewritePrompt`, but it did not explicitly prevent metadata, image, scene, SSML, voice, or audio-generation work.
- `docs/templates/audio/full-story-prompt.md` was still missing. Evidence: `buildLocalizationPrompt` calls `loadAudioTemplate("full-story-prompt.md")`, and the first targeted validation run failed with `ENOENT`.
- `docs/multilingual-story-localization-settings.md` included `en-GB`, `es-ES`, and `pt-PT` integration guidance, but implemented default profiles are `en-US`, `de-DE`, `es-419`, `fr-FR`, and `pt-BR`. Evidence: `LANGUAGE_PROFILES` and `SHORT_REWRITE_SUPPORTED_LANGUAGES`.
- Localization docs did not document that canonical source language is English and that non-English full stories are generated from canonical English/materialized source, not directly from arbitrary original-source language.
- Localization docs did not document StoryIR fields or Task 04 contract envelope fields such as policy registry version, genre policy version, serializer version, hashes, and build fingerprint.
- Localization docs did not document actual resume state: `.localization-cache` for full localization and `manifests/short-rewrite-manifest.json` for short rewrite.
- `docs/cli.md` omitted many registered commands: `stories localize`, `stories:batches`, top-level `transcript`, `clips`, `render remote`, `metadata`, `db`, and most `episode` review/production commands.
- `docs/cli.md` did not clearly state singular `episode` as canonical and `episodes` as compatibility alias.
- `docs/cli.md` documented only a narrow story workflow and did not reflect command-specific flags from `story-full-rewrite-command.ts` and `story-short-rewrite-command.ts`.
- `docs/cli.md` hard-coded sample model behavior indirectly by omission; updated docs point to config keys instead of prescribing model names.

## Changes Made

- Updated `docs/templates/audio/system-prompt.md` to state its legacy path, actual story-rewrite role, StoryIR/full-contract preservation responsibilities, genre-policy boundaries, strict schema output, and non-responsibility for TTS/metadata/image/render/upload.
- Updated `docs/templates/audio/short-story-prompt.md` to state it is short-story rewrite input, not a TTS prompt, and to exclude metadata, tags, scene plans, image prompts, captions, SSML, voice settings, and production notes.
- Added `docs/templates/audio/full-story-prompt.md` so the full-story prompt loader works and the template matches variables supplied by `buildLocalizationPrompt`.
- Updated `docs/multilingual-story-localization-settings.md` top-level runtime notes and integration requirements while preserving the per-language style sections consumed by the loader.
- Rebuilt `docs/cli.md` from registered commands and package scripts, including current story, batch, episode, image, audio, metadata, render, upload, config, artifact, state, and telemetry behavior.
- Added tests for runtime docs/prompt assumptions:
  - `packages/story-localization/src/multilingual-story-localization-settings.unit.test.ts`
  - `packages/story-localization/src/short-rewrite.unit.test.ts`
  - `packages/story-localization/src/story-localization.unit.test.ts`
  - `apps/cli/src/story-localization-commands.unit.test.ts`

## Compatibility Implications

- No runtime behavior was changed.
- Existing prompt file paths remain unchanged for backward compatibility.
- The misleading `docs/templates/audio` directory name remains because renaming would require coordinated loader, tests, and docs changes beyond this audit.
- Public CLI examples now prefer `episode`, not `episodes`, while acknowledging the compatibility alias.
- Short rewrite continues to support `--compatibility-source` for raw source markdown; docs present canonical validated full-story input as the default.

## Intentionally Deferred

- Rename `docs/templates/audio` to a story-prompt-specific directory. This is a cleanup task, not required for Tasks 01-04 compatibility.
- Redesign provenance or expand StoryIR. Explicitly out of scope.
- Add new language support beyond `en`, `de`, `es`, `fr`, `pt`.
- Merge story, localization, metadata, audio, image, render, or upload stages.
- Implement Task 05 behavior.

## Verification Results

Commands run:

- `pnpm exec prettier --write docs/templates/audio/system-prompt.md docs/templates/audio/short-story-prompt.md docs/multilingual-story-localization-settings.md docs/cli.md docs/audits/restored-story-docs-and-prompts-audit.md packages/story-localization/src/multilingual-story-localization-settings.unit.test.ts packages/story-localization/src/short-rewrite.unit.test.ts packages/story-localization/src/story-localization.unit.test.ts apps/cli/src/story-localization-commands.unit.test.ts`
- `pnpm exec vitest run -c vitest.unit.config.ts packages/story-localization/src/multilingual-story-localization-settings.unit.test.ts packages/story-localization/src/short-rewrite.unit.test.ts packages/story-localization/src/story-localization.unit.test.ts packages/story-localization/src/full-story-contract.unit.test.ts packages/story-localization/src/genre-policy.unit.test.ts packages/story-localization/src/stable-json.unit.test.ts packages/story-localization/src/story-artifact-model.unit.test.ts apps/cli/src/story-localization-commands.unit.test.ts apps/cli/src/story-short-rewrite-command.unit.test.ts apps/cli/src/story-full-rewrite-command.unit.test.ts apps/cli/src/images-resume-command.unit.test.ts` failed initially because `full-story-prompt.md` was missing and one assertion expected literal `SSML` to be absent while the prompt forbids it.
- `pnpm exec prettier --write docs/templates/audio/full-story-prompt.md packages/story-localization/src/short-rewrite.unit.test.ts`
- `pnpm exec vitest run -c vitest.unit.config.ts packages/story-localization/src/multilingual-story-localization-settings.unit.test.ts packages/story-localization/src/short-rewrite.unit.test.ts packages/story-localization/src/story-localization.unit.test.ts packages/story-localization/src/full-story-contract.unit.test.ts packages/story-localization/src/genre-policy.unit.test.ts packages/story-localization/src/stable-json.unit.test.ts packages/story-localization/src/story-artifact-model.unit.test.ts apps/cli/src/story-localization-commands.unit.test.ts apps/cli/src/story-short-rewrite-command.unit.test.ts apps/cli/src/story-full-rewrite-command.unit.test.ts apps/cli/src/images-resume-command.unit.test.ts` failed once more because a retry fixture reached source-cleaning persistence after the missing prompt was fixed.
- `pnpm exec prettier --write packages/story-localization/src/story-localization.unit.test.ts`
- `pnpm exec vitest run -c vitest.unit.config.ts packages/story-localization/src/story-localization.unit.test.ts` passed: 32 tests.
- `pnpm exec vitest run -c vitest.unit.config.ts packages/story-localization/src/multilingual-story-localization-settings.unit.test.ts packages/story-localization/src/short-rewrite.unit.test.ts packages/story-localization/src/story-localization.unit.test.ts packages/story-localization/src/full-story-contract.unit.test.ts packages/story-localization/src/genre-policy.unit.test.ts packages/story-localization/src/stable-json.unit.test.ts packages/story-localization/src/story-artifact-model.unit.test.ts apps/cli/src/story-localization-commands.unit.test.ts apps/cli/src/story-short-rewrite-command.unit.test.ts apps/cli/src/story-full-rewrite-command.unit.test.ts apps/cli/src/images-resume-command.unit.test.ts` passed: 11 test files, 115 tests.
- `pnpm exec eslint packages/story-localization/src/multilingual-story-localization-settings.unit.test.ts packages/story-localization/src/short-rewrite.unit.test.ts packages/story-localization/src/story-localization.unit.test.ts apps/cli/src/story-localization-commands.unit.test.ts` passed.

Manual checks performed:

- Every restored prompt variable remains supplied by its caller.
- `system-prompt.md` is loaded by story prompt builders, not by speech/TTS.
- `short-story-prompt.md` variables match `buildShortRewritePrompt`.
- Supported language list matches `languageCodes`, `LANGUAGE_PROFILES`, short-rewrite constants, and schemas.
- Documented story artifact paths match `resolveEpisodeStoryOutputFiles` and `resolveShortRewriteOutputPaths`.
- Documented model/environment keys exist in `packages/config/src/index.ts`.
- Documented story and batch command names map to registered Commander commands.

## Unresolved Risks

- The legacy `docs/templates/audio` path remains confusing and may invite future TTS/prompt conflation.
- `docs/cli.md` is now broad but still manually maintained; future command registration changes should update docs and tests together.
- Some lower-level command defaults are computed in service/config code rather than Commander, so docs intentionally avoid listing every computed default.

## Task 05 Readiness

Repository is safe to continue with Task 05 based on the passing targeted validation above. This audit did not implement Task 05.
