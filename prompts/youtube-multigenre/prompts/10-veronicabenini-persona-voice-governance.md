# Codex Goal 4 — veronicaBenini Persona, Claims, and Cloned-Voice Governance

## Preconditions

Goal 1 should be complete, or equivalent shared opt-in infrastructure must exist.

## Objective

Implement a versioned veronicaBenini persona/editorial bible, voice-authentic script validation, claim integrity, and strict ElevenLabs cloned-voice governance.

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

## Persona and editorial bible

Create a versioned configurable profile covering:
- speaking style and sentence rhythm;
- vocabulary and register;
- humor and emotional range;
- recurring themes;
- preferred examples;
- acceptable calls to action;
- personal-story usage;
- short-form versus long-form differences;
- prohibited topics or styles;
- degree of expertise by subject area;
- brand identity and visual tone.

Do not reduce the persona to a small list of catchphrases. Prevent scripts from becoming repetitive.

Every episode should define:
- target viewer;
- viewer intent;
- topic pillar;
- desired takeaway/action;
- personal versus informational content;
- suitable format: short, long, or both;
- commercial/series relevance.

## Voice-authentic script validation

Detect:
- generic motivational filler;
- corporate or unnatural language;
- invented autobiographical experiences;
- invented opinions, relationships, preferences, or endorsements;
- excessive brand/name repetition;
- unsupported authority;
- sentence structures that sound translated;
- mismatch with short/long-form persona rules.

Use classifications equivalent to:

```ts
type PersonaStatementKind =
  | "VERIFIED_PERSONAL_FACT"
  | "APPROVED_PERSONAL_OPINION"
  | "EDITORIAL_INTERPRETATION"
  | "GENERAL_INFORMATION"
  | "RECOMMENDATION"
  | "PROHIBITED_INVENTED_PERSONAL_CLAIM";
```

Every personal claim must trace to an approved persona source or operator-provided fact. Never infer private biography from tone examples.

## Claim integrity

For books, psychology, lifestyle, business, relationships, culture, or recommendations, classify claims as:
- sourced fact;
- personal opinion;
- anecdote;
- interpretation;
- recommendation;
- potentially sensitive advice.

Prevent medical, psychological, legal, or financial advice from being framed as professional expertise unless explicitly supported and approved.

Create a compact research/source pack where factual claims require evidence.

## ElevenLabs cloned-voice governance

Extend the existing TTS provider abstraction. Track:
- provider and voice ID;
- authorized profile/use cases;
- owner/consent evidence reference;
- allowed languages;
- model/version;
- pronunciation overrides;
- generation provenance;
- approval state;
- prohibited uses;
- revocation/expiration status;
- fallback voice and failure policy.

Never silently switch to another clone or voice.

Block generation when:
- authorization is missing/expired/revoked;
- language is not allowed;
- use case is prohibited;
- required approval is missing.

Keep consent evidence secure and out of logs/artifacts intended for publication.

## Speech preparation

Generate provider-neutral narration plus provider-specific ElevenLabs input.

Validate:
- pronunciation;
- language rhythm;
- emotional intent;
- pauses;
- abbreviations/names;
- sentence length;
- unnatural accent artifacts through available automated/manual QA hooks;
- duplicated/missing speech;
- duration and loudness.

## Artifacts

Produce equivalents of:
- `veronicabenini-persona-profile.json`
- `veronicabenini-episode-intent.json`
- `veronicabenini-script-validation.json`
- `veronicabenini-claim-register.json`
- `veronicabenini-voice-authorization.json`
- `veronicabenini-speech-plan.json`
- `veronicabenini-audio-validation.json`
- approval pack.

## CLI/workflow

Add commands equivalent to:

```bash
youtube veronicabenini persona validate
youtube veronicabenini script validate --episode <id>
youtube veronicabenini voice validate --episode <id>
youtube veronicabenini speech prepare --episode <id>
```

Integrate before TTS generation.

## Tests

Cover:
- persona versioning;
- verified versus invented personal claims;
- sensitive-advice classification;
- authorization expiry/revocation;
- no silent voice fallback;
- per-language restrictions;
- pronunciation/provider adaptation;
- audio validation;
- non-veronica regressions.

## Completion report

Return only architecture reused, files changed, commands, tests/results, example artifacts, assumptions/blockers, and exact next command.
