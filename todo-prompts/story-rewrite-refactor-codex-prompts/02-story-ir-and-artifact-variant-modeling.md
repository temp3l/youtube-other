# Task: StoryIR And Artifact Variant Modeling

Work on the existing story pipeline. Preserve public CLI commands and current artifact compatibility.

## Objective

Introduce or update domain modeling so source truth and artifact output constraints cannot be mixed. Full stories and shorts must be first-class variants.

## Required Model

Use repository conventions, but provide equivalent semantics:

- `StoryArtifactVariant = "full" | "short"`
- artifact owner: narration, metadata, audio, scene-plan, image-plan, render, publication
- identity: episode number, slug, language, locale, variant
- `FullStoryOutputConstraints`
- `ShortStoryOutputConstraints`
- discriminated `StoryOutputConstraints`

Do not store presentation constraints inside StoryIR if a separate artifact contract is cleaner. StoryIR must represent source truth: genre, fictionality, entities, immutable facts, chronology, central threat, central rule or mechanism, critical objects, written messages, climax, ending consequence, and allowed invention boundaries.

## Runtime Validation

Add runtime schemas for the model using the repository's schema library. Add issue types for StoryIR problems and artifact routing problems, including:

- `LOCATION_CLASSIFIED_AS_CHARACTER`
- `EVENT_CLASSIFIED_AS_CHARACTER`
- `SUPERNATURAL_RULE_IN_NONFICTION`
- `INVALID_WORD_RANGE`
- `FULL_STORY_ROUTED_TO_SHORT_GENERATOR`
- `SHORT_STORY_ROUTED_TO_FULL_REGENERATION`

## Compatibility

Add adapters from current `CanonicalStoryFacts`, story production artifacts, generated full packages, and short rewrite artifacts. Legacy artifacts may remain persisted, but final prompt compilation must consume the normalized model.

## Tests

Add focused unit tests for:

- discriminated union narrowing;
- invalid full/short constraint mixing;
- locale and variant identity;
- legacy adapter behavior;
- StoryIR validation issue codes.

## Acceptance Criteria

- Full and short variants are represented in types and runtime schemas.
- Artifact owners are explicit and typed.
- StoryIR does not own metadata/audio/render/publication requirements.
- Existing code can be migrated incrementally through adapters.
