# Codex Goal 2 — Approved History Media Generation and Rendering

## Preconditions

Run this goal only after **Codex Goal 1 — History Visual Planner and Approval Gate** is complete and its tests pass.

A history episode must have:
- a finished narration script;
- a valid `HistoryVisualPlan`;
- a successful validation report;
- explicit human approval bound to the current plan hash.

If any precondition fails, stop with a clear diagnostic and next command. Never bypass, infer, or auto-create approval.

## Objective

Extend the existing video-production pipeline so an approved history visual plan becomes a **complete rendered visual sequence**.

Reuse the repository’s existing OpenAI image integration, asset storage, workflow engine, renderer/compositor, caching, retry logic, and episode artifact conventions. Do not create duplicate implementations.

## Isolation and compatibility

Keep behavior history-specific and profile-gated.

Shared changes must be additive, opt-in, backward compatible, and characterized by tests. Preserve all existing behavior and artifacts for Dark Truth/horror, math education, veronicaBenini, generic auto-genre, and every other genre. Never regenerate or migrate non-history episodes.

## Approved-plan execution

Implement a resumable workflow equivalent to:

1. Verify approval and plan hash.
2. Freeze an immutable generation manifest.
3. Generate or resolve each approved asset.
4. Validate each asset against its specification.
5. Build edited shots from assets using crops, motion, overlays, and diagram/map states.
6. Assemble and validate the render manifest.
7. Render the visual sequence.
8. Emit quality-control artifacts and workflow status.

A plan change after approval must require re-approval. Operational retry parameters may change without invalidating approval only when they cannot alter creative intent.

## Asset modes

### Generated historical scenes

Use OpenAI image generation through the existing provider abstraction.

Prompts must carry:
- period and precise date range;
- location and season;
- people, clothing, equipment, architecture, terrain, and weather constraints;
- composition and intended crop/motion;
- exclusions and uncertainty notes;
- consistent episode-level visual style.

Avoid unsupported exact likenesses or false documentary claims. Mark generated reconstructions appropriately in metadata.

### Maps

Generate maps from deterministic geographic data and overlays wherever practical; do not rely on image generation for text-heavy or geographically exact maps.

Maps should support:
- progressive route animation;
- highlighted locations;
- borders appropriate to the relevant date;
- readable labels and legends;
- mobile-safe typography;
- source/provenance metadata;
- explicit uncertainty where historical borders or routes are disputed.

Generated decorative textures may only be non-authoritative backgrounds.

### Diagrams and infographics

Render deterministic diagrams from structured data when possible:
- supply/logistics chains;
- attrition bands;
- timelines;
- cause/effect sequences;
- strategy-versus-outcome comparisons.

Text must remain crisp and editable. Do not embed critical labels inside generated raster art.

### Archival/documentary inserts

Use only repository-supported licensed/public-domain sourcing. Record:
- creator/title where known;
- source identifier;
- license/public-domain status;
- attribution text;
- retrieval timestamp;
- crop and transformation metadata.

When licensing cannot be verified, do not publish the asset. Fall back to an approved generated reconstruction or request operator action.

## Efficient asset reuse

Meet edited-shot targets without generating every shot as a unique image.

Allow one approved asset to create multiple materially distinct shots through:
- wide/detail crops;
- slow pan or zoom;
- restrained parallax;
- animated environmental layers;
- progressive map/diagram states;
- labels and callouts;
- before/after comparison;
- transitions into archival details.

Do not count negligible transformations as meaningful visual changes. Preserve source-to-shot lineage.

## Motion and rendering defaults

- Use smooth documentary motion.
- Avoid excessive Ken Burns movement.
- Do not apply camera motion that contradicts composition.
- Animate only relevant map/diagram information.
- Keep transitions restrained.
- Use text overlays only when approved or required for comprehension.
- Maintain mobile-safe areas and readability.

Synchronize shots to actual narration audio when available. Otherwise use planner estimates and mark the render provisional.

## Generation validation

For every asset, check:
- correct media type and dimensions;
- prompt/spec linkage;
- chronology, season, location, and continuity;
- duplicate or near-duplicate risk;
- obvious anachronism/malformed-content warnings;
- map/diagram label readability;
- provenance and generation metadata;
- bounded retry status.

Support:
- regenerate one asset;
- revise one prompt;
- approve an exception;
- resume without regenerating valid assets.

## Render manifest

Produce or extend a strongly typed render manifest containing:
- approved-plan hash;
- asset IDs and content hashes;
- shot order and exact timing;
- narration/audio alignment;
- crops, motion, parallax, overlays, and transitions;
- map/diagram animation states;
- provenance and attribution bindings;
- renderer version and configuration hash.

Validate:
- full narration coverage;
- no unintended gaps or overlaps;
- target shot density;
- mandatory map/diagram presence;
- no missing or unlicensed assets;
- correct aspect ratio and resolution;
- deterministic output for identical inputs.

## Artifacts

Produce repository-consistent equivalents of:
- `history-generation-manifest.json`
- `history-generated-assets.json`
- `history-render-manifest.json`
- `history-media-provenance.json`
- `history-attributions.md`
- `history-render-validation.json`
- final rendered visual sequence/full episode artifact
- workflow log with completed, failed, reusable, and next tasks

Keep intermediate files organized per episode and compatible with existing cleanup/archive behavior.

## CLI and operator flow

Follow repository conventions. Provide minimal commands equivalent to:

```bash
youtube history visuals generate --episode <id>
youtube history visuals regenerate --episode <id> --asset <asset-id>
youtube history visuals render --episode <id>
youtube history visuals validate --episode <id>
```

Where possible expose one resumable orchestration command that continues from approved state and skips valid completed work.

Support dry-run and cost-estimate modes before generation. Cost estimation must use the frozen approved asset manifest.

## Observability and reliability

Record:
- job and episode IDs;
- plan/config/provider/model versions;
- per-asset status, retries, latency, and cost metadata;
- cache hits;
- renderer stages and exit codes;
- validation warnings and operator overrides.

Use bounded concurrency and provider-aware rate limiting. Fail safely and preserve resumable state. Never log API keys or sensitive headers.

## Tests

Add:
- approval enforcement and stale-plan rejection;
- idempotent resume and cache tests;
- single-asset regeneration tests;
- deterministic map/diagram tests;
- source/license rejection tests;
- shot lineage/count validation;
- render gap/overlap tests;
- non-history characterization tests for shared changes;
- mocked end-to-end workflow.

Run the approved Napoleon fixture through the mocked end-to-end workflow. Verify:
- several campaign maps;
- logistics and attrition diagrams;
- summer-to-autumn-to-winter progression;
- diverse scenes and archival inserts;
- target asset/shot ranges;
- no generation before approval;
- resumability after an injected asset failure.

## Completion criteria

The goal is complete only when an approved history script can proceed through generation, asset validation, render-manifest assembly, and final visual rendering using existing repository conventions.

At completion report:
1. architecture reused and new components;
2. files changed;
3. operator commands;
4. test results;
5. example Napoleon counts and artifacts;
6. cost-control and retry behavior;
7. known limitations and next safe improvement.
