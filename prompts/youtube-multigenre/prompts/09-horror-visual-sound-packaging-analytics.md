# Codex Goal 3 — Horror Visual Rhythm, Sound, Packaging, and Analytics

## Preconditions

Goal 2 should be complete and horror reveal/continuity artifacts must be available.

## Objective

Implement horror-specific visual pacing, sound-led production, packaging safeguards, publication gates, and analytics learning.

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

## Horror visual rhythm

Do not apply history-style constant visual-change targets.

Implement profile-configurable rhythm such as:
- fast visual changes during the opening hook;
- longer controlled holds during suspense;
- sudden cuts for discoveries;
- nearly static images with subtle motion during uncertainty;
- shorter cuts during panic/confrontation;
- slower aftermath pacing.

Meaningful motion may include:
- restrained push-in;
- focus shift;
- shadow/light change;
- fog, rain, dust, or environmental motion;
- subtle parallax;
- delayed background-figure appearance;
- object-state change.

Do not count negligible transformations as new shots.

Validate that image duration and motion align with tension/reveal states.

## Sound-led horror plan

Create structured sound plans for:
- silence placement;
- room tone;
- distant unexplained sounds;
- low-frequency escalation;
- ambience withdrawal;
- restrained impacts;
- diegetic/non-diegetic transitions;
- panic/confrontation;
- aftermath.

Reject:
- uninterrupted maximum-intensity drones;
- repetitive jump-scare stingers;
- sound effects that reveal the threat too early;
- excessive effects masking narration;
- identical sound curves across episodes.

Reuse existing music/SFX licensing and provenance systems.

## Horror packaging

Generate three differentiated title/thumbnail hypotheses that preserve mystery and do not expose protected reveals.

Validate:
- no spoiler text;
- no final creature/fate/location;
- no generic red-eye/distorted-face default;
- mobile readability;
- promise delivered by the story;
- substantial difference from recent horror packaging.

Support title/thumbnail experiments with approval.

## Publication and provenance

Bind horror assets, audio, reference images, generated reconstructions, and transformations to provenance records.

Apply platform synthetic-media/disclosure rules through the shared publication decision.

Do not imply that fictional or generated horror footage is authentic evidence unless the channel format explicitly frames it as fiction and publication metadata is consistent.

## Horror analytics

Collect available metrics and diagnose:
- low CTR;
- early-hook drop;
- drop during exposition;
- overlong suspense hold;
- reveal spike;
- post-reveal drop;
- strong completion but weak next-video continuation;
- thumbnail spoiler versus curiosity balance.

Require minimum samples and compare with horror-series baselines.

Create proposals, not silent changes, for:
- opening length;
- suspense hold duration;
- reveal timing;
- thumbnail abstraction;
- sound intensity;
- story length;
- next-video routing.

## Artifacts

Produce equivalents of:
- `horror-visual-rhythm-plan.json`
- `horror-sound-plan.json`
- `horror-packaging-plan.json`
- `horror-disclosure-decision.json`
- `horror-publish-validation.json`
- `horror-performance-analysis.json`
- `horror-learning-proposals.json`.

## CLI/workflow

Add commands equivalent to:

```bash
youtube horror visuals plan --episode <id>
youtube horror sound plan --episode <id>
youtube horror package plan --episode <id>
youtube horror publish validate --episode <id>
youtube horror analytics analyze --episode <id>
```

Integrate into the normal horror workflow.

## Tests

Cover:
- tension-aware shot durations;
- reveal-safe motion/prompts;
- sound contrast and silence;
- spoiler-safe packaging;
- provenance/disclosure;
- analytics minimum samples;
- approved proposal/versioning;
- non-horror regressions.

## Completion report

Return only architecture reused, files changed, commands, tests/results, example artifacts, assumptions/blockers, and exact next command.
