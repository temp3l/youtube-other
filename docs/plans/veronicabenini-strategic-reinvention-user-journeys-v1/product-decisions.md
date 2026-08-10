# Product Decisions and Defaults

These decisions are intentionally explicit so implementation planning can proceed without reopening already-set genre direction.

## PD-01 — Naming
`veronicabenini` is the canonical genre identity. `strategic-reinvention` is an internal alias and should not create a parallel product model.

## PD-02 — Narration adaptation
The production agent may rewrite, restructure, shorten, expand, or otherwise adapt narration when necessary for coherence, timing, localization, or multimedia integration. Material changes remain reviewable.

## PD-03 — Embedded text
Meaningful embedded/on-screen text is translated for localized editions.

## PD-04 — Source redesign
Source slides/images may be cropped, reframed, recomposed, or redesigned when necessary for readability, aspect ratio, or video presentation, while preserving original source artifacts and lineage.

## PD-05 — Renderer
FFmpeg-based rendering remains the expected render implementation unless the repository abstraction selects a compatible backend.

## PD-06 — Localization economics
Language-independent visual assets are reused by default. Language changes alone do not justify image regeneration.

## PD-07 — Aspect ratios
16:9 and 9:16 are independent layout derivatives of a shared canonical episode revision.

## PD-08 — Agentic execution
The system should support autonomous multi-stage production, but approval policy may stop the pipeline before expensive or externally visible actions.

## PD-09 — Regeneration
Regeneration is dependency-scoped and revision-safe. Approved history is immutable.

## PD-10 — Caching
Expensive derivations, including episode-level camera/image direction, source extraction, generated assets, translations, and TTS, should be reused when their semantic/configuration inputs remain compatible.

## PD-11 — Publishing
Publishing is allowed only from an approved renderable edition and must remain traceable to an exact production revision.

## PD-12 — API parity
Core lifecycle operations should be possible through stable API/SaaS contracts rather than UI-only behavior.

## PD-13 — Bulk production
Bulk processing favors bounded parallelism, partial success, resumability, deduplication, and aggregate review.

## PD-14 — Review focus
Review packs should emphasize semantic/output deltas after remediation/localization and avoid forcing re-review of unchanged shared assets.
