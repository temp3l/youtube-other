# Task 05: Modular Prompt Compiler Plan

Status: implemented; remaining batch migration gap completed

## 1. Title and status

Task 05: Modular Prompt Compiler

Status: implemented. The follow-up batch migration completed the previously unresolved dual-read/single-write batch gap.

Implementation status note:

- Sync full and short rewrite paths use the modular compiler.
- New full-story localization batch requests use the same Task 05 compiler semantics and the canonical narration-only full response schema.
- Batch import reads legacy mixed, legacy full-only, and narration-only full results through strict schema readers, normalizes immediately to the canonical narration-only result, and writes new canonical production artifacts only in the narration-only format.
- Raw provider JSONL remains separate for auditability.
- New batch manifests persist compiler, prompt, module, and response-schema fingerprints; legacy manifests without those fields remain readable and are handled conservatively.

## 2. Objective

Replace duplicated, manually assembled story rewrite prompts with a deterministic, typed, provider-neutral compiler for narration-only story rewrite requests.

The compiler must build prompts from validated story inputs, compact contract data, exactly one genre policy, exactly one locale module, applicable narrative modules only, and the actual structured response schema used at the provider boundary.

## 3. Scope

- Full-story canonical English and localized full-story prompt compilation.
- Shared module registry and rule ownership used by short-story compilation.
- Prompt diagnostics, module fingerprints, schema fingerprints, and cache-key inputs.
- Provider request adaptation for existing sync and batch OpenAI Responses paths.
- Compatibility wrappers for existing prompt-builder entry points and legacy template paths.

## 4. Non-goals

- Do not rename `docs/templates/audio/`.
- Do not start Task 06 token budgeting or later task work.
- Do not redesign StoryIR, provenance, artifact paths, CLI commands, `.env` precedence, provider routing, or batch storage.
- Do not introduce metadata, image, scene, TTS, rendering, upload, thumbnail, tags, hashtag, or publication ownership into the story compiler.
- Do not require paid provider calls for implementation or verification.

## 5. Dependencies and assumptions

- Tasks 01-04 are available: `story-artifact-model.ts`, `source-cleaning.ts`, `full-story-contract.ts`, `genre-policy.ts`, and `stable-json.ts`.
- Current supported languages are `en`, `de`, `es`, `fr`, `pt`; current locale identifiers are `en-US`, `de-DE`, `es-419`, `fr-FR`, `pt-BR`.
- The checked-in Task 05 file is `todo-prompts/story-rewrite-refactor-codex-prompts/05-full-story-prompt-compiler.md`; the requested `05-modular-prompt-compiler.md` does not exist.
- Existing public entry points remain unless this plan explicitly lists a compatibility wrapper.

## 6. Current-state findings

- Full prompt construction is in `localization-prompt-builder.ts` and loads `system-prompt.md` plus `full-story-prompt.md` from `docs/templates/audio/`.
- Short prompt construction is in `short-rewrite.prompt.ts` and loads `system-prompt.md` plus `short-story-prompt.md`.
- Batch request construction in `story-localization-batch-service.ts` builds prompts independently from sync generation.
- Current full response schemas still include metadata/audio/thumbnail/SEO/visual fields; this conflicts with Task 05 narration-only requirements.
- Task 04 contract and genre policy code exists but is not wired into provider calls.
- Universal rules are duplicated across system prompt, full prompt, short prompt, locale settings, validators, and repair prompts.

## 7. Existing runtime call graph

- Full sync:
  CLI `stories rewrite-full` -> `localizeStoryEpisode()` -> `prepareCleanedInputStory()` -> `parseCanonicalSourceStory()` -> `extractCanonicalStoryFacts()` -> production context builders -> `buildFullPromptConfig()` -> `buildLocalizationPrompt()` -> `generateStructuredStoryPackage()` -> `callOpenAiStructured()`.
- Localized full sync:
  `localizeStoryEpisode()` -> canonical English generated/resumed -> `buildFullPromptConfig(language)` -> `generateStructuredStoryPackage()`.
- Short sync:
  CLI `stories rewrite-short` -> `rewriteShortStories()` -> `generateLanguagePayload()` -> `buildShortRewritePrompt()` -> `requestStructuredShortRewrite()`.
- Batch:
  `prepareStoryLocalizationBatch()` -> `englishShortBody()` / `localizationBody()` -> `buildLocalizationPrompt()` -> batch JSONL request.
- Provider boundary:
  sync uses `zodTextFormat(schema, schemaName)`; batch uses `z.toJSONSchema(schema)` in `text.format`.

## 8. Proposed architecture

Use one shared typed module registry with variant-specific compiler entry points:

- `compileFullStoryPrompt(input)` for canonical English and localized full.
- `compileShortStoryPrompt(input)` for short rewrite, using shared universal modules and short-specific modules.
- Compatibility wrappers keep `buildLocalizationPrompt()` and `buildShortRewritePrompt()` callable during migration.
- Provider adapters convert compiled prompts plus schema descriptors into existing OpenAI Responses request shapes.

Architectural decisions applied in this revision:

- Exclude title from the canonical narration-only schema. Introduce a narrow compatibility adapter only if runtime tracing proves it is unavoidable.
- Persist a new explicit optional short prompt fingerprint field. Require it for newly written artifacts while preserving compatibility reads for older artifacts.
- Unknown genre may compile only when the selected contract does not require genre-specific semantics. Otherwise compilation must fail with a typed blocking diagnostic.
- Read both legacy and narration-only batch result formats during migration, normalize immediately, and write only the new narration-only format.

## 9. Type model

Use a module descriptor plus renderer split, with discriminated unions for module IDs and variant inputs.

Each module descriptor includes:

- `id`
- `semanticVersion`
- `owner: "narration" | "metadata" | "audio" | "scene-plan" | "image-plan" | "render" | "publication"`
- `variants: readonly ("full" | "short")[]`
- `applies(input): ApplicabilityResult`
- `dependencies`
- `conflicts`
- `order`
- `render(input): RenderedPromptSection`
- `fingerprint(input): StableJsonValue`
- `diagnostics`

This avoids an arbitrary string array while still allowing modules to render Markdown sections.

Add a typed classification outcome used before policy-module selection:

- `confident`
- `unknown-safe`
- `unknown-unsafe`

Compilation rules for classification outcome:

- `confident`: compile with resolved genre policy.
- `unknown-safe`: compile with deterministic conservative unknown policy, emit structured diagnostics, and continue only when the contract does not require genre-specific semantics.
- `unknown-unsafe`: block compilation before any provider call with a typed blocking diagnostic describing the missing evidence.

## 10. Module registry

Add a frozen registry that registers these module areas:

- Core task
- Trust boundary
- Source-cleaning context
- Compact story contract
- Nonfiction boundaries
- Genre-specific policy
- Language and locale rules
- Dialogue handling
- Written messages and quoted text
- Names and identifiers
- Critical-object continuity
- Opening requirements
- Ending requirements
- Response schema

Exactly one genre-policy module and exactly one locale module must resolve for every successful compilation.

## 11. Module ownership rules

The compiler accepts only `owner: "narration"` modules.

It rejects before provider calls if a selected or supplied module owns:

- metadata generation
- titles, descriptions, tags, hashtags, chapters
- TTS/audio production
- voice selection
- pacing or synthesis settings owned by TTS
- image prompts
- scene lists or shot design
- rendering
- thumbnails
- upload instructions
- provider operational commentary

Use typed ownership checks, not reviewer discipline or prompt-text comments.

## 12. Applicability and exclusion rules

- Dialogue module applies when `contract.generationBoundaries.dialogue` is true or source/contract contains dialogue evidence.
- Written-message module applies when `contract.sourceTruth.writtenMessages.length > 0`.
- Names/identifiers module applies when entities, addresses, room numbers, dates, or named objects exist in contract/source facts; fallback is current canonical facts character/object arrays.
- Critical-object module applies when `contract.sourceTruth.criticalObjects.length > 0`.
- Nonfiction boundaries apply when fictionality is `nonfiction` or selected policy is evidence-led.
- Supernatural or address-specific rules apply only from genre policy or typed contract evidence.
- Do not use brittle prompt keyword searches when StoryIR, contract, facts, or cleaner report fields can drive applicability.
- If current models lack a typed signal, use the narrowest deterministic fallback from `CanonicalStoryFacts`, then document the missing StoryIR field as deferred work.
- Unknown genre may proceed only through the `unknown-safe` path. If a genre-specific invariant is required by the contract, treat the classification as `unknown-unsafe` and fail before provider invocation.

## 13. Deterministic compilation pipeline

1. Validate compiler input and variant.
2. Build or receive validated `StoryIR`.
3. Resolve typed classification outcome: `confident`, `unknown-safe`, or `unknown-unsafe`.
4. Build full contract for full variants using `buildFullStoryContract()`.
5. Resolve exactly one genre policy.
6. Select exactly one locale module from `LANGUAGE_PROFILES`.
7. Evaluate conditional narrative modules.
8. Reject cross-owner modules.
9. Validate dependencies and conflicts.
10. Deduplicate universal rules by rule ID.
11. Sort modules by stable `order`, then `id`, then `semanticVersion`.
12. Render system and user messages.
13. Attach actual response schema descriptor.
14. Compute prompt fingerprint and diagnostics using `stableSerialize()`.
15. Pass compiled request to provider adapter.

Byte-stable output must change only when semantic input, compiler version, module version, policy version, locale version, contract version, schema version, or serializer version changes.

## 14. Full-story and short-story integration

Use one compiler with typed variants.

- Full variants consume `FullStoryContract`, cleaned source context, locale module, genre policy, output constraints, and full response schema.
- Short variants consume validated full-story source, target locale, short output constraints, shared universal modules, short-specific opening and ending modules, and short response schema.
- Keep existing full and short service interfaces; migrate internals through wrappers.
- Prevent short rewrite from re-implementing universal trust, locale, schema, and forbidden-owner rules.
- Persist a new explicit optional short prompt fingerprint field alongside the existing short prompt version field. `promptVersion` remains the semantic prompt-system version; `promptFingerprint` becomes the deterministic identity of the compiled prompt and semantic inputs.
- Legacy short artifacts without `promptFingerprint` remain readable; newly written short artifacts must always persist it.
- Resume and comparison logic must use the explicit fingerprint where available and treat missing fingerprints conservatively.

## 15. Locale integration

- Supported locale IDs: `en-US`, `de-DE`, `es-419`, `fr-FR`, `pt-BR`.
- Unsupported locale fails compilation before provider calls.
- Canonical English full uses `en-US`.
- Localized full uses the canonical English full story as source with one of `de-DE`, `es-419`, `fr-FR`, `pt-BR`.
- Short rewrite supports `en`, `de`, `es`, `fr`, `pt`, mapped to the same locale set.
- Universal spoken-language rules live in shared narration modules, not copied into locale modules.
- Locale ID and locale module version participate in prompt fingerprints and cache keys.

## 16. Genre-policy and contract integration

- Reuse `DEFAULT_GENRE_POLICY_REGISTRY`, `resolveGenrePolicy()`, and `buildFullStoryContract()`.
- Full compilation requires a successful contract build.
- Contract content hash and build fingerprint feed the prompt fingerprint.
- Exactly one policy module renders from selected `GenrePolicy`.
- Task 05 must not repeat effective-boundary conflict resolution already owned by Task 04.
- Legacy inputs are never silently forced into horror or another specific genre.
- Conservative fallback behavior for unknown classification must be deterministic and fingerprinted where semantically relevant.
- Unknown-safe compilation can continue only when the contract remains valid without genre-specific semantics; otherwise return a typed blocking diagnostic before any paid provider request.

## 17. Response-schema integration

Add real schema descriptors instead of prose-only schema instructions.

- Full response schemas must be narration-only for Task 05.
- The canonical narration-only full schema excludes title and other metadata fields by default.
- The canonical schema should remain limited to narration-stage concerns such as:
  - `language`
  - `full.narrationParagraphs`
  - `targetNarrationWpm`
  - `preservationChecklist`
  - `diagnostics`
- The prompt compiler must not generate metadata fields merely because a downstream renderer currently expects them.
- Title compatibility must be handled through an adapter or an existing episode or metadata source where possible.
- A temporary provider-generated title field is permitted only if runtime tracing proves an active consumer cannot function without it, the value cannot be sourced elsewhere, and removing it would require an unrelated refactor outside Task 05.
- Any temporary title field must be compatibility-only and explicitly excluded from the long-term narration contract.
- Keep legacy mixed schemas readable through compatibility adapters until downstream metadata, audio, and image responsibilities move elsewhere.
- Short response schema remains `shortRewriteResultSchema`.
- Provider adapters attach schemas through `zodTextFormat()` for sync and `z.toJSONSchema()` for batch.
- Strict parsing remains at provider boundary.
- Malformed, missing parsed output, refusal, and `max_output_tokens` incomplete responses continue to fail through existing error paths.
- Schema name, version, and fingerprint participate in prompt fingerprints.
- Tests must prove schema descriptor and parser agree.

For batch import migration:

- Accept legacy mixed package results and new narration-only results through explicit schema-based detection.
- Normalize both immediately into one canonical internal narration result type.
- Record the detected format in structured diagnostics.
- Emit deprecation diagnostics for legacy mixed-format reads.
- Write only narration-only results after normalization; do not preserve legacy mixed-format writing.

## 18. Fingerprinting and cache semantics

Prompt fingerprint includes:

- compiler version
- stable serializer version
- selected module IDs and versions
- locale ID and locale module version
- genre policy ID, policy version, registry version
- contract schema, version, builder, envelope, and fingerprint
- source-cleaning fingerprint or cleaned source hash where available
- response schema name, version, and fingerprint
- output variant and constraints
- legacy prompt version during compatibility migration

Cache keys in `story-localization.service.ts` and `story-localization-batch-service.ts` must include the prompt fingerprint. New compiler fingerprints intentionally invalidate stale semantic prompt results. Old cached outputs remain readable only under their old cache entries and must not be silently reused under a new fingerprint.

Short artifact semantics:

- `promptVersion` remains the semantic version of the prompt system or compiler family.
- `promptFingerprint` is the deterministic identity of the compiled prompt plus semantic inputs.
- Old `promptVersion` values must never be reinterpreted as fingerprints.
- Newly written short artifacts and manifests must persist `promptFingerprint`.
- Absence of `promptFingerprint` in older artifacts must be handled conservatively by resume logic.
- Fingerprint diagnostics must remain auditable in debug and manifest-adjacent metadata where current repository patterns allow.

## 19. Compatibility and migration strategy

1. Add compiler modules and tests without wiring provider calls.
2. Add narration-only full response schema and compatibility adapter from narration-only output to current renderer payload shape.
3. Wrap `buildLocalizationPrompt()` and `buildShortRewritePrompt()` around compiler output.
4. Update sync full generation to use compiled prompt and schema.
5. Update short generation to use compiled prompt, schema, and explicit `promptFingerprint` persistence.
6. Update batch request construction to use compiled prompt and schema.
7. Update cache-key construction to include prompt fingerprint.
8. Add dual-read, single-write batch import handling:
   - read legacy mixed package results and new narration-only results
   - detect format explicitly by schema
   - normalize immediately to one canonical narration result type
   - write only narration-only format
9. Keep `docs/templates/audio/` files and loader paths available for compatibility tests; mark them legacy, not authoritative compiler modules.
10. Update snapshots and fixtures only where semantic compiler output changes.
11. Do not migrate existing artifacts or rename directories.

Compatibility reader removal condition:

- The legacy batch-result reader can be removed only after repository inspection confirms no supported resume, retry, import, or persisted artifact flow still produces or depends on the mixed-format schema.

## 20. Observability

Compiled diagnostics should record:

- compiler version
- selected module IDs and versions
- skipped module IDs and reasons
- locale ID
- genre policy ID and version
- classification outcome
- response schema name, version, and fingerprint
- prompt fingerprint
- contract fingerprint
- source-cleaning or provenance fingerprint
- detected batch import format where applicable
- provider request label or correlation fields

Do not log provider credentials, secrets, unrestricted source text, or full prompt text by default. Debug prompt artifact behavior can remain opt-in via existing debug output paths.

## 21. File-by-file implementation steps

Add `packages/story-localization/src/story-prompt-modules.ts`:

- Responsibility: module descriptor types, owner model, IDs, diagnostics, applicability results.
- Change: define typed module abstraction and version constants.
- Dependencies: `story-artifact-model.ts`, `full-story-contract.ts`, `genre-policy.ts`.
- Tests: new compiler unit tests.
- Compatibility: additive export only.

Add `packages/story-localization/src/story-prompt-module-registry.ts`:

- Responsibility: frozen registry of shared, full, short, locale, genre, and conditional modules.
- Change: register required module areas and ownership metadata.
- Dependencies: language profiles, locale settings, genre policies.
- Tests: registry completeness, one locale, one genre, immutable registry.
- Compatibility: additive.

Add `packages/story-localization/src/story-prompt-compiler.ts`:

- Responsibility: deterministic compile pipeline, classification handling, module ordering, deduplication, rendering, diagnostics, prompt fingerprint.
- Change: expose `compileFullStoryPrompt()` and `compileShortStoryPrompt()`.
- Dependencies: `stable-json.ts`, contract and policy modules, schema descriptors.
- Tests: deterministic output, forbidden-owner rejection, conditional module inclusion, unknown-safe versus unknown-unsafe outcomes.
- Compatibility: additive until wired.

Add `packages/story-localization/src/story-prompt-response-schemas.ts`:

- Responsibility: schema descriptors, full narration-only schema, batch import compatibility readers, and schema fingerprints.
- Change: expose full narration-only and short schema descriptors for sync and batch adapters plus explicit normalization helpers for legacy versus narration-only batch results.
- Dependencies: existing Zod schemas.
- Tests: parser and schema agreement, schema fingerprint changes, dual-read normalization.
- Compatibility: legacy schemas remain readable.

Modify `packages/story-localization/src/localization-prompt-builder.ts`:

- Responsibility: compatibility wrapper for full prompt construction.
- Change: delegate full prompt construction to compiler while preserving export name.
- Dependencies: compiler, contract builder, language profiles.
- Tests affected: `story-localization.unit.test.ts`, integration tests.
- Compatibility: call signature preserved.

Modify `packages/story-localization/src/short-rewrite.prompt.ts`:

- Responsibility: compatibility wrapper for short prompt construction and repair prompt composition.
- Change: delegate initial short prompt to compiler; keep repair wrapper focused.
- Dependencies: compiler and schema descriptor.
- Tests affected: `short-rewrite.unit.test.ts`, `short-rewrite.service.unit.test.ts`.
- Compatibility: exported function names preserved.

Modify `packages/story-localization/src/story-localization.service.ts`:

- Responsibility: sync full provider boundary and cache key.
- Change: use compiled prompt and schema descriptor; include prompt fingerprint in cache key and debug diagnostics.
- Dependencies: compiler and response schema descriptor.
- Tests affected: service unit and integration tests.
- Compatibility: CLI and artifact paths unchanged.

Modify `packages/story-localization/src/short-rewrite.service.ts`:

- Responsibility: sync short provider boundary, persistence, and resume eligibility.
- Change: use compiled prompt and schema; persist explicit optional `promptFingerprint`; include fingerprint in resume comparisons while preserving compatibility reads for missing fingerprints.
- Dependencies: compiler and response schema descriptor.
- Tests affected: short service unit tests.
- Compatibility: public API and output paths unchanged.

Modify `packages/story-localization/src/short-rewrite.schemas.ts`:

- Responsibility: short artifact, generation, and manifest persistence schemas.
- Change: add explicit optional `promptFingerprint` field to the repository’s existing short artifact and manifest shapes used for compatibility reads, then require it on new writes through service-level validation.
- Dependencies: short rewrite persistence and service paths.
- Tests affected: short schema and service tests.
- Compatibility: legacy artifacts without fingerprint remain readable.

Modify `packages/story-localization/src/story-localization-batch-service.ts`:

- Responsibility: batch JSONL request construction, import normalization, and manifest configuration hashes.
- Change: use compiled prompt and schema in `englishShortBody()` and `localizationBody()` equivalents; include fingerprint in configuration hash and custom ID; normalize imported legacy and narration-only result formats immediately after schema-based detection.
- Dependencies: compiler, schema descriptors, normalization helpers.
- Tests affected: batch integration tests.
- Compatibility: batch storage layout unchanged; prepared input hash changes intentionally.

Modify `packages/story-localization/src/story-localization.schemas.ts`:

- Responsibility: full response schema definitions and legacy import compatibility.
- Change: add narration-only full schema and compatibility reader types; do not remove legacy schema until downstream stages are separated.
- Dependencies: validators, renderers, batch import readers.
- Tests affected: schema and full generation tests.
- Compatibility: legacy schemas remain parseable for import and normalization during migration.

Modify `packages/story-localization/src/generated-story-validator.ts`:

- Responsibility: validate full narration-only results and normalized legacy inputs.
- Change: add validation path for narration-only full schema and normalized canonical narration result.
- Dependencies: response schema descriptors and normalization helpers.
- Tests affected: validator tests in `story-localization.unit.test.ts`.
- Compatibility: legacy validation remains through normalization boundary.

Modify `packages/story-localization/src/story-markdown-renderer.ts`:

- Responsibility: render full narration output through existing markdown artifact format.
- Change: accept adapted narration-only full payload; source compatibility-only title outside the canonical narration contract where possible.
- Dependencies: response adapter.
- Tests affected: renderer expectations.
- Compatibility: output paths and markdown shape preserved.

Modify `packages/story-localization/src/story-localization-cache.ts`:

- Responsibility: cache-key helpers.
- Change: no schema migration; ensure call sites include prompt fingerprint in `configurationHash`.
- Dependencies: none beyond call-site parts.
- Tests affected: resume and cache integration tests.
- Compatibility: old entries readable under old hashes.

Modify `packages/story-localization/src/index.ts`:

- Responsibility: package exports.
- Change: export compiler, module types, registry, schema descriptors, and normalization helpers.
- Dependencies: new files.
- Tests affected: import tests.
- Compatibility: additive.

Add `packages/story-localization/src/story-prompt-compiler.unit.test.ts`:

- Responsibility: semantic compiler behavior.
- Change: cover deterministic ordering, one locale, one genre, conditional modules, owner rejection, dedupe, fingerprinting, and all three classification outcomes.
- Dependencies: test fixtures from current contract and policy tests.
- Compatibility: no provider calls.

Add `packages/story-localization/src/story-prompt-response-schemas.unit.test.ts`:

- Responsibility: schema descriptor and parser agreement.
- Change: assert sync and batch schema transport shape, strict parsing, narration-only full schema exclusion of metadata fields, and dual-read batch normalization.
- Dependencies: Zod schemas.
- Compatibility: no provider calls.

Deprecate but leave unchanged `docs/templates/audio/system-prompt.md`, `docs/templates/audio/full-story-prompt.md`, `docs/templates/audio/short-story-prompt.md`:

- Responsibility: legacy compatibility templates.
- Change: no Task 05 edit required unless tests need wording references removed after compiler migration.
- Compatibility: loader paths preserved.

Leave unchanged:

- CLI command registration files except tests if behavior assertions need prompt fingerprint visibility.
- `packages/config/src/*`, `.env` precedence, OpenAI client construction.
- Task 06+ task files and media-stage packages.

## 22. Test plan

Unit tests:

- deterministic module ordering
- byte-stable compilation
- universal rule appears once
- exactly one locale module
- unsupported locale rejection
- exactly one genre policy
- irrelevant modules omitted
- relevant conditional modules included
- cross-owner metadata, image, scene, and audio modules rejected
- schema and parser agreement
- fingerprint changes on semantic version changes
- fingerprint stability for non-semantic formatting or refactor changes
- canonical narration-only full schema excludes metadata fields by default
- renderer compatibility, if needed, is isolated in an adapter and not part of the canonical narration schema
- new short artifacts persist `promptFingerprint`
- old short artifacts without `promptFingerprint` remain readable
- unknown-safe genre can compile only for semantically safe contracts
- unknown-unsafe genre blocks before provider invocation
- legacy and narration-only batch inputs both normalize into one canonical internal narration result
- new outputs are never written in the legacy mixed format

Contract tests:

- full compiler consumes `FullStoryContract` and policy envelope
- schema descriptor matches actual strict Zod parser
- locale IDs match `LANGUAGE_PROFILES` and short constants
- classification outcome participates in diagnostics and fingerprints where semantically relevant

Integration tests:

- full sync call builds provider request from compiled prompt without paid API calls using mock client
- short sync call builds provider request from compiled prompt without paid API calls
- batch JSONL includes compiled schema and prompt fingerprint in deterministic custom ID and configuration hash
- batch import dual-read path strictly detects schema format, records detected format, normalizes immediately, and hands only canonical normalized narration results to downstream code

Regression tests:

- existing CLI interfaces, output paths, resume behavior, dry-run behavior, and debug artifact paths remain compatible
- provider call count remains zero after compile-time validation failure
- legacy short artifacts and batch artifacts remain readable during migration

Avoid snapshot-only validation; use snapshots only for stable rendered prompts paired with semantic assertions.

## 23. Verification commands

- `pnpm test:unit -- packages/story-localization/src/story-prompt-compiler.unit.test.ts`
- `pnpm test:unit -- packages/story-localization/src/story-prompt-response-schemas.unit.test.ts`
- `pnpm test:unit -- packages/story-localization/src/full-story-contract.unit.test.ts packages/story-localization/src/genre-policy.unit.test.ts packages/story-localization/src/stable-json.unit.test.ts`
- `pnpm test:unit -- packages/story-localization/src/story-localization.unit.test.ts packages/story-localization/src/short-rewrite.unit.test.ts packages/story-localization/src/short-rewrite.service.unit.test.ts`
- `pnpm exec vitest run -c vitest.unit.config.ts packages/story-localization/src/story-localization.batch.integration.test.ts`
- `pnpm --filter @mediaforge/story-localization typecheck`
- `pnpm --filter @mediaforge/cli typecheck`

No paid API calls are required; all provider behavior uses mocked clients or static batch request inspection.

## 24. Risks and mitigations

- Risk: narration-only full schema breaks renderers expecting metadata or title fields.
  Mitigation: add an explicit compatibility adapter outside compiler ownership and verify whether title can be sourced from existing episode or metadata state before allowing any temporary compatibility field.
- Risk: cache hits reuse stale prompts.
  Mitigation: include compiler prompt fingerprint in configuration hash.
- Risk: locale settings still contain universal rules.
  Mitigation: move universal rules to shared modules and test occurrence counts.
- Risk: batch path diverges from sync path.
  Mitigation: both paths consume compiled prompt and schema descriptors.
- Risk: unknown legacy classification silently weakens semantics.
  Mitigation: use explicit `confident`, `unknown-safe`, and `unknown-unsafe` outcomes with blocking diagnostics for semantically unsafe cases.
- Risk: old short artifacts cannot participate safely in resume after fingerprint introduction.
  Mitigation: preserve compatibility reads, never reinterpret `promptVersion`, and treat missing `promptFingerprint` conservatively.
- Risk: old templates confuse future ownership.
  Mitigation: preserve path but remove authority from runtime once compiler is wired.

## 25. Deferred work

- Task 06 token budgeting and preflight.
- Broader response-envelope redesign unless required by later approved tasks.
- Directory rename away from `docs/templates/audio/`.
- Metadata, audio, image, scene, render, and upload stage separation beyond rejecting those concerns in story compiler.
- Expanded StoryIR fields for identifiers or supernatural and address rules where current typed data is insufficient.

## 26. Acceptance criteria

- Prompt compilation is deterministic and type-safe.
- Universal spoken-language or editorial rules occur exactly once.
- Exactly one supported locale module is compiled.
- Exactly one applicable genre-policy module is compiled.
- Irrelevant dialogue, written-message, identifier, supernatural, address, metadata, image, scene, and audio-production sections are omitted.
- Cross-owner sections are rejected before any provider call.
- Full and short story compilation share common modules rather than duplicating rules.
- The actual runtime response schema is attached and validated.
- The canonical narration-only full schema excludes metadata fields by default, including title.
- Renderer compatibility, if needed, is isolated in an adapter rather than promoted into the canonical narration contract.
- Compiler, module, policy, locale, contract, serializer, and response-schema versions participate in fingerprints where semantically relevant.
- New short artifacts persist an explicit `promptFingerprint`; old short artifacts without one remain readable.
- Unknown genre can proceed only when the selected contract does not require genre-specific semantics; otherwise compilation fails with a typed blocking diagnostic before provider invocation.
- Legacy and narration-only batch inputs are both readable during migration, normalize immediately into one canonical internal narration result, and new writes use only the narration-only format.
- Existing CLI commands, public interfaces, artifact paths, batch behavior, resume behavior, provider routing, and `.env` precedence remain compatible unless this plan documents a migration.
- Verification requires no paid API calls.
- Task 06 and later tasks remain untouched.

## 27. Open questions requiring implementation-time confirmation

- Whether an active renderer or downstream consumer has an unavoidable dependency on a provider-generated title after tracing current renderer and consumer paths.
- Which specific legacy input paths cannot produce reliable StoryIR classification and therefore require unknown-genre fallback.
- The exact artifact or manifest field names and migration locations for the new short `promptFingerprint` field in current repository persistence models.
- The exact legacy batch result schemas that must remain readable during the dual-read migration period.
