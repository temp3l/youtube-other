# Implementation Roadmap

## Dependency Graph

```text
01 -> 02
02 -> 03,04,05,06,09
04 -> 05,07,10
05,06 -> 07
07 -> 08,14
08,09 -> 10,12,15
10 -> 11,12,13,16
11,12 -> 13
13 -> 15
all -> 18
```

## Waves

1. Baseline and schemas: tasks 01-02.
2. Text planning: tasks 03-06.
3. TTS generation core: tasks 07-09.
4. Assembly and gate: tasks 10-12.
5. CLI, benchmark, batch status: tasks 13-15.
6. Compatibility, observability, migration docs: tasks 16-18.

## Implemented Status Notes

- Staged narration commands were implemented under `audio narration <stage>` with public stages `prepare`, `plan`, `generate`, `assemble`, `validate`, `status`, and `inspect`. The aggregate `all` stage is internal and is used by adapter code such as `audio generate-localized` in `new` mode.
- Rollout mode is the global `--narration-pipeline-mode <legacy|shadow|new>` option. `legacy` remains the default; `shadow` writes staged artifacts without compatibility promotion; `new` promotes mastered output to compatibility `narration.wav`.
- `audio generate-localized` switches to the staged `all` path only in `new` mode. `audio generate` keeps legacy behavior unless the runtime config is already `new`.
- Voice benchmarking writes `voice-benchmark.json` through `audio narration benchmark-voices`.
- No legacy paths are deleted by Task 18; removal requires the documented deletion criteria and a separate approved task.

## Roadmap Table

| Task | Depends on | Parallel-safe with | Risk | Cost impact | Minimum model | Best model |
|---|---|---|---|---|---|---|
| 01 Current state and paths | none | none | low | negligible | GPT-5 mini | GPT-5 |
| 02 Domain schemas | 01 | 03,06 | medium | negligible | GPT-5 | GPT-5.5 |
| 03 Spoken narration prep | 02 | 04,06 | medium | low | GPT-5 | GPT-5.5 |
| 04 Beat segmentation | 02 | 03,06,09 | medium | negligible | GPT-5 mini | GPT-5 |
| 05 Direction planner | 02,04 | 09,11 | medium | low-moderate | GPT-5 | GPT-5.5 |
| 06 Pronunciation normalization | 02 | 03,04,09 | medium | negligible | GPT-5 mini | GPT-5 |
| 07 TTS request builder | 05,06 | 09 | high | low | GPT-5 | GPT-5.5 |
| 08 Chunk cache and resume | 07 | 09,17 | high | lowers cost | GPT-5 | GPT-5.5 |
| 09 Technical validation | 02 | 08,11 | medium | negligible | GPT-5 mini | GPT-5 |
| 10 Assembly and continuity | 04,08,09 | 11,12 | high | negligible | GPT-5 | GPT-5.5 |
| 11 Mastering profiles | 10 | 12,17 | medium | negligible | GPT-5 mini | GPT-5 |
| 12 Quality gate | 09,10,11 | 17 | medium | negligible | GPT-5 mini | GPT-5 |
| 13 CLI integration | 03-12 | 14,15 | high | low | GPT-5 | GPT-5.5 |
| 14 Voice benchmarking | 07,09 | 15,17 | medium | moderate bounded | GPT-5 mini | GPT-5 |
| 15 Batch status | 08,12,13 | 14,17 | medium | lowers cost | GPT-5 | GPT-5.5 |
| 16 Dark-truth adapter | 04,08,10,13 | 17 | high | negligible | GPT-5 | GPT-5.5 |
| 17 Observability and costs | 08,12 | 14,15,16 | medium | negligible | GPT-5 mini | GPT-5 |
| 18 Migration and deprecation | all | none | medium | negligible | GPT-5 mini | GPT-5 |

## Validation Checkpoints

- Wave 1: schema unit tests and package typecheck.
- Wave 2: segmentation, pronunciation, and direction unit tests.
- Wave 3: mocked OpenAI request, retry, cache, and validation tests.
- Wave 4: FFmpeg fixture assembly and quality-gate tests.
- Wave 5: CLI dry-run/status tests and benchmark artifact tests.
- Wave 6: compatibility tests for old CLI and `dark-truth` inputs.

## Highest Risks

- Keeping render compatibility while moving output paths.
- Preventing context text from being spoken by TTS.
- Avoiding destructive cleanup during partial failures.
- Making crossfades safe without overlapping speech.
- Migrating `dark-truth` without breaking source-pack workflows.
