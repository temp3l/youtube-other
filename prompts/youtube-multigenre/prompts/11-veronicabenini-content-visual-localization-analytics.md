# Codex Goal 5 — veronicaBenini Content System, Visual Brand, Localization, Packaging, and Analytics

## Preconditions

Goal 4 should be complete and persona/voice approvals must be valid.

## Objective

Implement topic scoring, short-to-long content graphs, persona-appropriate visual production, packaging, multilingual QA, publication, and analytics learning for veronicaBenini.

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

## Topic pillars and viewer intent

Create configurable topic pillars based on the existing veronicaBenini genre/content sources. Do not invent definitive pillars without repository evidence; provide editable defaults and an operator approval step.

Classify viewer intent:
- learn;
- solve a problem;
- gain perspective;
- feel understood;
- be entertained;
- discover a book/concept;
- take a specific action.

Implement topic scoring for:
- audience relevance;
- persona/expertise fit;
- emotional usefulness;
- shareability;
- short-form potential;
- long-form depth;
- series potential;
- commercial fit where appropriate;
- source/claim support;
- production cost.

Never fabricate demand data.

## Short-to-long content graph

For each approved long video, plan optional:
- standalone teaser;
- question-driven short;
- quote/insight short;
- practical takeaway short;
- follow-up topic;
- community-post concept.

Every short must be independently understandable and must not be an arbitrary excerpt.

Track source ranges, rewritten context, CTA, target duration, platform, and relationship to the long-form video.

Do not auto-publish derived content without approval.

## Visual system

Create veronicaBenini-specific visual policies emphasizing:
- persona/presenter-led visuals when available and authorized;
- consistent lifestyle B-roll;
- books, objects, workspaces, and environments;
- short text cards and quotations;
- simple explanatory diagrams;
- recurring branded transitions;
- restrained generated imagery;
- warm and recognizable visual identity.

Do not inherit history asset counts or horror pacing.

Validate:
- brand consistency;
- authorized likeness/reference-image usage;
- no invented personal locations or possessions presented as factual;
- no dozens of unrelated cinematic AI scenes;
- mobile readability;
- continuity across languages.

## Packaging and publishing

Generate three meaningfully different title/thumbnail hypotheses consistent with persona and viewer intent.

Validate:
- no fabricated personal confession;
- no exaggerated promise;
- no unsupported endorsement;
- no generic motivational clickbait;
- mobile readability;
- promise delivered in the content.

Generate metadata, chapters, next-video routing, provenance, synthetic-media disclosure, and optional experiments through shared infrastructure.

## Multilingual localization

Use the existing ElevenLabs/provider strategy and one approved cloned voice where configured.

Validate per language:
- semantic fidelity;
- natural localization rather than literal translation;
- emotional intent;
- pronunciation;
- sentence rhythm;
- cultural references;
- on-screen text;
- title/thumbnail adaptation;
- claim and safety classification;
- voice authorization.

Create eligibility and cost approval before generating all languages.

Prefer one video with multiple audio tracks when the existing publishing integration supports it and channel strategy approves it.

## Analytics learning

Collect available metrics by:
- long-form episode;
- derived short;
- language/audio track where available;
- packaging experiment;
- topic pillar;
- viewer intent.

Diagnose:
- low CTR;
- early drop;
- mismatch between persona promise and content;
- strong short but weak long-form conversion;
- weak localization;
- high engagement with specific pillars;
- good views but low subscription/series continuation.

Require minimum samples and produce approved proposals only.

## Artifacts

Produce equivalents of:
- `veronicabenini-topic-score.json`
- `veronicabenini-content-graph.json`
- `veronicabenini-visual-plan.json`
- `veronicabenini-packaging-plan.json`
- `veronicabenini-localization-eligibility.json`
- `veronicabenini-localization-plan.json`
- `veronicabenini-publish-validation.json`
- `veronicabenini-performance-analysis.json`
- `veronicabenini-learning-proposals.json`.

## CLI/workflow

Add commands equivalent to:

```bash
youtube veronicabenini topics score
youtube veronicabenini content graph --episode <id>
youtube veronicabenini visuals plan --episode <id>
youtube veronicabenini package plan --episode <id>
youtube veronicabenini localization plan --episode <id>
youtube veronicabenini publish validate --episode <id>
youtube veronicabenini analytics analyze --episode <id>
```

Integrate into the normal genre workflow with approval gates.

## Tests

Cover:
- topic-score missing data;
- independent short comprehension;
- source-to-short lineage;
- persona-appropriate visual mix;
- authorized likeness/reference usage;
- no fabricated confession/clickbait;
- localization and language-specific voice authorization;
- analytics thresholds;
- approved profile updates;
- non-veronica regressions.

## Completion report

Return only architecture reused, files changed, commands, tests/results, example artifacts, assumptions/blockers, and recommended operating flow.
