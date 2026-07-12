# Codex Prompt: Mathematik-Genre implementieren

Implement the approved mathematics education plan in the existing repository.

## Required inputs

Read:

- every file under `docs/mathe/`
- `docs/mathe/plans/math-genre-implementation-plan.md`
- `docs/mathe/plans/math-genre-task-breakdown.md`
- `docs/mathe/plans/math-genre-risk-register.md`
- `docs/mathe/plans/math-genre-test-matrix.md`

If the approved plan files do not exist, stop and report the missing files. Do not improvise
a large implementation without the reviewed plan.

## Execution rules

1. Work through the approved tasks in dependency order.
2. Reuse existing pipeline infrastructure and provider boundaries.
3. Keep every commit-sized change coherent and testable.
4. Preserve strict TypeScript type safety. Do not use `any`, unsafe assertions or silent
   schema coercion.
5. Add concise inline documentation around invariants, mathematical representations,
   state transitions and provider boundaries.
6. Preserve all existing horror workflows and CLI behavior.
7. Do not make paid provider calls. Use simulation, fixtures and deterministic mocks.
8. Do not publish videos or modify live YouTube channels.
9. Do not apply irreversible migrations without an explicit reviewed migration file.

## Minimum implementation scope

### Curriculum

- versioned source registry
- importer for `docs/mathe/curriculum/03-machine-readable-seed.md`
- strict schema validation
- stable skill IDs
- validated prerequisite DAG
- source mappings and optional state placement overrides
- CLI commands to list, inspect and validate curriculum

### Lesson specifications

- strict schemas for lesson, variant, examples, challenge and scenes
- deterministic IDs and content hashes
- generation ports compatible with simulation
- explicit distinction between classes 5–7 and classes 8–10
- three genuinely differentiated variants

### Mathematical verification

- isolated `python/math-verifier/` service or the repository-approved equivalent
- versioned JSON protocol
- typed TypeScript client
- exact integer, rational, decimal, algebraic and measurement representations
- deterministic checks for arithmetic, equivalence, fractions, equations, units,
  geometry, functions and probability
- hard blocking of `failed` and unsupported critical checks
- fixtures and property-based tests where useful

### Localization

- canonical German lesson
- target languages `de`, `en`, `es`, `fr`, `pt`
- locked mathematical facts and scene purpose
- locale-specific display and speech formatting
- versioned terminology and TTS lexicons
- post-localization mathematical consistency check

### Visuals and rendering

- LaTeX/KaTeX or MathJax formula-to-SVG boundary
- typed visual components for formulas, number lines, coordinate systems, graphs,
  geometry, tables and probability trees
- Remotion-based scene composition where compatible with the repository
- stable teacher-character asset interface using reusable poses
- 16:9 safe-area and readability validation
- FFmpeg media validation
- no need to generate final character artwork during this task; provide placeholders
  and an asset contract

### Orchestration

- idempotent stages
- atomic artifact writes
- resumable per-lesson and per-asset execution
- batch continuation after isolated failures
- retry budgets and persistent actionable errors
- simulation mode with complete prompt and path logging
- no Base64 image payloads in logs

### Metadata and playlists

- localized title, description, chapters, tags and hashtags
- stable playlist keys for class, topic and variant
- promise-focused thumbnail specification
- dry-run publishing manifest

### Quality gates

Implement explicit statuses:

```ts
type MathProductionStatus =
  | 'READY'
  | 'READY_WITH_MINOR_EDITS'
  | 'REVISION_REQUIRED'
  | 'MATHEMATICAL_ERROR'
  | 'CURRICULUM_ERROR'
  | 'LOCALIZATION_ERROR'
  | 'TIMING_ERROR'
  | 'RENDER_BLOCKED'
  | 'PUBLISH_BLOCKED';
```

`MATHEMATICAL_ERROR` must always block rendering and publishing.

## CLI

Adapt names to the existing CLI conventions. Provide equivalents for:

```bash
<cli> math curriculum import
<cli> math curriculum validate
<cli> math curriculum list --grade 5
<cli> math lesson plan --skill M5-ZO-001 --variant standard
<cli> math lesson generate --skill M5-ZO-001 --variant standard --language de --simulate
<cli> math batch create --grade 5 --variant standard --language de
<cli> math batch process <batch-id> --simulate
<cli> math quality check --lesson <lesson-id>
<cli> math metadata generate --lesson <lesson-id>
<cli> math publish --lesson <lesson-id> --dry-run
<cli> math status --lesson <lesson-id>
```

## Pilot acceptance test

Use one class-5 skill as the vertical slice, preferably `M5-ZO-001`.

The pilot must produce, without paid providers:

- imported and validated curriculum node
- foundation, standard and challenge specifications
- a verified worked example and challenge
- canonical German narration fixture
- scene plan with formula/diagram placeholders
- mock localized artifacts for all five languages
- timing estimate within 180–300 seconds
- metadata and playlist manifest
- complete quality report
- resumable production state
- no regression in existing horror tests

## Verification before completion

Run the repository's formatting, linting, type-checking and relevant tests. Add missing tests.
Report:

- files changed
- tasks completed and deferred
- commands executed
- test results
- migrations
- known risks
- exact commands for the next simulation run

Do not claim completion when tests fail. Do not hide unsupported mathematical cases.
