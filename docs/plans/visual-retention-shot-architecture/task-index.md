# Implementation Task Index

| Task | Title | Dependencies | Parallelization | Reasoning | Expected Scope | Migration Impact |
| --- | --- | --- | --- | --- | --- | --- |
| 01 | Current Pipeline Characterization | none | Serial first | GPT-5.5 Medium | Characterization docs/tests only | none |
| 02 | Shot Domain Schemas | 01 | Serial | GPT-5.5 Medium | Domain schemas and tests | schema additive |
| 03 | Path And Artifact Contracts | 02 | Serial | GPT-5.5 Medium | Shared resolver paths and artifact stores | new state paths |
| 04 | Pacing And Budget Config | 02 | Parallel with 05/06 | GPT-5.5 Medium | Config types/defaults/tests | additive config |
| 05 | Treatment Catalog Types | 02 | Parallel with 04/06 | GPT-5.5 Medium | Treatment definitions/tests | none |
| 06 | Focal Metadata And Local Analysis Contract | 02 | Parallel with 04/05 | GPT-5.5 Medium | Focal region model and validation | additive artifacts |
| 07 | Deterministic Shot Planner | 04,05,06 | Serial after shared contracts | GPT-5.5 Medium, High optional | Planner package/tests | new shot plans |
| 08 | Shot Validation Engine | 04,05,07 | Serial | GPT-5.5 Medium | Validators/failing fixtures | blocks invalid plans |
| 09 | Evidence Insert Model | 02,06 | Parallel after 02 | GPT-5.5 Medium | Fact-bound insert model/render assets | additive |
| 10 | Caption Rhythm And Collision Plan | 06,07,09 | Parallel after 07 | GPT-5.5 Medium | Caption plan/collision tests | additive |
| 11 | FFmpeg Filter Builder Layer | 05 | Parallel with 07 | GPT-5.5 Medium, High optional | Typed render operations | renderer internals |
| 12 | Shot-Aware Renderer Integration | 07,08,11 | Serial | GPT-5.5 High optional | Render shots and manifests | render contract additive |
| 13 | Derived Clip Cache And Fingerprints | 03,11,12 | Serial | GPT-5.5 Medium | Cache/fingerprint/resume | new cache paths |
| 14 | Preview And Inspection CLI | 07,08,13 | Parallel after 13 | GPT-5.5 Medium | CLI reports/previews | operator surface |
| 15 | Canonical Pipeline Integration | 12,13 | Serial | GPT-5.5 High optional | `packages/pipeline` integration | behavior gated |
| 16 | Dark Truth Episode Integration | 12,13 | Serial, coordinate with 15 | GPT-5.5 High optional | `apps/cli` episode workflow | behavior gated |
| 17 | Legacy Episode Migration | 06,07,08,13 | Parallel after 13 | GPT-5.5 Medium | Safe default shot plans | legacy support |
| 18 | Rollout, Deprecation, Telemetry | 14,15,16,17 | Final serial | GPT-5.5 Medium | Telemetry/deprecation/docs | production rollout |

## Parallelization

- Tasks 04, 05, and 06 can run in parallel after Task 02.
- Task 09 can run in parallel with Task 07 if insert interfaces do not modify core shot schema.
- Task 11 can run in parallel with Task 07 after treatment type names are frozen.
- Task 14 and Task 17 can run in parallel after Task 13.
- Do not parallelize Tasks 02, 03, 07, 12, 13, 15, 16, or 18 with conflicting edits to central schemas, renderer contracts, artifact manifests, or cache fingerprints.

## Merge Order

1. 01, 02, 03.
2. 04, 05, 06.
3. 07, 08.
4. 09, 10, 11.
5. 12, 13.
6. 14, 17.
7. 15, 16.
8. 18.

## Commit Boundaries

Each task should be a separate commit. Tasks 12, 15, and 16 may need smaller internal commits if renderer contract changes touch both canonical and Dark Truth paths.

