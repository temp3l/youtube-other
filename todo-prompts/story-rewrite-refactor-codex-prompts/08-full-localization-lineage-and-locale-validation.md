# Task: Full Localization Lineage And Locale Validation

Refactor localized full-story generation. Shorts are handled in later prompts.

## Objective

Ensure every localized full story derives directly from validated canonical English full narration and StoryIR.

## Required Lineage

```text
validated canonical English full story
  -> Spanish full localization (es-419)
  -> German full localization (de-DE)
  -> Portuguese full localization (pt-BR)
  -> French full localization (fr-FR, if requested)
```

No localization may derive from raw source, a short, metadata, audio instructions, or another localization.

## Requirements

- Preserve CLI command names and language arguments.
- Use localization model/config, not validator or short repair config, for full localization generation.
- Each request must include explicit language, locale, variant `full`, canonical English full hash, StoryIR hash, contract hash, prompt hash, and model config.
- Locale validation must detect wrong language, wrong locale, locale leakage, untranslated boilerplate, missing exact written messages where policy requires exact preservation, missing climax, and missing ending.
- A failed locale must not invalidate other successful locales.

## Tests

Add tests for:

- Spanish, German, Portuguese, and French locale selection;
- localized full cannot use raw source;
- localized full cannot derive from another locale;
- wrong language routes to full localization regeneration;
- locale module change invalidates only that locale full and its dependent shorts.

## Acceptance Criteria

- Localized full stories are first-class full artifacts.
- Every localized full has unambiguous canonical English parent lineage.
- Localized full stories never use short schemas or short regeneration.
