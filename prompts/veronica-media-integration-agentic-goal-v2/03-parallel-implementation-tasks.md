# Parallel Implementation Tasks

The coordinator may adjust exact file ownership after repository inspection.

# Wave 0 — Coordination and characterization

## VMB-000 — Session safety and ownership

Owner: coordinator

Deliver:

- Git/worktree status
- dirty-file classification
- file ownership registry
- concurrent-history conflict map
- task dependency graph

Do not modify shared implementation contracts yet.

## VMB-001 — Characterization tests

Owner: compatibility agent

Add focused tests for existing behavior before shared modifications.

Can run in parallel with VMB-000 if write sets are disjoint.

# Wave 1 — Contracts and isolated infrastructure

## VMB-100 — Veronica media-plan v1 contracts

Owner: contract agent

Implement:

- versioned plan schema
- narration anchors
- claim/source references
- visual states
- placements
- fallback policy
- approval eligibility
- provenance
- prepared assets
- render manifest
- regeneration scope

Prefer a Veronica-owned namespace/module when generic shared contracts are being edited by history.

Acceptance:

- strict typecheck
- runtime schema tests
- invalid combinations rejected
- deterministic serialization/hash tests

## VMB-110 — Secure media ingestion

Owner: ingestion agent

Implement:

- PDF/PPTX/image/SVG/video validation
- content hashing
- safe extraction boundary
- configured limits
- MIME/signature checks
- archive/path safety
- SVG sanitization
- structured failures

Must not require edits to history planner files.

## VMB-120 — FFmpeg render DSL compiler

Owner: rendering agent

Implement or extend a typed constrained FFmpeg composition model.

If the shared renderer is currently dirty:

- implement a Veronica adapter/compiler in an isolated module
- avoid editing the dirty shared wrapper
- record later integration

Add deterministic compiler tests.

# Wave 2 — Semantic planning and asset preparation

May begin when VMB-100 contracts stabilize.

## VMB-200 — Narration revision + semantic anchors

Owner: narration agent

Implement:

- original/revised narration
- stable scenes
- sentence anchors
- semantic fingerprints
- revision mapping
- duration contract
- post-TTS timestamp resolution interface

## VMB-210 — Supplemental-media relevance planner

Owner: planning agent

Implement:

- candidate scoring
- semantic scene matching
- user override precedence
- required/preferred/optional semantics
- fallback policy
- confidence
- approval thresholds
- claim/source association
- multi-state/multi-shot plans

## VMB-220 — Localization and redesign

Owner: localization agent

Implement:

- language-neutral source representation
- embedded-text extraction
- target-language translation
- glossary/protected terms
- preserve/adapt/redesign/summarize policy
- layout overflow detection
- approval flags
- provenance chain

Do not use unconstrained generation for factual charts/diagrams.

## VMB-230 — Aspect-ratio preparation

Owner: composition agent

Implement separate:

```text
16:9 planner
9:16 planner
```

Include:

- safe areas
- crop/focus validation
- sequential focus regions
- portrait reflow
- framed-landscape fallback
- readability validation

# Wave 3 — Workflow, caching, approval, rendering

## VMB-300 — Regeneration and cache graph

Owner: workflow agent

Implement:

```text
re-plan
re-prepare-assets
re-translate
re-align-narration
re-render
full-regeneration
```

Prove unrelated genres do not invalidate.

## VMB-310 — Approval eligibility engine

Owner: approval agent

Implement hard eligibility evaluation.

Stable codes must distinguish:

```text
blocking error
approval-required warning
non-blocking warning
informational
```

No silent promotion to renderable state.

## VMB-320 — Review-pack + redacted export

Owner: review-pack agent

Generate:

- narration
- plan
- claim/source graph
- inventories
- translated assets
- contact sheets
- landscape/portrait previews
- eligibility
- errors/warnings
- provenance
- checksums
- redacted ZIP

Design aggregate-review extension.

## VMB-330 — Rendering and output validation

Owner: renderer integration agent

Resolve narration anchors to final timing.

Compile typed manifest.

Render 16:9 and 9:16.

Validate:

- resolution
- frame rate
- duration
- streams
- expected assets
- safe-area/readability state
- FFmpeg exit status

# Wave 4 — Metrics, interfaces, end-to-end hardening

## VMB-400 — Planner quality metrics

Owner: observability agent

Implement metrics defined by the goal.

Follow repository naming conventions.

## VMB-410 — CLI/API integration

Owner: interface agent

Expose the feature through existing interfaces.

Prefer explicit capability flags.

Support relevant operations:

```text
ingest
analyze
plan
prepare
preview
approve
render
resume
validate
export
```

Do not create redundant entry-point patterns.

## VMB-420 — End-to-end fixtures

Owner: QA agent

Create fixtures covering:

- narration
- PDF/PPTX
- image
- translated visible text
- dense slide
- portrait adaptation
- repeated source asset
- explicit override
- fallback case
- approval-required case

Render both aspect ratios locally without production credentials.

# Wave 5 — Independent review

Run `04-review-and-acceptance.md`.

The reviewer should be independent from implementation agents where supported.

# Parallel safety constraints

Agents may run concurrently only when:

- file ownership is disjoint
- shared schema ownership is explicit
- consumed contract version is pinned
- no agent edits a file marked concurrently modified by history

If a worker discovers a shared-file collision:

```text
do not overwrite
record conflict
continue isolated work
notify coordinator
```

The coordinator decides whether to:

- use an adapter
- defer integration
- serialize the conflicting task

# Validation policy

Prefer focused validation per task:

- package typecheck
- targeted unit tests
- targeted lint
- fixture validation

Run broad/full repository validation only when:

- shared contracts changed
- final acceptance requires it
- compatibility risk crosses package boundaries
- repository policy requires it

Avoid repeatedly running expensive full suites after every worker task.
