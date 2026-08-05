# Codex Master Prompt — Production-Grade Repair of the Math Education Video System

## Role

Act as a coordinated team of senior specialists:

1. **Lead TypeScript/NestJS Architect**
   - Owns architecture, type safety, module boundaries, contracts, migrations, observability, and production quality.

2. **Mathematics Education Specialist**
   - Experienced with German secondary education, especially grades 5–10.
   - Owns age-appropriate explanations, terminology, cognitive load, scaffolding, transfer tasks, and learning-objective alignment.

3. **Instructional Video and Media Pipeline Engineer**
   - Owns narration/render synchronization, board-state progression, scene contracts, subtitle generation, and deterministic rendering.

4. **German Language and TTS Specialist**
   - Owns natural German narration, orthography, number verbalization, pronunciation, SSML/provider-neutral speech normalization, and subtitle fidelity.

5. **QA and Reliability Engineer**
   - Owns golden fixtures, semantic validators, regression tests, quality gates, idempotency, resumability, caching, and release evidence.

6. **Security and Observability Reviewer**
   - Owns input validation, prompt-boundary safety, traceability, structured logging, metrics, failure diagnostics, and auditability.

Work in **multi-agent mode** with parallel work only where file ownership does not overlap. Use a lead agent to coordinate decisions, integrate changes, resolve conflicts, and maintain one implementation plan.

---

## Mission

Repair the mathematics-education video generation system so it produces classroom-ready, age-appropriate, factually correct, natural, and pedagogically coherent videos for grades 5–10.

The current system produced a grade-5 video about **Urlisten and Strichlisten** with severe system-level defects:

- Internal validation and planning language leaked into the student narration.
- Generic instructional filler displaced the actual mathematical explanation.
- Raw structured values were narrated without semantic context.
- Multi-digit numbers were spoken digit by digit.
- The declared learning objective was not fully taught.
- The task, worked example, error check, transfer task, and summary were not operationally clear.
- Visual data and narration were insufficiently bound.
- Validators apparently checked structural presence rather than instructional quality.
- The system labeled content as “reviewed” or “verified” even though it was not suitable for publication.
- The generated narration did not sound like a real teacher addressing grade-5 pupils.

Do **not** patch only the affected episode. Identify and eliminate the architectural causes across the math-education pipeline.

---

## Repository Operating Rules

Before modifying code:

1. Inspect the repository structure, current `AGENTS.md` files, project documentation, package boundaries, CLI commands, schemas, generators, renderers, validators, TTS adapters, tests, fixtures, and workflow logs.
2. Identify all duplicate or divergent implementations used by:
   - CLI generation
   - API generation
   - batch workflows
   - direct Codex-assisted generation
   - narration generation
   - subtitles
   - rendering
3. Reuse established patterns where they are sound.
4. Do not introduce a parallel replacement architecture beside the current one.
5. Prefer incremental migration with compatibility adapters and explicit deprecation.
6. Preserve existing voice speed and timing presets unless a test proves they are the cause of a defect.
7. Preserve completed production assets where possible, but invalidate cache entries when their semantic inputs or compiler version change.
8. Do not make unrelated formatting or dependency changes.
9. Do not silently change public contracts.
10. Record all meaningful architectural decisions in ADRs or the repository’s existing decision mechanism.


## Mandatory Scope Isolation and Cross-Genre Safety

Default all behavior changes to the math-specific implementation surfaces:

```text
packages/math-education
packages/math-rendering
packages/educational-renderer
math-specific CLI integration
```

The intended math-specific changes include, but are not limited to:

- lesson structure,
- German classroom language,
- grade-band profiles,
- learning-objective coverage,
- canonical math semantics,
- tally-list and frequency-table behavior,
- educational scene contracts,
- learner-task design,
- misconception handling,
- math-specific validation,
- math-specific rendering behavior,
- math-specific workflow gates.

These changes must not alter the behavior, defaults, prompts, artifacts, cache semantics, narration style, rendering, validation, or workflow behavior of:

- Dark Truth,
- history,
- Veronica Benini,
- or any other non-math genre.

### Shared-package rule

Shared-package changes must be:

- additive,
- backward compatible,
- opt-in where behavior is math-specific,
- activated only through the math profile or an explicit math capability flag,
- covered by characterization and regression tests.

Preserve existing defaults and existing generated artifacts for Dark Truth and all other genres.

Before changing any shared:

- contract,
- schema,
- cache key,
- speech normalizer,
- renderer behavior,
- workflow behavior,
- CLI primitive,
- shared prompt utility,
- or artifact format,

first add characterization tests for Dark Truth and representative non-math genres.

Do not proceed with a behavior-changing shared modification unless:

1. the change is required for the math implementation,
2. the existing non-math behavior is captured by tests,
3. the proposed implementation preserves that behavior by default,
4. any math-specific activation is explicit,
5. explicit operator approval is obtained where the shared change could affect existing outputs.

Never:

- invalidate non-math caches,
- migrate non-math artifacts,
- regenerate non-math episodes,
- rewrite non-math manifests,
- change non-math workflow status,
- or mark non-math episodes for regeneration.

### Explicit exception — global number verbalization

Number verbalization is the only intended cross-genre behavior improvement.

The global number-verbalization layer should be corrected for all genres so that values such as:

```text
12
15
2026
3.5
25 %
1/2
```

are spoken naturally and semantically correctly instead of being read as isolated digits or malformed raw notation.

This global change must still be introduced safely:

1. Add characterization tests for Dark Truth, history, Veronica Benini, and at least one additional genre before changing behavior.
2. Preserve genre-specific wording, pacing, dramatic style, locale, and voice configuration.
3. Change only the verbalization of numbers and mathematical or numeric symbols where the current output is demonstrably incorrect.
4. Do not apply math-classroom phrasing to non-math genres.
5. Do not change existing narration text beyond the normalized numeric expression.
6. Version the number verbalizer independently.
7. Include the number-verbalizer version in cache keys only where TTS or subtitle artifacts depend on it.
8. Invalidate only affected speech/subtitle artifacts whose normalized output actually changes.
9. Never trigger automatic regeneration of non-math episodes.
10. Provide a dry-run report listing affected non-math artifacts and require explicit approval before any optional regeneration.
11. Add regression cases for years, dates, times, decimals, percentages, currency, ordinals, ranges, identifiers, episode numbers, and intentionally digit-by-digit values.
12. Support explicit escape or annotation for values that must remain digit-by-digit, such as codes, phone numbers, IDs, coordinates, or stylistic narration.

The global verbalizer must distinguish semantic numbers from identifiers. It must not transform every digit sequence blindly.

Example:

```ts
type SpokenNumericIntent =
  | "cardinal"
  | "ordinal"
  | "year"
  | "date"
  | "time"
  | "decimal"
  | "percentage"
  | "currency"
  | "fraction"
  | "range"
  | "identifier"
  | "digits";
```

Non-math genres must retain their existing genre behavior except for explicitly validated numeric pronunciation corrections.

---

## Source Defect Evidence

Use the following generated narration as a mandatory regression fixture.

### Problematic phrases that must never reach learner-facing narration

```text
geprüftes Modell
geprüfte Darstellung
reviewter Lösungsweg
strukturierter Datensatz
Binde Kategorien, Zellen und Werte an den strukturierten Datensatz
Leite Totale, Maximum und Skala unabhängig ab
mathematisch geprüft
dieselben mathematischen Beziehungen bewahren
reviewte Transferaufgabe
```

### Raw-value narration defects

```text
vier, drei, fuenf; vier; drei; fuenf
eins zwei
eins fuenf
```

Expected behavior:

```text
Vier Kinder wählen Apfel, drei wählen Birne und fünf wählen Banane.
Vier plus drei plus fünf sind zwölf.
Sechs plus vier plus fünf sind fünfzehn.
```

### Learning-objective mismatch

Declared objective:

```text
Daten in Ur- und Strichlisten erfassen.
```

Actual narration did not adequately explain:

- what an Urliste is,
- how an Urliste is created,
- how it is transferred to a Strichliste,
- why the fifth tally mark crosses the first four,
- how frequencies are read,
- how the total is calculated,
- how the most frequent category is identified.

This mismatch must become a hard validation failure.

---

## Required Outcome

At the end of the implementation, the system must generate a grade-5 lesson that a mathematics teacher could reasonably use as:

- an introduction,
- a guided classroom explanation,
- a revision video,
- or a homework support resource,

without exposing internal pipeline vocabulary or requiring the teacher to repair the narration manually.

The fix must also generalize to grades 6–10 and to other mathematical domains.

---

# Phase 1 — Repository and Pipeline Forensics

Create an evidence-based system map before coding.

## Locate and document

Identify every stage that transforms educational intent into final assets:

```text
curriculum objective
→ lesson specification
→ canonical mathematical model
→ didactic plan
→ scene plan
→ narration plan
→ learner-facing narration
→ display text
→ board commands / animation
→ TTS-normalized text
→ audio
→ subtitles
→ rendered video
→ publication metadata
```

For every stage, document:

- input schema,
- output schema,
- owner package/module,
- persisted artifacts,
- cache key,
- version identifier,
- validators,
- retry behavior,
- error handling,
- logs and metrics,
- known duplicate implementation.

## Trace the defective episode

Trace the exact path by which terms such as `reviewed`, `verified`, `structured dataset`, and raw numeric arrays reached the narration.

Determine whether the root cause is:

- prompt composition,
- DTO/schema leakage,
- shared object serialization,
- fallback templates,
- localization,
- repair prompts,
- post-processing,
- TTS preprocessing,
- subtitle generation,
- renderer metadata reuse,
- or multiple causes.

Produce a concise root-cause report before implementing fixes.

---

# Phase 2 — Introduce Explicit Content Boundaries

The system must distinguish internal data from learner-facing copy at the type level.

## Required domain separation

Create or strengthen explicit schemas similar to the following concepts. Adapt names to repository conventions.

```ts
type InternalPlanningText = Brand<string, "InternalPlanningText">;
type LearnerNarrationText = Brand<string, "LearnerNarrationText">;
type DisplayText = Brand<string, "DisplayText">;
type TtsText = Brand<string, "TtsText">;
type SubtitleText = Brand<string, "SubtitleText">;
```

Do not rely on plain `string` for all content surfaces.

## Required content layers

At minimum, separate:

1. **Internal metadata**
   - validation results,
   - provenance,
   - review state,
   - compiler diagnostics,
   - prompt instructions,
   - confidence,
   - evidence references.

2. **Canonical math semantics**
   - quantities,
   - units,
   - categories,
   - operations,
   - equations,
   - solution steps,
   - misconceptions,
   - expected answers.

3. **Didactic intent**
   - learning objective,
   - prerequisite,
   - explanation strategy,
   - scaffolding,
   - worked example,
   - guided practice,
   - independent practice,
   - retrieval question,
   - summary.

4. **Learner-facing narration**
   - natural, age-appropriate speech only.

5. **Display content**
   - symbols, numbers, tables, formulas, labels, board state.

6. **TTS representation**
   - normalized pronunciation form.

7. **Subtitle representation**
   - readable standard orthography matching the spoken content.

## Hard boundary

No internal metadata object may be interpolated, serialized, or passed directly into learner-facing narration.

Introduce an allowlisted narration compiler that accepts canonical math semantics and didactic intent, not arbitrary internal objects.

---

# Phase 3 — Canonical Mathematical Content Model

Introduce a typed, domain-aware representation that prevents unbound raw values.

For categorical data lessons, support structures equivalent to:

```ts
interface CategoryFrequency {
  readonly categoryId: string;
  readonly categoryLabel: string;
  readonly frequency: number;
  readonly unitLabel?: string;
}

interface CategoricalDataset {
  readonly title: string;
  readonly context: string;
  readonly observations?: readonly string[];
  readonly frequencies: readonly CategoryFrequency[];
  readonly total: number;
  readonly mostFrequentCategoryIds: readonly string[];
}
```

## Invariants

Validate deterministically:

- all frequencies are non-negative integers,
- total equals the sum of frequencies,
- each category ID is unique,
- every narrated quantity is semantically bound,
- each display value has a known meaning,
- the most-frequent category is derived, not copied blindly,
- ties are represented correctly,
- no irrelevant concept such as a chart scale is added unless the lesson actually contains a chart.

## Domain vocabulary

For German grade 5, prefer:

- Urliste
- Strichliste
- Kategorie
- Anzahl
- Häufigkeit
- Gesamtzahl
- am häufigsten
- Fünfergruppe

Avoid or explain before use:

- Kategorietotal
- Maximum
- Skala
- Datensatz
- strukturierte Daten
- mathematische Beziehungen

Terminology must be configurable by locale, grade band, curriculum, and lesson type.

---

# Phase 4 — Didactic Lesson Compiler

Replace generic filler with domain-specific instructional logic.

## Required lesson structure

For a short grade-5 explanatory video, the compiler should support:

1. **Concrete hook**
2. **Clear learner-facing objective**
3. **Activation of prior knowledge only when relevant**
4. **Concrete model or example**
5. **Explicit explanation of the central rule**
6. **Worked example**
7. **Concrete misconception or error check**
8. **Guided practice**
9. **Independent transfer task**
10. **Adequate thinking pause**
11. **Solution with reasoning**
12. **Short mathematical summary**
13. **Retrieval question**

The exact structure should remain configurable by lesson type, but every included segment must have a clear instructional function.

## Grade-band profiles

Implement explicit grade profiles, at least:

```text
grades 5–6
grades 7–8
grades 9–10
```

Each profile must define:

- maximum sentence length,
- target vocabulary difficulty,
- maximum new concepts per scene,
- expected prerequisite language,
- explanation density,
- use of technical terminology,
- level of abstraction,
- preferred example contexts,
- default pause durations,
- required explanation depth.

Do not hardcode one generic pedagogical style for all grades.

## Grade-5 language requirements

For grade 5:

- short, direct sentences,
- concrete nouns,
- one main idea per sentence,
- explicit reference to visible objects,
- no unexplained process jargon,
- no internal quality language,
- no unnecessary meta-instructions,
- no repeated generic reminders about units or signs unless relevant,
- concrete questions with observable or calculable answers.

---

# Phase 5 — Task and Explanation Contracts

Every scene must have a typed instructional contract.

Example conceptual schema:

```ts
interface InstructionalScene {
  readonly sceneId: string;
  readonly purpose:
    | "hook"
    | "learning-objective"
    | "concept-explanation"
    | "worked-example"
    | "misconception-check"
    | "guided-practice"
    | "independent-practice"
    | "solution"
    | "summary"
    | "retrieval";
  readonly learnerPrompt?: string;
  readonly expectedAction?: "observe" | "count" | "calculate" | "compare" | "explain" | "transfer";
  readonly expectedAnswer?: unknown;
  readonly narration: LearnerNarrationText;
  readonly displayModel: unknown;
  readonly pausePolicy?: PausePolicy;
}
```

## Validation rules

- A practice scene must contain a concrete learner prompt.
- A misconception scene must contain an actual incorrect claim, display, or reasoning path.
- A solution scene must answer the preceding prompt.
- A summary must state the mathematical rule, not a generic study strategy.
- A learning objective must be fully covered by subsequent scenes.
- A retrieval scene must ask a concise question that can be answered from the lesson.
- Every referenced value must exist in the scene’s canonical math model.
- Every category mentioned visually must be narratable by label.
- Every narrated category and number must correspond to the current board state.

---

# Phase 6 — Natural German Narration

Build a learner-facing narration generation and linting layer.

## Forbidden learner-facing tokens

Maintain a configurable denylist and semantic detector for terms such as:

```text
reviewt
reviewter
geprüft
geprüfte Darstellung
geprüftes Modell
strukturierter Datensatz
Bindung von Zellen
Compiler
Validator
Provenienz
intern
Prompt
Schema
Payload
```

A simple denylist is not sufficient. Also detect paraphrased internal process language.

## Naturalness requirements

Narration should sound like a competent teacher:

Bad:

```text
Binde Kategorien, Zellen und Werte an den strukturierten Datensatz.
```

Good:

```text
Ordne jede Zahl der passenden Kategorie zu.
```

Better:

```text
Die 4 gehört zu den Äpfeln, die 3 zu den Birnen und die 5 zu den Bananen.
```

Bad:

```text
Leite Totale, Maximum und Skala unabhängig ab.
```

Good:

```text
Addiere zuerst alle Häufigkeiten. Danach schaust du, welche Kategorie die größte Anzahl hat.
```

## Redundancy control

Add semantic redundancy checks so the system does not repeatedly say:

- state the goal,
- choose the relationship,
- check units,
- verify signs,
- perform a countercheck,

when these steps add no instructional value.

Set configurable limits for repeated directives within a lesson.

---

# Phase 7 — Global Number and Symbol Verbalization

Introduce a deterministic number-verbalization layer before TTS.

Unlike the other behavior changes in this prompt, this layer is global and applies to every genre. Keep the implementation genre-neutral and limit cross-genre changes to correcting numeric pronunciation. All math-specific terminology and instructional behavior must remain behind the math profile.

## Required separation

```ts
interface VerbalizedValue {
  readonly display: string;
  readonly spoken: string;
  readonly subtitle: string;
}
```

Examples:

```ts
{ display: "12", spoken: "zwölf", subtitle: "12" }
{ display: "15", spoken: "fünfzehn", subtitle: "15" }
{ display: "4 + 3 + 5 = 12", spoken: "Vier plus drei plus fünf sind zwölf.", subtitle: "4 + 3 + 5 = 12" }
```

## Required behavior

- Never speak `12` as `eins zwei`.
- Never speak `15` as `eins fünf`.
- Never expose ASCII transliterations such as `fuenf` in final German subtitles.
- Normalize:
  - integers,
  - decimals,
  - negative numbers,
  - fractions,
  - percentages,
  - powers,
  - roots,
  - equations,
  - inequalities,
  - units,
  - ordinal numbers,
  - date-like strings only when contextually intended.
- Preserve mathematical meaning.
- Do not rely solely on the external TTS provider to interpret mathematical notation.

## Tests

Add table-driven tests for German number verbalization from grade 5 through grade 10.

---

# Phase 8 — Visual and Narration Synchronization

Create explicit semantic synchronization between:

- board state,
- narration,
- highlighted element,
- subtitle,
- learner task,
- expected answer.

## Required behavior

When narration says:

```text
Vier Kinder wählen Apfel.
```

the current scene must expose:

```text
category = Apfel
frequency = 4
```

When narration says:

```text
Vier plus drei plus fünf sind zwölf.
```

the board must display the same values and derived result at the correct moment.

## Prevent orphaned narration

Fail validation when:

- narration references a category not visible or defined,
- a visible value has no semantic label where one is needed,
- narration discusses a previous scene’s data accidentally,
- the task prompt and shown solution use different data,
- a board update appears before its explanation when the lesson design requires prediction,
- the summary shows values not established earlier.

---

# Phase 9 — Urliste and Strichliste Lesson-Specific Repair

Implement a domain-specific lesson fixture for the affected concept.

## Expected grade-5 conceptual progression

1. Show a concrete survey context.
2. Show the observations as an Urliste.
3. Explain that an Urliste records answers in the order collected.
4. Transfer each observation into a category row.
5. Set one tally mark per observation.
6. Explain the fifth diagonal tally mark.
7. Count each category’s frequency.
8. Add frequencies for the total.
9. Identify the most frequent category.
10. Show one concrete misconception.
11. Provide a second dataset for transfer.
12. Finish with a short rule summary.

## Example learner-facing wording

```text
Zwölf Kinder wurden nach ihrem Lieblingsobst gefragt.

In der Urliste stehen die Antworten in der Reihenfolge, in der sie genannt wurden.

Jetzt übertragen wir jede Antwort in die Strichliste.
Für jede Antwort setzen wir genau einen Strich.

Vier Striche stehen nebeneinander.
Der fünfte Strich geht quer durch die ersten vier.
So erkennen wir Fünfergruppen besonders schnell.

Bei Apfel stehen vier Striche.
Bei Birne stehen drei Striche.
Bei Banane stehen fünf Striche.

Vier plus drei plus fünf sind zwölf.
Insgesamt wurden also zwölf Kinder befragt.

Mit fünf Nennungen wurde Banane am häufigsten gewählt.
```

This is illustrative, not a mandatory hardcoded script. The system must generate equivalent quality from structured lesson inputs.

---

# Phase 10 — Semantic Validators and Release Gates

Replace “presence-only” validation with semantic quality gates.

## Mandatory hard failures

Fail generation when any of the following occurs:

1. Internal metadata language appears in learner narration.
2. Multi-digit numbers are verbalized digit by digit without explicit intent.
3. A learning objective mentions a concept not taught.
4. A practice task lacks a concrete question.
5. A solution does not answer the preceding task.
6. A misconception scene contains no concrete misconception.
7. A narration value is not semantically bound.
8. Narration and board state disagree.
9. The summary contains only generic process advice.
10. Grade-level vocabulary thresholds are violated.
11. German orthography contains avoidable transliteration in final content.
12. A generic instruction references units, signs, scale, or decimal places when absent from the math model.
13. The lesson repeats near-identical process instructions beyond the configured threshold.
14. The generated content cannot be understood from narration plus subtitles without hidden metadata.

## Soft warnings

Warn, score, and expose diagnostics for:

- long sentences,
- excessive noun phrases,
- abstract vocabulary,
- insufficient examples,
- insufficient pause duration,
- overloaded scenes,
- low ratio of mathematical explanation to generic instruction,
- excessive repetition,
- weak contextualization,
- too much narration before first mathematical action.

## Quality score

Add a structured report such as:

```ts
interface EducationalQualityReport {
  readonly factualCorrectness: number;
  readonly objectiveAlignment: number;
  readonly gradeAppropriateness: number;
  readonly explanationClarity: number;
  readonly taskClarity: number;
  readonly narrationNaturalness: number;
  readonly visualNarrationAlignment: number;
  readonly cognitiveLoad: number;
  readonly overall: number;
  readonly blockingIssues: readonly QualityIssue[];
  readonly warnings: readonly QualityIssue[];
}
```

Do not allow the label `reviewed`, `approved`, or `verified` unless all hard gates pass and required human approval, if configured, has occurred.

---

# Phase 11 — Golden Fixtures and Regression Suite

Create deterministic fixtures for the defective lesson.

## Required test fixtures

At minimum:

1. **Grade 5 — Urliste and Strichliste**
2. **Grade 5 — natural numbers**
3. **Grade 5 — simple geometry**
4. **Grade 6–7 — fractions**
5. **Grade 7–8 — percentages**
6. **Grade 8–9 — linear equations**
7. **Grade 9–10 — functions or quadratic equations**

The fixtures must prove that the architecture generalizes across domains.

## Golden assertions for the Strichliste fixture

Assert that:

- `Kategorietotal` is not used.
- `reviewt` is not used.
- `geprüfte Darstellung` is not used.
- `strukturierter Datensatz` is not used.
- `eins zwei` is not produced for 12.
- `eins fünf` is not produced for 15.
- `fuenf` is not present in final German narration or subtitles.
- Urliste is explicitly defined.
- Strichliste is explicitly defined.
- the fifth tally mark is explicitly explained.
- each category is named with its frequency.
- the total is calculated correctly.
- the most frequent category is identified correctly.
- the misconception is concrete.
- the transfer task contains a visible and spoken question.
- the transfer solution answers it.
- the final summary states the core rules.

## Snapshot strategy

Use semantic snapshots, not brittle snapshots of whole prose where unnecessary.

Snapshot:

- scene purposes,
- math facts,
- referenced values,
- learning-objective coverage,
- forbidden-token results,
- number verbalization,
- board/narration mapping,
- quality report.

Use controlled golden prose only for critical compiler outputs.

---

# Phase 12 — Prompt and Model Output Hardening

If LLMs generate lesson content:

1. Use strict structured output with JSON Schema or equivalent.
2. Do not ask the model to mix:
   - internal review notes,
   - render instructions,
   - learner narration,
   - math facts,
   - and final subtitles
   in one untyped text response.
3. Validate model output before accepting it.
4. Repair only the failing field, not the entire lesson, where safe.
5. Preserve canonical math facts during repair.
6. Bound prompt size.
7. Avoid sending unrelated curriculum history or excessive prior scenes.
8. Include grade profile, locale, and lesson type explicitly.
9. Require concrete tasks and answers.
10. Reject output containing internal vocabulary.
11. Add deterministic post-processing only for formatting, not for inventing mathematical meaning.
12. Record model, prompt version, schema version, temperature, seed if supported, and repair count.

## Repair policy

Repairs must not:

- introduce new numbers,
- change categories,
- change the correct answer,
- remove a required concept,
- turn a concrete task into generic language,
- leak validator messages.

If repair exceeds a configured count, fail with diagnostics rather than silently publishing poor content.

---

# Phase 13 — Workflow, CLI, Caching, and Idempotency

Integrate the changes into the existing production workflow.

## Required workflow properties

- resumable,
- idempotent,
- cache-aware,
- versioned,
- deterministic where practical,
- inspectable,
- auditable.

## Cache invalidation

Include in semantic cache keys:

- lesson schema version,
- canonical math model version,
- grade profile version,
- narration compiler version,
- number verbalizer version,
- locale,
- voice preset,
- renderer version,
- relevant prompt version.

Do not reuse old narration or subtitles after compiler changes.

## CLI improvements

Add or improve commands to support:

```text
lesson inspect
lesson validate
lesson compile
lesson render
lesson regenerate --stage narration
lesson regenerate --stage subtitles
lesson diff
lesson quality-report
lesson explain-failure
```

Adapt to the existing CLI conventions rather than creating a conflicting command system.

## Workflow log

Record per episode:

- completed stage,
- input hash,
- output hash,
- compiler version,
- timestamp,
- duration,
- cache hit/miss,
- validation result,
- quality score,
- errors,
- warnings,
- next executable stage,
- exact reproducible CLI command.

---

# Phase 14 — Observability

Add structured logs and metrics around educational quality and compiler behavior.

## Logs

Include:

- episode ID,
- lesson ID,
- grade,
- locale,
- domain,
- stage,
- schema version,
- compiler version,
- validation code,
- repair attempt,
- cache decision.

Never log secrets or full sensitive prompts unnecessarily.

## Metrics

Add metrics such as:

```text
math_lesson_generation_total
math_lesson_validation_failures_total
math_narration_internal_leak_total
math_number_verbalization_failure_total
math_objective_alignment_failure_total
math_scene_sync_failure_total
math_llm_repair_attempts_total
math_quality_score
math_generation_duration_seconds
```

Use bounded labels.

---

# Phase 15 — Documentation

Produce or update:

1. Architecture overview.
2. Content-layer contracts.
3. Canonical math schema.
4. Grade-profile documentation.
5. Narration compiler rules.
6. TTS normalization rules.
7. Validator catalog with error codes.
8. Workflow and cache behavior.
9. CLI usage.
10. How to add a new math topic safely.
11. How to add a new language safely.
12. How to review a generated lesson.
13. Migration notes for existing episodes.
14. Troubleshooting guide.

Add inline documentation for non-obvious code, especially:

- semantic boundary enforcement,
- number verbalization,
- objective coverage,
- scene synchronization,
- cache invalidation,
- repair invariants.

Avoid comments that merely restate code.

---

# Phase 16 — Migration and Backward Compatibility

Plan a safe migration.

## Required migration behavior

- Existing episodes remain readable.
- Old artifacts are marked with their compiler/schema version.
- Old narration is not treated as compliant automatically.
- Add a command to revalidate existing math episodes.
- Add a command to regenerate only affected stages.
- Preserve approved assets when their semantics remain valid.
- Provide a migration report identifying:
  - compliant episodes,
  - episodes requiring narration regeneration,
  - episodes requiring scene-plan regeneration,
  - episodes requiring full regeneration.

Do not mutate historical artifacts without an explicit workflow action.

---

# Multi-Agent Execution Plan

Use parallel workstreams with explicit file ownership.

## Agent A — Architecture and Forensics

Own:

- system map,
- root-cause analysis,
- schema boundaries,
- ADRs,
- migration plan.

Do not modify renderer or TTS files unless coordinated.

## Agent B — Didactic Compiler

Own:

- grade profiles,
- lesson structure,
- task contracts,
- objective coverage,
- terminology.

Coordinate schema changes with Agent A.

## Agent C — Narration and TTS

Own:

- German learner narration,
- number verbalization,
- forbidden-language detection,
- TTS/subtitle normalization.

## Agent D — Visual Synchronization

Own:

- scene/display contracts,
- board state,
- narration alignment,
- rendering-stage validation.

## Agent E — Validation and Test Infrastructure

Own:

- semantic validators,
- quality reports,
- golden fixtures,
- regression tests,
- release gates.

## Agent F — Workflow and Observability

Own:

- CLI integration,
- workflow logs,
- caching,
- metrics,
- failure diagnostics,
- revalidation/regeneration commands.

## Integration rule

No two agents modify the same file concurrently.

The lead agent must:

- assign ownership,
- maintain a shared decision log,
- review every contract change,
- run integration tests,
- resolve duplicated implementations,
- produce the final evidence report.

---

# Safe Implementation Batches

Implement in reviewable batches.

## Batch 1 — Evidence and Contracts

- repository map,
- defect trace,
- ADRs,
- internal/learner content boundary,
- canonical schema,
- no behavior change unless necessary for tests.

## Batch 2 — Number and Narration Safety

- number verbalization,
- German normalization,
- forbidden internal language,
- TTS/subtitle separation,
- focused unit tests.

## Batch 3 — Didactic Compiler

- grade profiles,
- lesson structure,
- task contracts,
- objective coverage,
- domain terminology.

## Batch 4 — Scene Synchronization

- display/narration contracts,
- board-state checks,
- transfer task and solution binding.

## Batch 5 — Semantic Validation

- hard gates,
- warnings,
- quality report,
- release-state rules.

## Batch 6 — Workflow Integration

- CLI,
- cache invalidation,
- stage regeneration,
- workflow log,
- observability.

## Batch 7 — Regression and Migration

- golden lessons,
- existing episode revalidation,
- migration report,
- full documentation.

After each batch:

1. run focused tests,
2. run type checking,
3. run linting,
4. run relevant integration tests,
5. record changed contracts,
6. update implementation status,
7. stop at a safe checkpoint if a later batch is blocked.

---

# Required Tests

Use the repository’s existing test framework. Add missing test layers where justified.

## Unit tests

- canonical dataset invariants,
- terminology selection,
- number verbalization,
- forbidden-language linting,
- objective coverage,
- task/solution binding,
- repetition detection,
- grade-profile rules.

## Property-based tests

Where appropriate:

- sum of frequencies equals total,
- verbalized integers never degrade into spaced digits,
- semantic references always resolve,
- category labels remain stable through localization,
- repair preserves math facts.

## Integration tests

- lesson spec to narration,
- narration to TTS text,
- lesson spec to scene plan,
- scene plan to board state,
- narration/board synchronization,
- validation failure propagation,
- cache invalidation after compiler version change.

## End-to-end test

Generate the complete grade-5 Urliste/Strichliste lesson through the production path.

Verify:

- narration,
- subtitles,
- scene manifest,
- board commands,
- quality report,
- workflow log,
- deterministic re-run behavior.

If rendering video is expensive, use a small deterministic test render in CI and a full render in release validation.

---

# Acceptance Criteria

The work is complete only when all of the following are true.

## Architecture

- Internal metadata and learner-facing text are type-separated.
- One canonical generation path is used by CLI, API, and batch workflows.
- Duplicate narration or validation implementations are removed or formally deprecated.

## Educational quality

- Grade profiles exist and affect generation.
- Learning objectives are checked against taught content.
- Practice tasks are concrete.
- Error checks contain actual errors.
- Summaries state mathematical rules.
- The Strichliste fixture is suitable for grade 5.

## Narration

- No internal pipeline terminology reaches final narration.
- German narration is natural and age-appropriate.
- Multi-digit numbers are spoken correctly.
- Mathematical notation is verbalized deterministically.
- Subtitles use correct standard German orthography.

## Synchronization

- Every narrated value is semantically bound.
- Narration, task, board state, and answer agree.
- Transfer tasks and solutions reference the same data.

## Validation

- Hard failures block publication.
- Validation produces structured error codes and actionable diagnostics.
- “Reviewed” or “verified” cannot be emitted without passing gates.

## Reliability

- Workflows are resumable and idempotent.
- Cache invalidation includes semantic compiler versions.
- Existing episodes can be revalidated and selectively regenerated.
- Logs and metrics make failures diagnosable.


## Cross-genre isolation

- Math-specific behavior is activated only by the math profile.
- Dark Truth, history, Veronica Benini, and other non-math genres retain existing defaults and artifacts.
- Shared changes are additive and covered by pre-change characterization tests.
- No non-math episode is invalidated, migrated, or regenerated automatically.
- Global number verbalization is corrected across genres without importing math-specific language or behavior.
- A dry-run impact report exists for any non-math speech or subtitle artifact whose normalized numeric output would change.

## Quality gates

All relevant commands pass:

```text
typecheck
lint
unit tests
integration tests
end-to-end lesson test
schema validation
golden fixture validation
```

Use the repository’s actual commands and document them.

---

# Required Final Deliverables

At completion, provide:

1. **Root-cause report**
   - exact causes,
   - affected modules,
   - why previous validators missed them.

2. **Architecture summary**
   - before/after pipeline,
   - key contracts,
   - eliminated duplicates.

3. **Implementation summary**
   - files changed,
   - modules added,
   - migrations performed.

4. **Test evidence**
   - commands,
   - results,
   - fixture coverage.

5. **Generated grade-5 sample**
   - learner narration,
   - subtitles,
   - scene manifest,
   - quality report.

6. **Migration report**
   - existing episodes requiring regeneration.

7. **Known limitations**
   - explicit, honest, and actionable.

8. **Next safe tasks**
   - only genuinely remaining work.

---

# Constraints

- Use strict TypeScript.
- Avoid `any`, unsafe casts, and unchecked JSON.
- Use exhaustive unions where appropriate.
- Validate external and model-generated data at runtime.
- Keep functions focused and modules cohesive.
- Prefer pure functions for semantic compilation and validation.
- Preserve mathematical correctness as an invariant.
- Do not hide failures with broad fallbacks.
- Do not publish or mark an episode complete after a failed educational quality gate.
- Do not reduce test strictness to make the implementation pass.
- Do not replace concrete defects with generic prompt changes only.
- Fix both deterministic code paths and LLM-assisted paths.
- Do not require manual editing for ordinary supported lessons.
- Do not change the established narration speed that was previously approved unless timing tests demonstrate a concrete problem.

---

# Initial Execution Instruction

Begin by inspecting the repository and producing:

1. a concise pipeline map,
2. a root-cause analysis for the supplied defective narration,
3. the list of affected packages and duplicate code paths,
4. a proposed file-ownership map for the agents,
5. the first safe implementation batch.

Then proceed with implementation without waiting for additional approval unless an irreversible product decision, missing credential, or genuinely ambiguous external contract blocks progress.

Prefer partial, validated progress over speculative large rewrites.
