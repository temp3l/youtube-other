# Codex Goal 5 — History Packaging, Publishing, Series, and Provenance

## Preconditions

The history workflow should already produce approved research, narration, visual, and render artifacts.

## Objective

Implement title/thumbnail planning, metadata, chapters, playlists/series, related-video routing, provenance, licensing checks, synthetic-media disclosure, originality safeguards, and packaging experiments.

## Repository and isolation rules

Inspect the repository first and reuse existing history, thumbnail, publishing, YouTube, workflow, asset, provenance, CLI, and validation abstractions. Do not build a parallel pipeline.

Keep behavior history-specific. Shared changes must be additive, opt-in, backward compatible, and enabled only by the history profile. Preserve all non-history behavior and artifacts. Add characterization tests before changing publishing contracts, upload defaults, cache keys, asset metadata, workflow state, or file paths.

Use strict TypeScript, schema validation, approval gates, idempotent/resumable jobs, and production logging without secrets.

## Packaging hypothesis

Create a typed `HistoryPackagingPlan` containing:

- central viewer question and promised payoff;
- target audience;
- three meaningfully different title candidates;
- three meaningfully different thumbnail concepts;
- pairing rationale;
- verification that the approved script fulfills the promise;
- prohibited misleading implications;
- experiment plan.

Variants must be genuinely different, not minor rewrites. Support directions such as scale, transformation, strategic contradiction, mystery/evidence, and human consequence.

Keep thumbnail text minimal and mobile-readable. Integrate existing thumbnail generation through its provider abstraction; otherwise generate approved specifications/prompts only.

## Metadata, chapters, and continuation

Generate repository-consistent metadata:

- concise description and source notes;
- chapters based on final audio/video timings, never narration headings;
- pinned-comment draft;
- source and attribution section;
- disclosure note when required;
- end-screen/card recommendation;
- one explicit next-video recommendation.

The spoken ending, end screen, description, pinned comment, and playlist should point to the same related episode where practical.

## Series/playlists

Assign a primary pillar/series and optional supporting playlists. Support official series-playlist metadata when available. Avoid generic next-video routing.

## Provenance and licensing

Track each asset as generated, archival, public-domain, licensed, transformed, or composited. Store provider/model/prompt/version for generated assets and source, creator/title, licence, retrieval date, attribution, and transformations for external assets.

Bind every rendered shot to source assets. Block publication when required licensing or attribution cannot be verified.

## Synthetic-media disclosure

Create a deterministic publication decision for realistic altered or synthetic media. Store triggering assets, rationale, operator override/audit metadata, and platform field mapping.

Never present generated reconstructions as archival evidence.

## Anti-mass-produced safeguards

Validate opening/closing similarity, repeated scene structures, near-identical thumbnails, generic conclusions, excessive asset/music/transition reuse, lack of original analysis, and missing required explanatory media.

Allow consistent branding while rejecting substantive repetition.

## A/B experiments

Use native YouTube title/thumbnail testing when already supported; otherwise emit a manual experiment artifact. Track candidate IDs, hypothesis, status, winner, and evidence. Do not auto-change published packaging without configured approval.

## Artifacts

Produce equivalents of:

- `history-packaging-plan.json`
- `history-title-thumbnail-candidates.md`
- `history-publishing-metadata.json`
- `history-chapters.json`
- `history-series-routing.json`
- `history-provenance.json`
- `history-attributions.md`
- `history-disclosure-decision.json`
- `history-originality-validation.json`

## CLI/workflow

Add commands equivalent to:

```bash
youtube history package plan --episode <id>
youtube history publish validate --episode <id>
youtube history publish prepare --episode <id>
youtube history experiment prepare --episode <id>
```

Require explicit approval before upload or packaging changes.

## Tests

Cover promise-versus-script validation, meaningful variant diversity, mobile thumbnail constraints, chapter timing, next-video consistency, licence rejection, disclosure fixtures, originality checks, approval enforcement, and non-history regressions.

## Completion report

Return only architecture reused, files changed, commands, tests/results, sample artifacts, assumptions/blockers, and the exact next command.
