# Task: Full-Story Prompt Compiler

Replace monolithic full-story prompt construction with modular, narration-only compilation. Do not build a parallel pipeline.

## Objective

Create a deterministic compiler for canonical English full generation and localized full generation.

## Required Behavior

The compiler must accept:

- StoryIR;
- full-story contract;
- language and locale module;
- genre policy;
- full output constraints;
- compiler version.

The compiler must output:

- system message;
- user message;
- response schema name/version;
- prompt hash;
- input section token estimates;
- selected module list.

Full narration prompts must not include metadata, audio instructions, scene instructions, image prompts, render settings, thumbnails, tags, hashtags, validation diagnostics, or repair history.

## Schemas

Split full-story schemas from short schemas. Full response schemas should contain narration-only fields required for validated full narration. Any legacy metadata/audio fields must be moved behind compatibility adapters or later stages.

## Locale Modules

Use actual repository locales: `en-US`, `de-DE`, `es-419`, `fr-FR`, `pt-BR`. Include exactly one locale module per request.

## Tests

Add snapshot or structured tests for:

- full compiler excludes forbidden sections;
- one locale module only;
- full schema selected for full variants;
- prompt hash changes when compiler version or contract changes;
- no duplicated StoryIR/analysis payloads.

## Acceptance Criteria

- Full prompt compilation is deterministic and versioned.
- Full narration prompts are narration-only.
- Full and short schemas cannot be accidentally mixed.
