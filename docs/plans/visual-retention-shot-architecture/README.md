# Visual Retention Shot Architecture Plan

This planning pack defines how MediaForge should move from mostly static scene-image rendering to deterministic, shot-based cinematic rendering for YouTube Shorts and full-length horror videos.

## Files

- [Architecture Plan](architecture-plan.md)
- [Treatment Catalog](treatment-catalog.md)
- [Validation Plan](validation-plan.md)
- [Production Defaults](production-defaults.md)
- [Implementation Task Index](task-index.md)
- [Dependency Graph](dependency-graph.md)
- [Individual Codex Tasks](tasks/)

## Recommendation

Use a hybrid explicit scene-to-shot architecture:

```text
Narrative Scene
  -> Generated Source Image
  -> Deterministic Shot Plan
  -> Inline Rendered Shot or Cached Derived Clip
  -> Final Composition
```

The source image remains the paid image-generation boundary. Multiple rendered shots derive from the same source image through local FFmpeg, Sharp, Canvas-style overlays, and optional cached advanced effects. This prevents 11-20 second unchanged visual holds without requiring one AI image per shot.

