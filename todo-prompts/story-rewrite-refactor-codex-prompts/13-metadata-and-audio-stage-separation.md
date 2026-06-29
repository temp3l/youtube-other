# Task: Metadata And Audio Stage Separation

Split metadata and audio instructions from narration generation for full and short variants.

## Objective

Ensure narration models never generate metadata or audio instructions, and metadata/audio failures never invalidate validated narration.

## Metadata

Metadata generation must be independent by language, locale, and variant:

- full video metadata;
- short video metadata;
- YouTube title, description, tags, hashtags, chapters where applicable;
- short metadata that links to or references the full video when available.

Use metadata model/config, not story or short narration config, unless a documented fallback is tested.

## Audio

Audio instructions and TTS must be separate by language, locale, and variant:

- full audio instructions;
- short audio instructions;
- full TTS;
- short TTS;
- speech model/voice config.

Do not put audio instructions in full or short narration prompts.

## Compatibility

Current rendered Markdown may include legacy metadata/audio sections. Add adapters or migration paths so downstream commands keep working while new canonical narration artifacts remain clean.

## Tests

Add tests for:

- narration prompts exclude metadata/audio;
- metadata failure does not invalidate narration;
- audio failure does not invalidate metadata or narration;
- short metadata depends on validated short narration, not short generation prompt internals.

## Acceptance Criteria

- Metadata and audio are independent artifact owners.
- Full and short variants have separate metadata/audio outputs.
- No narration model receives metadata or audio instructions.
