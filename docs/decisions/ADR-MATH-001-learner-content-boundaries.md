# ADR-MATH-001: Learner content boundaries

Date: 2026-08-02  
Status: accepted for incremental implementation

## Context

The current math lesson contract uses plain strings for internal planning, facts, narration and display. Deterministic templates then copy planning and review text into learner narration. Tuple facts also permit unlabeled values to be narrated.

## Decision

Math education will introduce explicit, runtime-validated content surfaces:

- internal metadata and diagnostics;
- canonical mathematical semantics;
- didactic intent;
- `InternalPlanningText`, `LearnerNarrationText`, `DisplayText`, `TtsText`, and `SubtitleText` branded TypeScript values;
- typed instructional scenes whose narration, display semantics, learner action, pause, prompt and answer are bound.

Only an allowlisted narration compiler may create `LearnerNarrationText`. It accepts canonical semantics and didactic intent, never arbitrary metadata, DTOs, serialized facts or validator text. A deterministic learner-language gate rejects internal process vocabulary, unresolved facts, unbound values and avoidable German transliteration before TTS or subtitle generation.

The canonical data model must preserve category/value/unit identity. A tuple may remain a mathematical value, but cannot satisfy a learner-facing categorical-data narration reference without a category binding.

Math behavior is enabled only through the math profile/capability. Any shared contract additions are backward-compatible and opt-in; defaults, artefacts and caches for non-math genres remain unchanged.

## Number verbalization

An independently versioned, genre-neutral number verbalizer may become a shared service only after characterization tests cover Dark Truth, history, Veronica Benini and another genre. It will take explicit numeric intent (`cardinal`, `ordinal`, `year`, `date`, `time`, `decimal`, `percentage`, `currency`, `fraction`, `range`, `identifier`, `digits`) and preserve explicit digit-by-digit values. It must not apply math classroom language outside the math profile.

## Cache and migration

Lesson schema, canonical-model, grade-profile, narration-compiler and number-verbalizer versions become semantic fingerprint inputs. A changed narration compiler invalidates narration, TTS, subtitles, timing, render and downstream quality artefacts only for affected math lessons. A changed shared verbalizer invalidates only speech/subtitle outputs whose normalized text differs; it never regenerates non-math artefacts automatically. Historical artefacts remain readable and are marked/revalidated through an explicit migration workflow.

## Compatibility and non-goals

This ADR does not change voice speed, timing presets, non-math prompts, renderer defaults, existing public schemas, or published artefacts. It does not authorize automatic regeneration or publication. Adapters may preserve old artefact readers while writers migrate by version. No generic prose rewrite is a substitute for canonical math semantics, task/solution binding, objective coverage and scene synchronization.

## Consequences

Validators and quality reports must consume the new surfaces and fail closed before publication. Existing literal-presence narration review rules that require internal wording must be retired or confined to non-learner internal evidence. New cache versions require dry-run impact reports and focused regression fixtures.
