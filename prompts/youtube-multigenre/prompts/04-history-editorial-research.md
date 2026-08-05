# Codex Goal 3 — History Editorial Strategy, Topic Scoring, and Research Integrity

## Objective

Implement a reusable editorial and research foundation for all future history videos. It must select stronger topics, preserve a recognizable channel identity, and create evidence-backed research packs before script generation.

## Repository and isolation rules

Inspect the repository first and reuse its history profile, workflow engine, OpenAI/provider abstractions, artifact conventions, CLI, persistence, observability, and tests. Do not build a parallel pipeline.

Keep behavior history-specific. Shared changes must be additive, opt-in, backward compatible, and enabled only by the history profile. Preserve all existing behavior and artifacts for Dark Truth/horror, math education, veronicaBenini, generic auto-genre, and other genres. Add characterization tests before changing shared contracts, cache keys, renderers, workflows, publishing behavior, or artifact paths.

Use strict TypeScript, schema-validated structured outputs, bounded retries, idempotent/resumable jobs, versioned cache keys, and production logging without secrets.

## Editorial profile

Create a typed configurable history profile with default pillars:

- collapses and turning points;
- military disasters and strategic mistakes;
- expeditions, mysteries, and unresolved events;
- everyday life in past societies;
- famous figures beyond the popular legend.

Each episode must record its pillar/series, target viewer, central historical question, promised payoff, channel fit, evergreen status, and best related/next episode. Allow configuration and overrides without code changes.

## Topic opportunity scoring

Implement a deterministic `HistoryTopicScore` with documented weights for:

- audience/search demand when real data exists;
- central-question strength;
- historical significance;
- visual potential;
- credible-source availability;
- competition/saturation;
- evergreen value;
- series/channel fit;
- misconception-correction or novelty potential;
- production difficulty and expected cost.

Distinguish measured data, inference, and editorial judgment. Never fabricate search volume. Degrade gracefully when analytics are unavailable. Produce ranked candidates, score breakdowns, risks, rejection reasons, and auditable manual overrides.

Reuse an existing YouTube/analytics integration when present. Otherwise create interfaces and fixtures rather than unreliable scraping.

## Research-pack workflow

Before final script generation, create repository-consistent equivalents of:

```text
research-pack/
  claims.json
  sources.json
  chronology.json
  people.json
  places.json
  disputed-claims.json
  pronunciation.json
  visual-accuracy-constraints.json
  research-summary.md
```

Every material claim must include:

- stable ID and concise statement;
- `ESTABLISHED | ACCEPTED_INTERPRETATION | DISPUTED | UNCERTAIN | MYTH_CORRECTION`;
- supporting source IDs;
- relevant dates, places, and people;
- confidence and maximum acceptable narration strength;
- visual constraints;
- unresolved questions.

Each source must include title, author/organization, date, type, identifier/URL when applicable, primary/secondary status, authority/relevance notes, licence/provenance where relevant, and retrieval metadata.

Prefer primary sources, scholarship, museums, archives, universities, and established institutions. A model response is not evidence.

## Consistency validation

Validate chronology, date conflicts, people/places, historical versus modern place names, disputed borders/routes, seasonal progression, overstated claims, and script facts absent from the approved research pack.

Expose uncertainty instead of inventing certainty. Support approved exceptions with rationale and audit metadata.

## Script contract

Future history script generation must consume the approved central question, editorial promise, claims, dispute classifications, chronology, pronunciation dictionary, and visual constraints. It must not silently introduce new material claims.

## Approval and workflow

Add commands consistent with the repository, equivalent to:

```bash
youtube history topics score --input <file>
youtube history research build --episode <id>
youtube history research validate --episode <id>
youtube history research approve --episode <id> --pack-hash <hash>
```

Approval must bind to an immutable research-pack hash; material changes invalidate it.

## Tests

Cover scoring and missing data, pillar classification, claim-strength enforcement, chronology/season conflicts, source validation, stale approval, script claims outside the pack, and non-history regressions.

Use Napoleon’s 1812 campaign and the Bronze Age Collapse as contrasting fixtures.

## Completion report

Return only architecture reused, files changed, commands, tests/results, fixture outputs, assumptions/blockers, and the exact next command.
