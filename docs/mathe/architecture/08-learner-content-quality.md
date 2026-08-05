# Learner content and educational quality

Status: incremental implementation, 2026-08-02. This document describes the
implemented math-only boundary and the independently versioned shared German
number verbalizer. It does not claim that every roadmap batch is complete.

## Canonical path and ownership

The evidence map and defect trace are in
[`../audits/2026-08-02-math-education-narration-root-cause.md`](../audits/2026-08-02-math-education-narration-root-cause.md).
Curriculum data is compiled by `packages/math-education` into a lesson
specification and canonical facts. Localization creates narration and display
text. `packages/speech` derives provider-bound TTS text without mutating source
or subtitles. `packages/math-rendering` validates ordered fact and scene
bindings before rendering. CLI inspection uses this same compiler path.

The content boundary is defined in
`packages/math-education/src/domain/content-boundaries.ts`. Planning,
learner narration, display, TTS, and subtitle strings are distinct branded,
runtime-validated values. The learner compiler input accepts canonical
categorical semantics, didactic intent, and typed instructional scenes; it has
no metadata or diagnostic field.

## Canonical categorical data

Each category carries an ID, display label, non-negative integer frequency,
and optional unit. The dataset validator requires unique IDs, a derived total,
all tied maxima, and observations that use known labels and match the total.
Unlabelled tuples cannot satisfy the learner-facing tally-list contract.

## Grade and narration policy

`grade-profiles.ts` defines separate 5–6, 7–8, and 9–10 limits for sentence
length, vocabulary, concepts per scene, explanation density, abstraction,
contexts, pauses, and explanation depth. The German tally-list compiler uses
concrete observations, defines Urliste and Strichliste, explains the diagonal
fifth mark, binds every frequency, calculates the total, and provides a
concrete misconception and transfer task.

Learner copy is rejected when it contains internal review/process language,
ASCII German transliterations, unresolved fact markers, unbound fact IDs,
raw tally tuples, or objective/task/solution/summary defects. The structured
quality report uses stable `MATH_*` codes and blocks publication when
`blockingIssues` is non-empty. Sentence length and cognitive-load findings are
warnings with scores. Detailed Urliste wording coverage is currently German;
other locales still receive shared structural, fact, task, and synchronization
checks but need their own objective-language rules.

## Number verbalization and cache behavior

`packages/speech/src/spoken-numeric-verbalizer.ts` is genre-neutral and
versioned independently. It distinguishes cardinal, ordinal, year, date, time,
decimal, percentage, currency, fraction, range, identifier, and explicit digit
intents. Only German provider-bound numeric text is normalized. Source copy,
subtitles, pacing, voice, and non-German bytes remain unchanged.

The speech cache adds the verbalizer version only when normalization changes
the provider text. Math semantic cache keys additionally include lesson,
canonical-model, grade-profile, narration-compiler, locale, voice, renderer,
prompt, and number-verbalizer versions. Invalidation is a dry-run plan;
regeneration is never scheduled automatically.

## Operator commands

```text
mediaforge math lesson inspect --lesson m5-dz-001-standard --language de
mediaforge math lesson validate --lesson m5-dz-001-standard --language de
mediaforge math lesson quality-report --lesson m5-dz-001-standard --language de
mediaforge math lesson explain-failure --lesson m5-dz-001-standard --language de
mediaforge math lesson diff --before old.json --after new.json
mediaforge math lesson regenerate --lesson m5-dz-001-standard --stage narration --dry-run
```

`regenerate` is deliberately non-mutating in this batch. Use the existing
authorized production workflow for execution after reviewing the plan.

## Safe extension and review

For a new topic, add canonical facts and deterministic checks, bind each scene
to ordered fact IDs, add terminology and a grade profile, then add semantic
quality and synchronization fixtures. For a new language, add glossary and
formatter coverage before templates or TTS; never translate canonical math.

Reviewers should run `lesson validate`, inspect every blocking issue and
warning, verify task/solution data identity, and listen to provider-bound speech.
Do not infer approval from legacy `reviewed` fields. Historical artifacts stay
readable but must be revalidated; no command here rewrites them.

Troubleshooting: an unknown fact means the narration/scene contract is stale;
a raw tuple means category semantics were lost; a changed semantic version
requires the smallest reported regeneration stage; a failed German safety lint
must be fixed in canonical content or the compiler, never suppressed.
