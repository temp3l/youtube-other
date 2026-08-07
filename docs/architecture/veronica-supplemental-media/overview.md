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
