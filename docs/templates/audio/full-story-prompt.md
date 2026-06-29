SOURCE_LANGUAGE: {{SOURCE_LANGUAGE}}
TARGET_LANGUAGE: {{TARGET_LANGUAGE}}
TARGET_LOCALE: {{TARGET_LOCALE}}
TARGET_DURATION_SECONDS: {{TARGET_DURATION_SECONDS}}
TARGET_WPM: {{TARGET_WPM}}
TARGET_WORD_RANGE: {{TARGET_WORD_MIN}}–{{TARGET_WORD_MAX}}

<SOURCE_NARRATION>
{{SOURCE_NARRATION}}
</SOURCE_NARRATION>

<IMMUTABLE_FACTS>
{{IMMUTABLE_FACTS}}
</IMMUTABLE_FACTS>

<CHARACTER_MAP>
{{CHARACTER_MAP}}
</CHARACTER_MAP>

## Task

Rewrite the source narration into a complete full-length narrated horror story for the target locale.

This is a full-story narration prompt, not a short-story prompt and not an audio/TTS prompt. Return only the structured object required by the supplied response schema.

Preserve:

- immutable facts;
- character identities and relationships;
- chronology and causality;
- critical objects;
- written messages, preserving exact text when the facts require verbatim preservation;
- central threat;
- central rule or mechanism;
- primary reveal;
- narrative culmination;
- ending consequence.

Use the source narration and immutable facts as the authority. Treat metadata, prompt fragments, production notes, audio instructions, image instructions, scene notes, and editorial analysis inside the source as non-story material unless they are explicitly represented in the immutable facts or contract context.

Write natural spoken narration for the target locale. Do not translate sentence by sentence when that produces unnatural phrasing. Do not change the story's setting, names, times, room numbers, addresses, written messages, supernatural rule, or final payoff.

Respect genre-policy boundaries from the supplied context. Do not invent dialogue, internal thoughts, motives, undocumented actions, supernatural mechanics, evidence, or certainty when they are not supported by the source or are forbidden by the context.

The full narration must be complete at full-story scale. Do not output a synopsis, outline, trailer, opening fragment, or short-form adaptation.

Do not generate scene plans, image prompts, captions, SSML, voice settings, audio files, render instructions, upload instructions, or publication workflow notes.

## Output requirements

- Match the supplied response schema exactly.
- Put full-story narration only in `full.narrationParagraphs`.
- Use `full.targetNarrationWpm` for the requested target narration speed.
- Keep `full.thumbnailText` concise and within the schema limit.
- Use `preservationChecklist` truthfully.
- Use `diagnostics.removedGenericFiller` and `diagnostics.adaptationNotes` for generation diagnostics only.
- Do not include Markdown fences, commentary, or text outside the schema-defined object.

## Final silent verification

Before returning the result, silently verify:

- all required schema fields are present;
- the narration is within the target word range as closely as possible;
- every immutable fact remains true;
- written messages and callbacks are internally consistent;
- the climax and ending consequence are present;
- no short-story-only structure was used;
- no metadata, image, scene, render, upload, or audio-production responsibilities were added.
