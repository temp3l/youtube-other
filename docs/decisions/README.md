# Decisions Index

This is an index of decisions visible in the current implementation. It does not recreate the old ADR set in `docs.bak/`.

- Fact visible in code: CLI-first orchestration is the primary operational surface.
- Fact visible in code: episode workspace paths are centralized in shared path-resolution utilities.
- Fact visible in code: filesystem artifacts are the primary production state; SQLite stores manifests and pipeline run history.
- Fact visible in code: remote rendering is optional and can fall back to local rendering.
- Fact visible in code: OpenAI-compatible providers are used across several content-generation stages.
- Fact visible in code: YouTube upload is a separate finalization boundary after render and metadata preparation.
- Reasonable inference: the current repo favors resumable per-subsystem workflows over one global pipeline transaction.
- Reasonable inference: the old `@mediaforge/pipeline` orchestration surface is historical; the active operator path is the richer CLI command set in `apps/cli`.
- Unresolved: whether any external consumers still need release-note coverage for the removed pipeline package surface.

Feature decision registers:

- [Current scope and publication authority](ADR-OPERATIONS-001-current-scope-and-publication-authority.md): German-only Math rollout and on-demand CLI-only publication initiation.
- [Strategic Reinvention](strategic-reinvention-decision-register.md): genre/creator separation, source rights, approvals, multilingual packaging, creator-media blocks, and external evidence gates.

## Microdrama decisions

These accepted architecture decisions govern new Vertical Microdrama Factory
work even where implementation is not present yet:

- [ADR-MICRODRAMA-001](ADR-MICRODRAMA-001-structured-narrative-state-and-revisions.md): structured narrative state and revisions.
- [ADR-MICRODRAMA-002](ADR-MICRODRAMA-002-embedded-microdrama-persistence-and-artifact-boundary.md): embedded persistence and the large-artifact boundary.
- [ADR-MICRODRAMA-003](ADR-MICRODRAMA-003-rolling-canon-planning-and-analytics-admission.md): rolling planning and analytics admission.
- [ADR-MICRODRAMA-004](ADR-MICRODRAMA-004-one-canon-locale-projections-and-selected-audio-timing.md): one canon, locale projections, and selected-audio timing.
- [ADR-MICRODRAMA-005](ADR-MICRODRAMA-005-provider-publication-intents-and-reconciliation.md): provider publication intents and reconciliation.

Architecture precedence is ADR -> active plan -> backlog task -> implementation
-> run report. Reports are evidence and cannot silently supersede an ADR.
