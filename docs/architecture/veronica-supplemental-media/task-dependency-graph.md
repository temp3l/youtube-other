# Task Dependency Graph

```mermaid
flowchart TD
  VMB000[Session safety / ownership]
  VMB001[Characterization tests]
  VMB100[Contracts v1]
  VMB110[Secure ingestion]
  VMB120[FFmpeg DSL compiler]
  VMB200[Narration revision + anchors]
  VMB210[Semantic planner]
  VMB220[Localization flags]
  VMB230[Aspect-ratio profiles]
  VMB300[Regeneration + cache]
  VMB310[Approval eligibility]
  VMB320[Review pack]
  VMB330[Pipeline orchestrator]
  VMB400[Planner metrics]
  VMB410[CLI integration]
  VMB420[E2E fixtures]

  VMB000 --> VMB100
  VMB001 --> VMB100
  VMB100 --> VMB200
  VMB100 --> VMB110
  VMB100 --> VMB120
  VMB110 --> VMB210
  VMB200 --> VMB210
  VMB210 --> VMB220
  VMB210 --> VMB230
  VMB220 --> VMB310
  VMB230 --> VMB330
  VMB120 --> VMB330
  VMB310 --> VMB320
  VMB300 --> VMB330
  VMB330 --> VMB400
  VMB330 --> VMB410
  VMB330 --> VMB420
```

## Parallelization notes

- Ingestion, contracts, and FFmpeg compiler were safe to implement in parallel.
- History-owned shared files were not modified; adapters remain Veronica-local.
