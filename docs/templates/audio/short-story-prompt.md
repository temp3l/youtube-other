Transform the following validated full-length {{TARGET_LOCALE}} horror narration into a complete YouTube Short.

This prompt is used by the story short-rewrite flow. It receives finalized full-story narration text and must return only the structured short-story object required by the response schema. It is not an audio/TTS prompt.

TARGET_DURATION_SECONDS: {{TARGET_DURATION_SECONDS}}
TARGET_WPM: {{TARGET_WPM}}
TARGET_WORD_RANGE: {{TARGET_WORD_MIN}}–{{TARGET_WORD_MAX}}

<FULL_LOCALIZED_STORY>
{{FULL_LOCALIZED_STORY}}
</FULL_LOCALIZED_STORY>

Preserve:

- the strongest cold open;
- the central supernatural rule;
- one concrete proof;
- one personal reveal;
- one consequence or climax;
- the strongest final callback.

The Short must be a miniature complete story, not a synopsis, preview, trailer, or opening fragment.

Do not translate from any language other than the supplied full story. If locale settings are injected below, use them only to make the final short sound natural in the target locale while preserving the full story's facts and ending.

Required structure:

1. Hook within the first two sentences.
2. Minimal setup.
3. Clear supernatural rule.
4. Concrete proof.
5. Personal escalation.
6. Final consequence or callback.

Use concrete actions, sounds, objects, times, and locations.

Do not use phrases equivalent to:

- strange things started happening;
- she finally understood;
- the danger became personal;
- the plan seemed to work;
- what happened next was terrifying.

Do not explain the plot structure.

Do not introduce lore that cannot be understood within the Short.

Do not include a sacrifice unless its mechanism and consequence can be understood immediately.

Do not produce YouTube metadata, tags, scene plans, image prompts, captions, audio instructions, SSML, voice settings, or production notes.

Do not repair or normalize the source full story beyond what is necessary to produce a coherent short that preserves the supplied facts. Do not add facts, names, rules, written messages, or locations that are not supported by the full story.

End on a concrete visual or auditory image. Do not explain the ending afterward.

Before returning the result, silently verify:

- it is within the target word range;
- it contains a complete ending;
- it preserves the central rule;
- it does not contradict the full story;
- it sounds natural when narrated;
- it contains no metadata, image, scene, localization, or audio-production instructions;
- it contains no editorial commentary.

Return exactly one object matching the supplied response schema.
Place the completed narration in the schema’s narration field as a single spoken script string.
Populate the schema fields for title, hook, word count, estimated durations, thumbnail text, and full-video bridge only when those fields are present in the supplied schema.
Do not include Markdown fences, commentary, or text outside the schema-defined object.
