# Story Generation Canonical Workflow Plan

## Objective

Refactor the story-generation pipeline so every downstream artifact is derived from a validated optimized English full story, with complete request/response provenance and deterministic lineage.

## Current-state findings

- `stories rewrite-full` still resolves inputs through the short-rewrite resolver and mixed source/canonical heuristics.
- The synchronous localization service now gates English short generation on a validated English full story, but localized full and short generation still originate from the parsed source story.
- The batch pipeline still prepares English-short and localized batch items directly from parsed source input.
- Batch import for English short still copies the original source file into the English full output path.
- Short rewrite can still be run against a raw English source story, so it is not strictly downstream of canonical optimized English full.
- Request/response provenance is not persisted as immutable attempt history for each model invocation.
- Shared facts are cached heuristically from parsed source content, not persisted as authoritative shared artifacts keyed to canonical English full provenance.
- The prompt builder already injects the same language-setting sections for the supported locales, but the selection path is duplicated across prompt helpers and benefits from a dedicated resolver.
- Current language-setting mapping:
  - `en` -> English Localization
  - `de` -> German Localization
  - `es` -> Spanish Localization
  - `fr` -> French Localization
  - `pt` -> Portuguese Localization

## Canonical workflow target

1. Parse the original English source story.
2. Optimize English full story through the current English full prompt.
3. Persist the rendered request, raw response, and normalized result for that attempt.
4. Validate the optimized English full story.
5. Abort if English full optimization or validation fails.
6. Commit the validated optimized English full story as the canonical source artifact.
7. Generate and persist shared canonical artifacts from the canonical full story.
8. Generate English short from the canonical optimized English full.
9. Generate localized full stories from the canonical optimized English full.
10. Generate localized short stories from the canonical optimized English full.
11. Persist every model request and response with attempt identity, status, provenance, and validation results.

## Implementation plan

### 1. Introduce canonical artifact types

- Add explicit types for source English, canonical optimized English full, localized full, and localized short.
- Make source hash, canonical hash, prompt version, and model part of every downstream artifact identity.

### 2. Add immutable attempt-history persistence

- Create per-attempt directories before provider calls.
- Persist system prompt, user prompt, request metadata, raw response, normalized result, validation, and final status.
- Keep retries immutable by allocating a fresh attempt folder for each retry.

### 3. Rework `rewrite-full`

- Use a dedicated full-story resolver rather than the short resolver.
- Optimize English full first.
- Abort all downstream work if the optimized English full fails validation.
- Generate English short only from the validated canonical English full.
- Generate localized full and short outputs only from the canonical English full.

### 4. Rework `rewrite-short`

- Resolve the canonical optimized English full story by default.
- Reject raw source markdown unless an explicit compatibility path is deliberately allowed.
- Preserve resumability, overwrite protection, dry-run behavior, and bounded retries.

### 5. Rework batch mode

- Prevent batch preparation from emitting downstream items until canonical English full exists.
- Import English full from model output rather than copying the source file.
- Ensure retries and imports reuse canonical artifact provenance.

### 6. Add canonical shared artifacts

- Persist shared facts and character map in the episode shared folder only.
- Key reuse on canonical English full provenance, not the original source hash.
- Regenerate shared artifacts when canonical provenance changes.

### 7. Improve observability

- Record model, prompt version, request id, token usage, estimated cost, duration, and output paths for every attempt.
- Add manifest fields for canonical provenance and downstream artifact status.
- Keep summary output concise and machine-readable when `--json` is enabled.

## Actionable tasks

- Task 1: split source-English, canonical-English-full, localized-full, and localized-short resolution into distinct helpers and types.
- Task 2: add attempt-history persistence utilities and wire them into every OpenAI call site.
- Task 3: refactor sync `rewrite-full` into ordered stages with a hard English-full validation gate.
- Task 4: refactor `rewrite-short` to consume canonical optimized English full by default.
- Task 5: refactor batch preparation and import so they never copy source into canonical full outputs.
- Task 6: persist shared facts and character map as first-class shared artifacts with provenance.
- Task 7: update manifest and cache schemas to store canonical provenance and attempt lineage.
- Task 8: add regression tests for gating, provenance, batch import, resume, and short-source enforcement.

## Acceptance criteria

- No localized output or shared downstream artifact can be generated before English full optimization validates.
- Every story-related model request and response is persisted with complete provenance.
- `stories rewrite-short` no longer accepts raw source as the default input path.
- Batch import does not copy source into English full output.
- Shared facts and character map are reused only when canonical provenance matches.

## Validation focus

- CLI tests for `rewrite-full` and `rewrite-short` source resolution.
- Service tests for canonical gating and downstream abort behavior.
- Batch tests for import and retry behavior.
- Persistence tests for attempt-history and manifest updates.

## Current hardening pass

1. Switch structured story generation to the Responses API parse path so empty `output_text` no longer looks like success.
2. Split full and short rewrite response schemas and remove prompt/schema contradictions in the structured-output prompts.
3. Centralize `max_output_tokens` budgets for full and short rewrites, keep reasoning effort at `high`, and validate the effective ceilings.
4. Persist request, response, parsed payload, and failure diagnostics for every generation attempt in the episode debug folder.
5. Sanitize source-analysis metadata so setting/antagonist/premise fields are concise semantic facts instead of copied scene sentences.
6. Add regressions for incomplete responses, refusal, absent parsed output, malformed metadata, and token-budget retry behavior.
