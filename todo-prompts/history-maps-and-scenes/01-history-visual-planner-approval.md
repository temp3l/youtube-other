# Codex Goal 1 — History Visual Planner and Approval Gate

## Objective

Implement a production-grade, OpenAI-driven visual planner for the existing **history genre**.

Input: a finished history narration script.  
Output: a validated visual production plan and human-readable approval pack.  
Hard gate: **no image, map, diagram, archival-media, or video generation may start before explicit human approval**.

Start by inspecting the repository, existing history profile, workflow engine, CLI, artifact conventions, OpenAI integration, render manifests, and approval/state mechanisms. Reuse existing implementations. Do not create a parallel pipeline when an existing abstraction can be extended safely.

## Isolation and compatibility

Default all behavior changes to history-specific packages, presets, workflows, and CLI integration.

Shared-package changes must be:
- additive and opt-in;
- activated only by the history profile;
- backward compatible;
- covered by characterization tests when they affect contracts, cache keys, renderers, workflows, or artifact paths.

Preserve existing defaults and artifacts for Dark Truth/horror, math education, veronicaBenini, generic auto-genre, and all other genres. Never invalidate, migrate, regenerate, or rename existing non-history episode artifacts.

## Required workflow

Implement a resumable workflow equivalent to:

1. Load and validate the finished narration script.
2. Estimate narration duration using configured speech-rate metadata when available; otherwise use a documented history default.
3. Extract structured historical entities and visual requirements:
   - dates and periods;
   - people and organizations;
   - places and routes;
   - battles, migrations, invasions, retreats, border changes, and trade routes;
   - causes, consequences, comparisons, logistics, attrition, and systems explanations;
   - seasonal and chronological phases;
   - claims requiring factual or visual constraints.
4. Segment the narration into timed visual beats.
5. Assign each beat one or more visual treatments:
   - cinematic historical scene;
   - map;
   - diagram or infographic;
   - archival painting, portrait, manuscript, document, photograph, or artifact;
   - reusable establishing or transitional visual.
6. Calculate unique-asset and edited-shot targets.
7. Produce machine-readable plans and a concise Markdown approval pack.
8. Set workflow state to `AWAITING_VISUAL_APPROVAL`.
9. Exit successfully without calling media-generation or rendering providers.

## History defaults

Encode these defaults in typed configuration and deterministic heuristics, not only in prompts.

### Runtime scaling

| Estimated runtime | Unique assets | Edited shots |
|---|---:|---:|
| 0–4 min | 16–24 | 24–36 |
| 4–7 min | 24–32 | 36–50 |
| 7–10 min | 35–45 | 55–70 |
| 10–15 min | 45–60 | 70–95 |

Interpolate within ranges. Allow profile and episode overrides.

### Default visual mix

- 60–70% cinematic historical scenes
- 10–15% maps
- 8–12% diagrams/infographics
- 10–15% archival/documentary inserts

Adapt ratios to the script while retaining diversity.

### Mandatory map triggers

Require at least one map when the script contains:
- invasion, campaign, retreat, migration, exploration, trade route, territorial change, or shifting front;
- three or more materially important named locations;
- geography-dependent causation.

Generate multiple map beats when the audience must understand changing positions over time.

### Mandatory diagram triggers

Require explanatory graphics for:
- logistics or supply chains;
- force attrition;
- systems collapse;
- political or economic causal chains;
- timelines with several dependent events;
- comparisons between intended strategy and actual outcome.

### Cadence

- Opening 20–30 seconds: meaningful visual changes approximately every 3–5 seconds.
- Main narration: approximately every 6–10 seconds.
- Maps and diagrams: 10–20 seconds only when internally animated or progressively annotated.
- High-impact moments: deliberate 8–15 second holds are allowed.
- Flag any unexplained static interval over 12 seconds.

A visual change may be a new asset or a materially different crop, motion, overlay, route, label, or diagram state. Do not inflate shot counts with negligible changes.

## Typed contracts

Use the repository’s existing validation approach. Prefer Zod where already used.

Add or extend strongly typed schemas for:
- `HistoryVisualPlan`
- `HistoryVisualStrategy`
- `HistoryVisualBeat`
- `HistoryAssetSpec`
- `HistoryMapSpec`
- `HistoryDiagramSpec`
- `HistoryArchivalSpec`
- `HistoryShotSpec`
- `HistoryApprovalPack`
- `HistoryVisualValidationReport`
- workflow approval state and approval decision

Each beat should include:
- stable ID;
- narration range or source offsets;
- estimated start/end/duration;
- narrative role;
- visual purpose;
- selected media type;
- related entities, place, date, season, and chronology;
- factual constraints;
- proposed asset binding;
- motion/overlay concept;
- confidence and warnings.

## OpenAI planning

Use structured outputs with strict schemas. Keep prompts compact by supplying only relevant script slices plus a shared condensed context.

The model may propose visuals, but deterministic code must enforce:
- runtime/asset ranges;
- map and diagram triggers;
- minimum diversity;
- full narration coverage;
- chronological and seasonal consistency;
- approval gating.

Validate and repair malformed model output with bounded retries. Log model, prompt version, token usage, cost metadata when available, latency, retries, and validation failures. Do not log secrets.

## Anti-generic validation

Detect or flag:
- repeated “leader standing over a map” compositions;
- excessive battle scenes where narration is political, economic, or logistical;
- inaccurate season progression;
- generic imagery not bound to the narration;
- unreadable map label density;
- unsupported flags, uniforms, equipment, buildings, or territorial borders;
- visual claims stronger than the narration;
- maps or diagrams omitted despite mandatory triggers;
- too many near-duplicate prompts.

## Approval artifacts

Produce repository-consistent equivalents of:

- `history-visual-plan.json`
- `history-shot-list.json`
- `history-asset-manifest.draft.json`
- `history-approval-pack.md`
- `history-visual-validation.json`
- workflow-log/status update showing the exact next approval command

The approval pack must contain:
- runtime and count summary;
- media-mix summary;
- proposed maps and diagrams;
- beat-by-beat overview;
- cost-driving asset count;
- warnings and assumptions;
- exact commands to approve, reject, or regenerate only the plan.

Approval must bind to a deterministic plan hash. Any material plan change invalidates prior approval.

## CLI and workflow

Follow existing CLI conventions. Add the minimum coherent commands, for example:

```bash
youtube history visuals plan --episode <id>
youtube history visuals approve --episode <id> --plan-hash <hash>
youtube history visuals reject --episode <id> --reason "..."
```

Use actual repository naming rather than forcing these examples.

Planning must be idempotent and resumable. Cache by script hash, history-profile version, prompt version, and planner configuration.

## Tests

Add:
- runtime interpolation tests;
- map/diagram trigger tests;
- narration-coverage and cadence tests;
- diversity/duplicate tests;
- schema and repair tests;
- approval-hash and stale-approval tests;
- proof that no generation provider is called before approval;
- non-history characterization tests for every touched shared path.

Use the Napoleon invasion narration available in the history content pack or repository as a canonical fixture. If it is absent, add a compact fixture derived from the existing episode source without duplicating production content unnecessarily. Verify that it requires campaign maps, logistics/attrition diagrams, seasonal progression, and roughly 35–45 assets / 55–70 shots when its estimated runtime is 7–10 minutes.

## Documentation and completion

Add concise architecture and operator documentation. Include an example approval pack.

Run relevant linting, type checking, unit/integration tests, and existing repository validation commands.

At completion report:
1. architecture reused and decisions made;
2. files changed;
3. commands added;
4. generated example artifacts;
5. tests and results;
6. assumptions or blockers;
7. the exact command to run Goal 2 after approving the canonical plan.

Do not implement media generation or final rendering in this goal beyond interfaces or adapters strictly required to establish the approval boundary.
