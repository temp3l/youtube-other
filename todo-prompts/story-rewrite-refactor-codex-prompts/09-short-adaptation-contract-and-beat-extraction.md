# Task: Short Adaptation Contract And Beat Extraction

Make shorts first-class narration artifacts derived from validated full stories.

## Objective

Create deterministic short-source extraction and a compact short adaptation contract for each locale.

## Required Lineage

```text
validated locale full narration
  -> deterministic short-source extraction
  -> compact short-adaptation contract
```

English short derives from validated canonical English full. Spanish short derives from validated Spanish full. German short derives from validated German full. Portuguese short derives from validated Portuguese full. French short derives from validated French full if requested.

## Contract Contents

The short contract must include:

- parent full-story hash;
- StoryIR hash;
- required immutable facts;
- central threat;
- central rule or mechanism;
- critical object;
- climax or irreversible turn;
- final consequence or sting;
- exact written messages;
- allowed compression;
- forbidden omissions;
- facts that must remain;
- details that may be compressed;
- details that may be removed;
- dialogue that may be shortened;
- invention boundaries;
- locale;
- target duration, WPM, word range, hook deadline, maximum beats.

The contract must not duplicate the entire StoryIR or inject all full-story analyses.

## Tests

Add tests for:

- parent full validation required;
- parent full hash persisted;
- locale short contract uses matching locale full;
- orphaned references are detectable from removed beats;
- raw source input is blocked except documented compatibility mode.

## Acceptance Criteria

- Short generation has a deterministic contract before any model call.
- No localized short derives from English or another localization.
- Short metadata/audio/visual/render/publication are not prerequisites for short narration.
