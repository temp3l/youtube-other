# Decisions Index

This is an index of decisions visible in the current implementation. It does not recreate the old ADR set in `docs.bak/`.

- Fact visible in code: CLI-first orchestration is the primary operational surface.
- Fact visible in code: episode workspace paths are centralized in shared path-resolution utilities.
- Fact visible in code: filesystem artifacts are the primary production state; SQLite stores manifests and pipeline run history.
- Fact visible in code: remote rendering is optional and can fall back to local rendering.
- Fact visible in code: OpenAI-compatible providers are used across several content-generation stages.
- Fact visible in code: YouTube upload is a separate finalization boundary after render and metadata preparation.
- Reasonable inference: the current repo favors resumable per-subsystem workflows over one global pipeline transaction.
- Reasonable inference: `@mediaforge/pipeline` remains a valid orchestration surface, but the active operator path is the richer CLI command set in `apps/cli`.
- Unresolved: whether the long-term primary production path should consolidate further around `@mediaforge/pipeline` or remain command-specific in `apps/cli`.
