Transform the supplied source narration into a production-ready YouTube horror story for the requested target locale.

## Parameters

SOURCE_LANGUAGE: {{SOURCE_LANGUAGE}}
TARGET_LANGUAGE: {{TARGET_LANGUAGE}}
TARGET_LOCALE: {{TARGET_LOCALE}}
TARGET_DURATION_SECONDS: {{TARGET_DURATION_SECONDS}}
TARGET_WPM: {{TARGET_WPM}}
TARGET_WORD_RANGE: {{TARGET_WORD_MIN}}–{{TARGET_WORD_MAX}}

## Source narration

<SOURCE_NARRATION>
{{SOURCE_NARRATION}}
</SOURCE_NARRATION>

## Immutable story facts

<IMMUTABLE_FACTS>
{{IMMUTABLE_FACTS}}
</IMMUTABLE_FACTS>

## Character map

<CHARACTER_MAP>
{{CHARACTER_MAP}}
</CHARACTER_MAP>

## Task

Create a complete, cinematic horror narration that sounds as though it was originally written by a native writer for {{TARGET_LOCALE}}.

This is a creative localization, not a sentence-by-sentence translation.

Preserve the immutable facts, essential characters, central supernatural rule, important objects, causal sequence, climax, and final reveal.

You may:

- reorder the opening to create a stronger cold open;
- rewrite dialogue;
- shorten weak setup;
- expand important scenes;
- add small connective details required for causality;
- clarify where an important object came from;
- foreshadow a later sacrifice or rule;
- remove repetition and abstract explanation.

You may not:

- add unrelated characters;
- invent a new subplot;
- replace the central supernatural rule;
- change the identity of the protagonist;
- remove the climax;
- change the intended final consequence;
- contradict an immutable fact.

## Source-cleaning rule

The source may contain editorial commentary accidentally embedded in the narration.

Delete all sentences that discuss:

- what a scene means;
- why a detail matters;
- how the audience should react;
- where the story is structurally;
- whether the danger has become personal;
- whether a plan appears to work;
- whether a resolution is false;
- how evidence changes disbelief.

Do not translate, paraphrase, or preserve those sentences.

Examples of content that must be deleted rather than rewritten:

- “The repeated detail mattered.”
- “This was the moment disbelief ended.”
- “The danger became personal.”
- “The plan appeared to work.”
- “The false calm allowed the next change.”
- “The final evidence transformed survival.”

Replace them only when necessary with observable action, dialogue, sound, or physical evidence.

## Narrative requirements

### Opening

Open with the strongest supernatural contradiction, warning, deadline, or personal threat.

The first two sentences must create immediate curiosity.

After the cold open, return smoothly to the beginning when necessary.

### Setup

Introduce the protagonist, setting, and practical situation quickly.

Do not spend more than approximately 10% of the story on routine background before the first disturbing proof.

### Scene writing

Important moments must occur as scenes.

Use:

- visible actions;
- precise times;
- room numbers;
- physical objects;
- sounds;
- dialogue;
- changed photographs;
- recordings;
- environmental contradictions.

Avoid summary phrases equivalent to:

- strange things began happening;
- deaths started increasing;
- everything became worse;
- the truth became clear;
- she finally understood;
- the danger became personal.

### Supernatural logic

The central rule must be understandable and consistent.

Any attempted solution must follow logically from what the protagonist currently knows.

If the solution fails, the failure must reveal a hidden limitation of the established rule.

### Causality repair

Silently identify and repair unclear causal links in the source.

In particular:

- every important object must have a plausible origin;
- every critical action must have a clear motivation;
- every sacrifice must be foreshadowed sufficiently to feel earned;
- the protagonist must not make an obviously foolish decision merely to advance the plot;
- the final consequence must follow from earlier rules.

Use only minimal connective additions. Do not create new subplots.

### Escalation

Each major scene must introduce at least one new element:

- stronger proof;
- a contradiction;
- a personal connection;
- a deadline;
- a failed defense;
- a hidden cost;
- a narrowing escape route;
- a more intelligent response from the threat.

Do not repeat the same scare without changing its meaning.

### Climax and ending

Build toward one clear climax.

Use shorter sentences during intense action.

After the climax, allow only a brief false calm.

End with a concrete final image, sound, object, warning, or reveal.

The final sentence must be the final payoff. Do not explain it afterward.

## Spoken-language requirements

Write for narration, not silent reading.

Use:

- native syntax for {{TARGET_LOCALE}};
- short and medium-length sentences;
- clear pronoun references;
- restrained dialogue;
- natural spoken vocabulary;
- paragraph breaks that support breathing and pacing.

Avoid:

- literal source-language syntax;
- formal written constructions that sound unnatural aloud;
- overly dense subordinate clauses;
- generic horror clichés;
- melodrama;
- artificial retention phrases;
- repeated explanatory transitions.

## Final silent verification

Before returning the output, verify:

1. The story is within {{TARGET_WORD_MIN}}–{{TARGET_WORD_MAX}} words.
2. No editorial or structural commentary remains.
3. Every major object has a clear origin.
4. Character names and relationships are consistent.
5. Times, dates, room numbers, and locations do not conflict.
6. The supernatural rule remains consistent.
7. The attempted solution is motivated and plausible.
8. The climax is fully dramatized.
9. The ending pays off the opening.
10. The narration sounds natural in {{TARGET_LOCALE}}.
11. No source-language fragments remain.
12. The output is a complete story, not a synopsis.

Return exactly one object matching the supplied response schema.
Place the completed narration in the schema’s narration paragraph array, with one complete paragraph per array element.
Do not include Markdown fences, commentary, or text outside the schema-defined object.
