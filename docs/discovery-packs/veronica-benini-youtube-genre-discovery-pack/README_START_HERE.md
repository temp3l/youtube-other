# Veronica Benini YouTube Genre Discovery Pack

Version: 0.1.0
Prepared: 2026-07-31
Target repository: `mediaforge` (private pnpm TypeScript/Node.js monorepo)

## Purpose

This pack defines a reusable YouTube genre for creator-led content about strategic
reinvention, independence, business, communication, feminism, personal time and
lifestyle design. It also defines a creator-specific profile for Veronica Benini.

The pack is designed for the existing Mediaforge pipeline:

- long-form and Shorts;
- typed, resumable production stages;
- localization;
- image, speech and FFmpeg rendering;
- metadata and YouTube upload;
- canonical episode filesystem through `createEpisodePathResolver`.

## The central recommendation

Use a reusable genre and a separate creator profile:

```text
genre: strategic-reinvention
creatorProfile: veronica-benini
```

Do **not** implement `veronica-benini` as a genre. The genre is reusable; the creator
profile contains her voice, vocabulary, boundaries, rights, offers and approval rules.

## Critical editorial constraint

Veronica has publicly stated that she writes newsletters and records podcasts without
AI support and considers this position important. Therefore the default implementation
must be:

```text
Human-authored source → AI-assisted adaptation/localization/production → human approval
```

The factory must not invent first-person opinions, experiences, claims or personal
stories in her name. Generative script drafting is disabled in the supplied creator
profile unless she explicitly approves another policy.

## Recommended reading order

1. `01-research/veronica-research-dossier.md`
2. `02-strategy/genre-and-channel-strategy.md`
3. `02-strategy/content-pillars-and-formats.md`
4. `03-product-spec/genre.strategic-reinvention.yaml`
5. `03-product-spec/creator.veronica-benini.yaml`
6. `03-product-spec/content-source.schema.json`
7. `03-product-spec/approval-workflow.md`
8. `04-implementation/mediaforge-architecture-changes.md`
9. `04-implementation/CODEX_IMPLEMENTATION_PROMPT.md`
10. `05-collaboration/veronica-onboarding-questionnaire.md`

## Pack contents

- Public research dossier and source register
- Book and intellectual-property map
- Reusable genre definition
- Creator profile
- Content-source and episode-blueprint schemas
- Editorial approval state machine
- Public/premium funnel
- Multilingual strategy
- 90-day pilot plan
- Rights and permissions checklist
- Veronica onboarding questionnaire
- Codex implementation prompt
- Sample episode briefs and content matrix

## Status

This is a discovery and implementation-planning pack. It is not permission to use
Veronica's name, books, voice, likeness, paid content or personal stories.

Before production, obtain written agreement on:

- ownership and usage rights;
- public versus premium content;
- adaptation and translation rights;
- voice and likeness;
- human authorship policy;
- review and publishing authority;
- revenue share and termination.
