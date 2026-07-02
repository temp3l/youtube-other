# Story Prompt Compiler

Task 05 introduces a typed modular compiler for story-rewrite prompts in `packages/story-localization/src/story-prompt-*.ts`.

## Scope

- Owns narration-stage prompt compilation only.
- Supports shared module selection for full-story and short-story rewrite prompts.
- Keeps provider transport, model selection, retry policy, and `.env` precedence outside the compiler.
- Applies the persisted character rename contract before model-facing source, fact, and StoryIR content is rendered.

## Module model

Each prompt module declares:

- stable `id`
- semantic `semanticVersion`
- stage owner
- supported variants
- applicability logic
- dependencies and conflicts
- deterministic `order`
- deterministic rendering
- fingerprint contribution

Only `owner: "narration"` modules can be compiled. Cross-owner content such as metadata, audio/TTS, image, scene, render, and publication instructions is rejected before any provider request is built.

## Pipeline

The compiler follows a fixed order:

1. input validation
2. StoryIR construction and validation
3. full-story contract validation for full variants
4. genre-policy resolution
5. deterministic character pseudonymization
6. locale resolution
7. conditional module evaluation
8. ownership, dependency, and conflict checks
9. universal-rule deduplication
10. deterministic module ordering
11. rendering
12. response schema attachment
13. prompt fingerprint calculation
14. diagnostics emission

The same semantic inputs must produce the same prompt bytes and fingerprint unless a declared semantic version changes.

## Response schemas

- Full-story rewrite now uses a narration-only schema descriptor in `story-prompt-response-schemas.ts`.
- Renderer compatibility metadata is supplied through `adaptNarrationOnlyFullToLegacyRendererPackage()`, not by broadening the provider narration contract.
- Short-story rewrite continues to use the strict structured short schema, now attached through the same compiler framework.

## Fingerprints

Prompt fingerprints are deterministic hashes over semantic inputs including:

- compiler version
- selected module ids and versions
- locale id and locale module version
- genre policy id and version
- classification outcome
- full-story contract fingerprint when present
- character rename map hash
- response schema name, version, and fingerprint
- source hash and source-cleaning fingerprint when present
- output constraints

Short rewrite artifacts now persist `promptFingerprint` separately from `promptVersion`. Legacy artifacts without the fingerprint remain readable, but resume logic treats them conservatively.

## Compatibility

- `buildLocalizationPrompt()` and `buildShortRewritePrompt()` remain the public builder entry points.
- `stories rewrite-full` and `stories rewrite-short` keep their CLI surfaces.
- Legacy mixed full batch payloads remain readable through normalization helpers, while new narration-only full results normalize to the same internal shape.

## Batch Requests

Full-story localization batch requests use `compileFullStoryPrompt()` before the OpenAI JSONL envelope is built. The provider adapter only wraps the compiled semantic request in `/v1/responses` batch transport; it does not rebuild prompt semantics. New full-story batch lines attach the `full_narration_story_package` JSON schema and omit metadata, scene, image, TTS, rendering, upload, and publication fields from the story output contract.

Batch manifests persist semantic identity for new full-story localization items: compiler version, prompt version, prompt fingerprint, selected module IDs and versions, locale/language through the item, response-schema name/version/fingerprint, and configuration hash. The configuration hash includes the prompt and schema fingerprints, so legacy cache entries are not reused as narration-only compiler hits. Legacy manifests without these fields remain readable and are handled conservatively.

## Batch Import Shapes

Downloaded provider output JSONL remains an immutable raw audit artifact under `.batch/results/`. Import then validates each story payload with strict format readers:

- narration-only full result;
- legacy mixed full+short result;
- legacy full-only result.

The import boundary rejects malformed or ambiguous payloads before downstream processing. Accepted legacy and narration-only full results are immediately normalized to the canonical narration-only result. Legacy imports record a deprecation diagnostic and are persisted as normalized narration-only production artifacts such as `<language>-full-narration-result.json`; legacy metadata is used only by the renderer compatibility adapter and is not promoted into the canonical result.

Request/result correlation is by custom ID, not array order. Duplicate result IDs fail import, missing expected IDs fail the affected item, and unexpected result IDs are reported without attaching them to a story.
