# Codex Goal 2 — Horror Narrative, Reveal, and Continuity Intelligence

## Preconditions

Goal 1 should be complete, or equivalent opt-in shared extension points must exist.

## Objective

Implement horror-specific narrative planning and validation for Dark Truth and other horror profiles. Preserve story-specific suspense, prevent visual spoilers, and make story-bible/reference-image continuity first-class.

## Repository and compatibility rules

Inspect the repository first. Reuse existing genre profiles, workflow engine, CLI, story generation, localization, TTS providers, ElevenLabs integration, image generation, reference-image handling, story-bible handling, renderer, publishing, analytics, artifact paths, observability, caching, and tests.

Do not create parallel implementations when an existing abstraction can be extended.

Shared changes must be:
- additive;
- opt-in;
- backward compatible;
- activated only by the requesting genre profile;
- covered by characterization tests when they affect shared contracts, cache keys, prompt versions, normalizers, renderers, publishing, workflows, or artifact paths.

Preserve existing defaults and artifacts for history, math education, Dark Truth/horror, veronicaBenini, generic auto-genre, and all other genres unless the relevant profile explicitly activates the new behavior.

Never invalidate, migrate, rename, regenerate, or delete existing episodes automatically.

Use strict TypeScript, repository-standard schema validation, structured model outputs, bounded retries, deterministic validators, idempotent/resumable jobs, versioned cache keys, and production logging without secrets.

## Horror tension architecture

Create a configurable horror narrative model supporting roles such as:

```ts
type HorrorBeatRole =
  | "DISTURBANCE"
  | "UNEASE"
  | "ESCALATION"
  | "FALSE_EXPLANATION"
  | "FALSE_RELIEF"
  | "REVELATION"
  | "CONFRONTATION"
  | "IRREVERSIBLE_EVENT"
  | "AFTERMATH";
```

Do not require every story to use every role or the same order.

Each beat should include:
- stable ID;
- narration range and estimated timing;
- tension before/after;
- new information;
- withheld information;
- audience question;
- threat visibility;
- emotional purpose;
- visual/audio intent;
- continuity constraints;
- reveal dependencies.

Flag:
- long passages with no threat, discovery, escalation, emotional change, or meaningful uncertainty;
- repeated beat functions;
- reveals without setup;
- endings that explain away the horror unintentionally;
- identical tension curves across episodes.

## Reveal and spoiler control

Add:

```ts
type HorrorRevealLevel = "HIDDEN" | "IMPLIED" | "PARTIAL" | "EXPLICIT";
```

Each protected entity, object, location, injury, fate, creature, photograph, recording, or final reveal must define:
- allowed reveal level per beat;
- earliest allowed beat;
- prohibited opening/thumbnail exposure;
- whether visual depiction is allowed at all;
- silhouette/partial-detail rules;
- uncertainty requirements.

The script, visual planner, thumbnail generator, and renderer must not expose protected information before its release condition.

Add deterministic validation that catches:
- monster/antagonist shown too early;
- final location shown in the opening montage;
- victim fate revealed before narration;
- twist object visible in thumbnails;
- captions, metadata, filenames, or prompts leaking spoilers.

## Story-bible and reference-image continuity

Make existing Dark Truth story bibles and reference images mandatory inputs when configured.

Track:
- characters and physical traits;
- wardrobe and changes;
- injuries and chronology;
- objects and possession;
- locations, layout, architecture, and geography;
- time of day, season, and weather;
- creature/entity rules;
- camera/photographic style;
- color/lighting constraints;
- continuity-changing events.

Generate a continuity state per beat and validate every visual asset against it.

Support approved uncertainty rather than inventing details absent from the story bible.

## Horror originality

Compare new episodes against existing horror episodes using:
- plot mechanics;
- opening mechanism;
- threat type;
- setting;
- reveal structure;
- final-line pattern;
- key visual compositions;
- thumbnail concept;
- audio scare pattern.

Reject or warn on substantive repetition such as:
- repeated strange-message openings;
- identical abandoned-house progression;
- generic red eyes or shadow figures;
- repeated “it was behind me” reveals;
- same final-line mechanic;
- same twist concealed by surface wording changes.

## Artifacts

Produce repository-consistent equivalents of:
- `horror-narrative-plan.json`
- `horror-tension-analysis.json`
- `horror-reveal-policy.json`
- `horror-continuity-state.json`
- `horror-continuity-validation.json`
- `horror-originality-report.json`
- concise approval pack.

## CLI/workflow

Add commands equivalent to:

```bash
youtube horror narrative plan --episode <id>
youtube horror continuity validate --episode <id>
youtube horror reveal validate --episode <id>
youtube horror originality validate --episode <id>
```

Integrate before image prompt generation and rendering.

## Tests

Cover:
- multiple valid tension structures;
- early-reveal rejection;
- thumbnail spoiler rejection;
- story-bible/reference-image enforcement;
- injury/object/location continuity;
- uncertainty preservation;
- plot-mechanic similarity;
- Dark Truth characterization;
- no impact on history, math, veronicaBenini, or generic profiles.

Use several contrasting horror fixtures, not one canonical structure.

## Completion report

Return only architecture reused, files changed, commands, tests/results, fixture outputs, assumptions/blockers, and exact next command.
