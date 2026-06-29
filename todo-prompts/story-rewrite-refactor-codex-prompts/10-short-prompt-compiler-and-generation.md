# Task: Short Prompt Compiler And Generation

Refactor short generation as adaptation, not arbitrary summarization.

## Objective

Create a short-specific prompt compiler and generation route for canonical English short and localized shorts.

## Required Flow

```text
validated locale full narration
  -> deterministic short-source extraction
  -> compact short-adaptation contract
  -> short prompt compilation
  -> token and cost preflight
  -> short narration generation
  -> deterministic short validation
  -> optional semantic short validation
  -> targeted short-fragment repair
  -> controlled short regeneration
  -> final validated short narration
```

## Prompt Requirements

Short prompts must require:

- hook construction;
- immediate conflict;
- compressed escalation;
- one coherent narrative arc;
- clear ending or final sting;
- preservation of identity, threat, rule/mechanism, climax, and final consequence;
- removal of secondary characters and nonessential subplots;
- short target word range, duration, WPM, spoken rhythm, beat structure.

Short prompts must not contain full-video audio instructions, full-video scenes, metadata, tags, hashtags, thumbnails, rendering instructions, validation diagnostics, or repair history.

## Model Routing

Use short model/config for English short. Evaluate whether the same short model safely supports localized short adaptation or whether an explicit localized-short config is needed. Do not add redundant `.env` settings without tests and justification.

## Tests

Add tests for:

- short compiler excludes forbidden sections;
- full story cannot route to short generator;
- short schema is selected only for short variants;
- localized short uses matching localized full parent;
- deterministic extraction avoids repeated full-story payload injection.

## Acceptance Criteria

- Shorts are first-class narration artifacts.
- Short generation is variant-specific, cost-controlled, and lineage-safe.
- Current `stories rewrite-short` remains available through compatible orchestration.
