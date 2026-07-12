# Episodes 054–055 rewrite and quality gate

## Changed files

- `episodes/054-the-last-passenger/**`
- `episodes/055-the-babysitter-and-the-attic-door/**`
- This report

## Tests/checks run and results

- Replaced both duplicated sources with distinct scene-driven English stories.
- Episode 054 `stories rewrite-full`: English generated; German rejected for source-language leakage.
- Episode 054 `stories analyze --force --json`: `READY`, 89/100, no failed gates; thumbnail potential 10/10.
- Episode 055 `stories rewrite-full`: failed three runs. Two targeted source repairs corrected adult age and deterministic capitalized-name ambiguities, but the stable validator failure remains: `Character names are missing; Explanatory commentary follows the concrete reveal; Original character name leak detected: The`.
- No narration, images, thumbnails, video, or upload artifacts were created.

## Risks remaining

- Episode 055 is blocked by the story-localization protected-name/character extractor, likely misclassifying the title article `The` as a protected name.
- Episode 054 German localization needs targeted leakage diagnosis.

## Follow-up

- Fix or audit `packages/story-localization/src/generated-story-validator.ts` and canonical fact extraction for article-prefixed titles, then rerun episode 055.
- Inspect episode 054 failed DE artifact and repair localization without weakening validation.
