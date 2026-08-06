# Phase Goal — Diagram, Map, Editorial, Shot, Composition, and Status Quality

## Context

Read:

- `01-history-v3.2-master-goal.md`
- `references/history-approval-packs-v3.1-review-report.md`
- current V3.2 plan/status/decision artifacts
- completed V3.2 timing and provenance implementations

## Objective

Make generated visual plans semantically defensible and operationally useful. Eliminate generic/false diagrams, contradictory maps, repetitive purposes and shot direction, generic ratio plans, misleading status surfaces, and irreproducible narration binding.

Do not produce final approval ZIPs until this phase passes.

## Workstream A — Evidence-bound diagrams

Implement per-node and per-edge bindings:

- specific entity IDs;
- specific supporting claim IDs;
- explicit relationship;
- support assessment.

Every emitted edge must be supported by at least one claim that explicitly states or strongly entails the relationship.

Reject a diagram when:

- a domain template is only loosely related;
- required nodes/edges lack evidence;
- entities are copied as a diagram-wide union;
- labels imply unsupported causal/economic/institutional relationships;
- context is unresolved.

Use a deterministic fallback selection: map, timeline, archival visual, quotation card, comparison, or no diagram.

Add regression fixtures for the Napoleon, Fall of Rome, and Black Death defect classes in the review report.

## Workstream B — Typed map semantics

Represent and validate separately:

- carrier/vehicle;
- moving actor;
- pathogen/transmitted condition;
- affected place/region;
- origin;
- destination;
- route type;
- display label;
- supporting claims.

Add hard diagnostics for:

- maritime routes labeled overland and vice versa;
- unsupported/broad endpoints such as continent-scale placeholders where a renderable place is required;
- unresolved places or missing coordinates;
- pathogen represented as operator/carrier of a trade route;
- movement route without a movement claim;
- origin/destination identity;
- route type contradicted by linked claim language.

## Workstream C — Structured visual purpose

Generate structured fields before prose:

- editorial function;
- concrete subject;
- evidence shown;
- change/comparison/mechanism/uncertainty;
- supporting claim IDs.

Compute and report:

- exact normalized duplication;
- prefix/template concentration;
- semantic clusters;
- repeated function/subject combinations.

Introduce configurable warning/blocking thresholds. Avoid arbitrary thresholds that reject good intentional motifs; document calibration. The V3.1 repetition rates must not pass as zero genericity.

## Workstream D — Explicit shot treatment

Model treatments including:

- full frame;
- detail crop;
- annotation overlay;
- route reveal;
- parallax layer;
- evidence highlight;
- comparison;
- before/after;
- independent render.

Generate camera/transition direction from media type, editorial function, claim function, treatment, and aspect ratio.

Asset reuse is allowed only when declared and materially transformed. Distinguish intentional reuse from effectively identical duplicate shots.

Measure repeated camera and transition patterns and expose the metrics.

## Workstream E — Ratio-specific composition contracts

For 16:9 and 9:16 record:

- protected subjects and labels;
- focal evidence region;
- title/subtitle safe zones;
- maximum text density;
- minimum label pixel size;
- crop conflicts;
- independent-render requirement and reason.

Add render-contract tests for maps and diagrams in portrait orientation.

## Workstream F — Status and manifest truthfulness

Unify output surfaces so they expose:

- structural reviewability;
- editorial reviewability;
- content approval eligibility;
- production approval eligibility;
- blockers grouped by code/count;
- warnings grouped by code/count;
- timing source and delta;
- material/supported/unresolved/disputed claim counts;
- structural lint;
- semantic lint;
- editorial quality;
- overrides;
- measured-audio availability.

No `valid: true` field may be presented without a clearly named scope. Prevent false-green combinations by construction and test.

## Workstream G — Narration binding

Add and verify:

- canonical script SHA-256;
- normalized narration SHA-256;
- normalization algorithm/version;
- documented narration revision derivation;
- validation during generation and bundle verification.

Changing canonical or normalized narration must invalidate dependent hashes, provenance decisions, approvals, and stale overrides as appropriate.

## Required tests

- unsupported and ambiguous diagram edge rejection;
- node/edge-specific entity bindings;
- valid diagram preservation;
- deterministic fallback selection;
- route label/type contradiction;
- carrier/actor/pathogen role separation;
- broad/unrenderable endpoint rejection;
- exact and semantic purpose repetition;
- intentional versus ineffective asset reuse;
- camera/transition repetition metrics;
- 9:16 text/label/safe-zone constraints;
- false-green status prevention;
- grouped diagnostic summaries;
- canonical/normalized hash recomputation and invalidation;
- compatibility and non-History characterization.

## Completion gate

Complete only when:

- all focused tests pass;
- V3.1 semantic defect fixtures are rejected or corrected by the generator;
- reporting surfaces cannot hide blockers;
- hashes are independently reproducible;
- non-History behavior remains unchanged unless explicitly opt-in;
- verification documentation is current.
