# Veronica Supplemental Media Overview

Veronica Benini (`strategic-reinvention` genre) supplemental media is implemented in `@mediaforge/veronica-media` as an opt-in, genre-isolated workflow.

## Pipeline

```text
Uploaded narration + supplemental media
        ↓
Secure source inventory (`ingestion/secure-ingest.ts`)
        ↓
Versioned semantic media plan (`veronica-media-plan.v1`)
        ↓
Claim / source / narration linkage
        ↓
Approval eligibility gate (`approval/eligibility.ts`)
        ↓
Language-specific preparation
        ↓
Independent 16:9 + 9:16 compositions
        ↓
Typed deterministic FFmpeg render manifest (`rendering/compiler.ts`)
        ↓
Render + validation + approval pack
```

## Entry points

- Library: `runVeronicaSupplementalMediaPipeline`
- CLI: `mediaforge veronica-media pilot --workspace <dir>`
- Fixture: `createVeronicaPilotFixtures()`

## Genre isolation

Only explicit Veronica/strategic-reinvention workflows invoke this package. Other genres preserve existing behavior.

## Pre-image semantic readiness

Veronica provider-image prompts are projected only after a maximum-two-round,
gate-driven semantic remediation pass. Repairs derive a typed, narration-grounded
semantic proposition from complete sentence/claim spans and preserve polarity,
contrast, actor ownership, and consequence family. Material proposition changes
rebuild incompatible treatment fields. Missing or malformed theses, low-confidence
generic fallbacks, internal contradictions, stale treatment fields, unsupported
episode-external motifs, projection mismatches, lexical corruption, and harmful
template repetition fail closed. Provider projections carry treatment/proposition
hash provenance, and text-free constraints never delete normal instruction prose.
Review-pack readiness requires semantic coherence, provider projection, prompt
quality, timing, and hash integrity to pass independently. Passing automation never
records human approval or permits an image-provider request.
