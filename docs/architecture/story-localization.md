# Story Localization

## Purpose

This subsystem handles structured English full rewrites, localized full rewrites, and localized or English short rewrites from canonical source stories. It is separate from the older episode-production commands, even though both flows can feed the same episode workspace structure.

## Entry Points

- `apps/cli/src/story-localization-commands.ts`
- `apps/cli/src/story-full-rewrite-command.ts`
- `apps/cli/src/story-short-rewrite-command.ts`

## Main Services

- `packages/story-localization/src/story-localization.service.ts`
- `packages/story-localization/src/short-rewrite.service.ts`
- Supporting modules handle source discovery, prompt building, canonical fact extraction, cache reads and writes, batch manifests, validation, and artifact rendering.

## Ordered Stages

1. Source discovery and parsing
   Canonical English sources are discovered, parsed, and normalized into a structured story input.
2. Canonical fact extraction
   Fact extraction builds a stable representation used by downstream rewrite and localization prompts.
3. Prompt construction
   Prompt builders assemble structured requests for full rewrites, localized rewrites, and short rewrites.
4. OpenAI structured generation
   The services call the Responses API with schema-backed output formats and configurable model, reasoning, and token settings.
5. Validation and repair
   Generated output is checked for schema validity, message preservation, duration or word-count constraints, and filler or editorial drift; repair prompts can be issued when needed.
6. Cache writes and artifact materialization
   Cache entries, production artifacts, markdown outputs, JSON sidecars, and debug artifacts are persisted into episode output directories.

## Resume and Idempotency

- Full localization checks cache state and existing outputs before regenerating.
- Short rewrites support overwrite versus resume semantics and use manifest updates plus file locks around persisted artifact state.
- Batch mode persists manifests and supports refresh, import, and retry of failed items instead of recomputing whole runs.

## Debug Artifacts

- The services can persist prompt, request, response, and error artifacts for debugging.
- Those persisted payloads can be large. Do not load them by default during routine repo discovery; read them only for an active debugging task.

## Relevant Tests and Source References

- `packages/story-localization/src/story-localization.unit.test.ts`
- `packages/story-localization/src/story-localization.integration.test.ts`
- `packages/story-localization/src/story-localization.batch.integration.test.ts`
- `packages/story-localization/src/short-rewrite.service.unit.test.ts`
- `packages/story-localization/src/short-rewrite.unit.test.ts`
- `packages/story-localization/src/story-localization.service.ts`
- `packages/story-localization/src/short-rewrite.service.ts`
- `packages/story-localization/src/story-localization-cache.ts`
- `packages/story-localization/src/story-localization-batch-storage.ts`
