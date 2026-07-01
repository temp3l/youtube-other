# Story Pipeline Cache And Invalidation Matrix

## Fingerprint Inputs

Required fingerprint inputs:

- Source story raw text, source path, source role, source-cleaning version, accepted source fallback content.
- Canonical English full content and canonical full artifact schema version.
- Localized story content, locale rules, language profile, localized artifact schema version.
- Short settings, short extraction version, short contract version/hash, parent full hash.
- Prompt template version, prompt compiler version, selected prompt modules, response schema version/fingerprint.
- Model, provider, reasoning effort, max output tokens, temperature where applicable.
- Quality profile, production gate version, analysis prompt/schema/model/reasoning.
- Metadata prompt/schema/model strategy.
- Voice, voice preset, TTS model, pronunciation/audio instruction settings.
- Scene extraction version, scene planning settings, visual style, image-prompt compiler, image model, image size, image quality, output format, character references.
- Thumbnail settings, title/hook text strategy, thumbnail model, dimensions.
- Render profile, ffmpeg settings, caption burn-in, audio/subtitle dependencies.
- Workflow schema version and stage type version.

## Invalidation Matrix

| Changed input | Invalidate | Reusable |
| --- | --- | --- |
| Original English source text/path/role | canonical English rewrite/fallback, English quality, all localizations, all shorts, visual model, scenes, image prompts, shared images, thumbnails, audio, metadata, renders, publication | none except unrelated previous workflow history |
| Source-cleaning version | canonical English, all dependents | unrelated episodes |
| English rewrite prompt/compiler/schema/model/reasoning | canonical English generated artifact, English quality, all localizations, all shorts, visual branch, media dependents | original source record |
| English rewrite provider failure changes only | fallback evaluation may rerun if previous failure category was transient and user retries; accepted source fallback remains reusable if source and quality inputs unchanged | generated downstream from accepted fallback |
| Accepted source fallback content | all downstream as canonical English source | original failed rewrite sidecar |
| English deterministic validation rules | English validation/gate, all dependents if gate changes from pass to block or candidate content changes | provider response bytes |
| Production quality profile/gate version | affected quality stage and dependents if pass/block changes | story artifacts, local validation, provider generation outputs |
| English quality analysis model/prompt/schema | English quality artifact and dependent scheduling decisions | story artifacts unless gate result changes |
| Canonical English full content/fingerprint | all localizations, all shorts, visual model, scenes, image prompts, shared images, audio, metadata, renders, publication | original source and failed attempts |
| German localization prompt/model/schema/rules | German full, German short, German audio, German metadata, German thumbnail/render/publish | English, other locales, shared images if visual branch is English-derived |
| French localization prompt/model/schema/rules | French branch only | English, other locales, shared images |
| Spanish localization prompt/model/schema/rules | Spanish branch only | English, other locales, shared images |
| Portuguese localization prompt/model/schema/rules | Portuguese branch only | English, other locales, shared images |
| Localized full fallback candidate changes | that locale full quality, short, audio, metadata, render, publish | other locales, shared images |
| Short extraction/contract/settings | affected locale short, short quality, short audio, short metadata, short thumbnail, short render, short publish | full stories, full audio/metadata/render, shared full images unless short-specific vertical images regenerate |
| English short prompt/model/schema | English short branch only | English full, localizations, shared images unless short visual plan depends on short text |
| German voice/TTS/pronunciation | German audio for affected format, German render/publication using that audio | all stories, metadata, images, other locales |
| Spanish metadata prompt/model/schema | Spanish metadata for affected format, Spanish publish | Spanish story/audio/images/render if metadata not burned in |
| Scene extraction version/settings | visual model, scenes, image prompts, images, renders, thumbnails using scene images | stories, audio, metadata unless scene-based metadata is configured |
| Visual style | visual prompts, images, thumbnails from generated images, renders | localized narration/audio/metadata, quality gates |
| Character reference image/hash | images for scenes using that character, dependent renders/thumbnails | story text, audio, metadata |
| Image model/size/quality/output format | shared image generation and dependent renders/thumbnails | stories, quality, audio, metadata |
| One scene image provider failure | that scene image and dependent render readiness | other scenes, story/locales |
| Thumbnail text strategy/title/hook | affected thumbnail and publication | story, shared images, audio/render unless thumbnail embedded in video |
| Voice for one locale/format | that audio and dependent render/publish | other formats/locales, images |
| Render profile/ffmpeg settings | affected renders and publication | stories, audio, metadata, images |
| Caption burn-in setting | affected render | source captions/audio/story |
| Publication credential/channel/playlist | publication stage only | render, metadata, thumbnail |
| Workflow schema version | workflow manifest migration; stage reuse allowed if artifact schemas/fingerprints compatible | artifact files |
| `sp` branch detected | migration/rejection status only; if normalized to `es`, reconcile conflicts before reuse | canonical `es` branch if no conflict |

## Validation Examples

English source changes:

- invalidate canonical English;
- invalidate all localizations and shorts;
- invalidate visual representation, scenes, images, audio, metadata, renders, thumbnails, publication.

German voice changes:

- invalidate German audio and dependent German renders/publication;
- do not invalidate stories, metadata, shared images, or other locales.

Spanish metadata prompt changes:

- invalidate Spanish metadata and publication;
- do not invalidate Spanish audio, shared images, or Spanish story gates.

Visual style changes:

- invalidate visual prompts, images, thumbnails derived from images, and dependent renders;
- do not invalidate localized narration, audio, metadata, or quality gates.

## Cache Reuse Rules

- Failed artifacts are never fresh cache hits.
- Compatibility markdown without current lineage is display-only.
- Provider batch `api-succeeded` is not a workflow success until schema validation, deterministic validation, persistence, and gate requirements pass.
- Cache hits must be recorded as `cache-reused` stage outcomes with artifact fingerprints and prior provenance.
