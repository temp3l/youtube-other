# Dependency Graph

```mermaid
graph TD
  T01["01 Current Pipeline Characterization"] --> T02["02 Shot Domain Schemas"]
  T02 --> T03["03 Path And Artifact Contracts"]
  T02 --> T04["04 Pacing And Budget Config"]
  T02 --> T05["05 Treatment Catalog Types"]
  T02 --> T06["06 Focal Metadata Contract"]
  T04 --> T07["07 Deterministic Shot Planner"]
  T05 --> T07
  T06 --> T07
  T04 --> T08["08 Shot Validation Engine"]
  T05 --> T08
  T07 --> T08
  T02 --> T09["09 Evidence Insert Model"]
  T06 --> T09
  T06 --> T10["10 Caption Rhythm And Collision"]
  T07 --> T10
  T09 --> T10
  T05 --> T11["11 FFmpeg Filter Builder Layer"]
  T07 --> T12["12 Shot-Aware Renderer Integration"]
  T08 --> T12
  T11 --> T12
  T03 --> T13["13 Derived Clip Cache And Fingerprints"]
  T11 --> T13
  T12 --> T13
  T07 --> T14["14 Preview And Inspection CLI"]
  T08 --> T14
  T13 --> T14
  T12 --> T15["15 Canonical Pipeline Integration"]
  T13 --> T15
  T12 --> T16["16 Dark Truth Episode Integration"]
  T13 --> T16
  T06 --> T17["17 Legacy Episode Migration"]
  T07 --> T17
  T08 --> T17
  T13 --> T17
  T14 --> T18["18 Rollout Deprecation And Telemetry"]
  T15 --> T18
  T16 --> T18
  T17 --> T18
```

## Parallel Branches

- Branch A: Tasks 04, 05, 06 after Task 02.
- Branch B: Task 09 after Task 02 and Task 06.
- Branch C: Task 11 after Task 05.
- Branch D: Tasks 14 and 17 after Task 13.

## Integration Points

- Domain schema freeze: Task 02.
- Path/artifact freeze: Task 03.
- Planner contract freeze: Task 07.
- Renderer contract freeze: Task 12.
- Cache and resume freeze: Task 13.
- Production behavior integration: Tasks 15 and 16.

