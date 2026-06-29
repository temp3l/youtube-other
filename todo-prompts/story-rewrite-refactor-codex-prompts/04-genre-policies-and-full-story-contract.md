# Task: Genre Policies And Full-Story Contract

Work on full-story generation policy only. Shorts are handled by later prompts.

## Objective

Implement centralized genre policy and a compact full-story contract for canonical English and localized full stories.

## Genre Policy

Support at least:

- fictional supernatural;
- fictional psychological;
- historical mystery;
- true crime;
- documentary;
- folklore;
- unknown.

Nonfiction, documentary, historical mystery, and true crime must be evidence-led and must not invent dialogue, internal thoughts, motives, supernatural rules, adaptive threats, rituals, fictional defenses, unsupported climaxes, or overstated certainty.

Fictional supernatural stories may preserve established rules but must not invent unrelated mechanics. Psychological stories must separate perceived threat from confirmed reality. Folklore must distinguish tradition from claimed fact.

## Full-Story Contract

Define a compact contract derived from StoryIR and cleaned source:

- immutable facts;
- chronology;
- required entities;
- central threat or mystery;
- central rule or mechanism when present;
- critical objects;
- exact written messages;
- climax;
- final consequence;
- invention boundaries;
- target language and locale;
- full word range, WPM, and duration target.

The contract must be separate from metadata, audio, scene, image, render, and publication instructions.

## Tests

Add tests for:

- nonfiction cannot receive supernatural policy;
- environmental threats are not intelligent unless established;
- written messages remain exact;
- full contract excludes short-only hook and beat constraints;
- full contract excludes metadata/audio/visual fields.

## Acceptance Criteria

- Full-story policy is deterministic and centralized.
- Full stories have an explicit contract independent of shorts.
- Full stories cannot be routed through short constraints or short schemas.
