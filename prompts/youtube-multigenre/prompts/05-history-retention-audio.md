# Codex Goal 4 — History Script Retention and Audio Quality

## Preconditions

Goal 3 or equivalent approved history research artifacts must exist.

## Objective

Implement history-specific script-retention validation, speech preparation, pronunciation handling, audio gates, and sound-design planning without weakening historical accuracy or forcing every history format into the same structure.

## Repository and isolation rules

Inspect the repository first and reuse existing history, script, TTS, audio, workflow, artifact, CLI, and validation abstractions. Do not build a parallel pipeline.

Keep behavior history-specific. Shared changes must be additive, opt-in, backward compatible, and enabled only by the history profile. Preserve all non-history behavior and artifacts. Add characterization tests before changing shared normalizers, speech contracts, cache keys, renderers, workflows, or file paths.

Use strict TypeScript, schema validation, bounded retries, idempotent/resumable jobs, and production logging without secrets.

## Retention architecture

Add configurable typed analysis for:

- hook within approximately 5–15 seconds;
- clear viewer promise by roughly 30 seconds;
- one central question;
- unresolved narrative tension;
- meaningful reversal, discovery, escalation, or reframing every 45–75 seconds;
- transitions between abstract explanation and concrete human experience;
- midpoint escalation;
- conclusion resolving the title/promise;
- related-video bridge near the end.

Flag exposition-only passages around 60–90 seconds without a reset, repeated paragraph functions, excessive spoken complexity, headings leaking into narration, reused openings/closings, generic conclusions, and unresolved title promises.

These are configurable ranges, not rigid formulas.

## Narration-safe output

Narration must remain plain speech text without headings. Preserve approved facts and uncertainty. Optimize sentence length for speech, normalize dates, monarch names, Roman numerals, units, abbreviations, and large numbers, and preserve deliberate pacing.

Do not globally change established voice speed. Use existing genre/video configuration.

## Pronunciation

Integrate the research pronunciation dictionary for names, historical places, titles, dynasties, foreign terms, years, ranges, and abbreviations.

Keep canonical narration provider-neutral. Generate provider-specific hints through adapters.

Produce repository-consistent equivalents of:

- `history-retention-analysis.json`
- `history-script-validation.json`
- `history-pronunciation.json`
- `history-speech-text.txt`
- `history-audio-validation.json`
- `history-sound-plan.json`

## Audio quality gates

Reuse existing TTS/audio tools and detect clipping, silence anomalies, repeated or missing speech, duplicated sentences, speed inconsistency, loudness problems, excessive pauses, breathless passages, provider failures, and duration mismatch.

Support bounded regeneration/repair without regenerating valid artifacts.

## Sound-design plan

Create a history-specific plan with phases such as setup/mystery, preparation/confidence, escalation, crisis/disaster, and aftermath/reflection.

Specify music intensity, narration ducking, ambience transitions, restrained effects, silence, and high-impact pauses. Avoid continuous epic music and excessive battle effects.

## CLI/workflow

Add commands equivalent to:

```bash
youtube history script validate --episode <id>
youtube history speech prepare --episode <id>
youtube history audio validate --episode <id>
youtube history sound plan --episode <id>
```

Integrate these before history visual generation/rendering.

## Tests

Cover hooks/promises, reset timing, factual-strength preservation, no-headline narration, pronunciation normalization, repeated speech, audio gates, sound-plan validation, and non-history regressions.

Test Napoleon, Bronze Age Collapse, and an everyday-life episode so military pacing is not universalized.

## Completion report

Return only architecture reused, files changed, commands, tests/results, example warnings/fixes, assumptions/blockers, and the exact next command.
