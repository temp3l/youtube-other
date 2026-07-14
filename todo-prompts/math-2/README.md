# Mathematics Class 5 completion task pack

Recommended model: GPT-5/Codex
Recommended reasoning: high

## Goal

Finish the current mathematics implementation through a private-production milestone:
all 37 German Class 5 skills, `standard` variant, processed by the canonical shared
workflow with reviewed curriculum evidence, deterministic mathematics verification,
resumable state, production speech/rendering, quality evidence, metadata, and a
publish dry-run. Live upload or public release is outside this task pack.

The post-refactor source is authoritative. The old `A-*` and `R-*` audit tasks are
historical evidence and must not be replayed without current source proof.

## Current baseline hypothesis

Each prompt must verify these statements before relying on them:

- The repository refactor and shared workflow engine are accepted.
- The math task registry defines the full 18-task production DAG, but the real
  packaged lesson graph currently reports every registration as
  `implementationBound: false`.
- Legacy `math production run|resume` remains simulation-backed.
- The tracked curriculum release and all 206 skills remain editorial drafts.
- Class 5 contains 37 skills; only three lesson fixtures are simulation-approved.
- Verifier v3 and profile contracts exist and fail closed.
- The checked-out verifier v3 virtual environment runs, but the documented
  offline setup script still checks for obsolete verifier version `2.0.0` and
  must be aligned with current `3.0.0` source before clean bootstrap acceptance.
- Provider speech and a sample render have run, but full production acceptance has not.
- Repository teacher artwork is a simulation placeholder and must remain blocked from
  public publishing.

## Execution order

| Order | Prompt                                     | Dependency                                                             |
| ----: | ------------------------------------------ | ---------------------------------------------------------------------- |
|     1 | `01-post-refactor-math-audit.md`           | none                                                                   |
|    2A | `02-production-workflow-adapters.md`       | 01 accepted                                                            |
|    2B | `03-reviewed-class5-curriculum-release.md` | 01 accepted; may await human review                                    |
|    3A | `04-class5-number-operations-core.md`      | stable reviewed scope/contract from 03; canonical integration after 02 |
|    3B | `05-class5-fractions-decimals.md`          | stable reviewed scope/contract from 03; canonical integration after 02 |
|    3C | `06-class5-geometry-measurement.md`        | stable reviewed scope/contract from 03; canonical integration after 02 |
|    3D | `07-class5-data-diagrams.md`               | stable reviewed scope/contract from 03; canonical integration after 02 |
|     4 | `08-production-speech-rendering.md`        | 02; accept after 04-07                                                 |
|     5 | `09-three-skill-private-pilot.md`          | 03-08 accepted                                                         |
|     6 | `10-class5-private-batch.md`               | 09 accepted                                                            |
|     7 | `11-independent-acceptance.md`             | 10 complete                                                            |

Prompts 02 and 03 may run in parallel. Prompts 04 through 07 may begin in separate
worktrees after their content/review contract and exact rollout scope from 03 are stable;
their canonical production acceptance still requires 02. Do not run parallel agents
against the same dirty worktree.

## Rules for every prompt

- Read `AGENTS.md` and `docs/ai-context/context-pack.md` first.
- Inspect Git state and current source before editing; preserve unrelated changes.
- Use source, tests, and executable behavior as authority over reports.
- Follow the focused verification budget in `AGENTS.md`.
- Do not weaken validation, assertions, lineage, quality, or publish controls.
- Do not call paid providers without explicit approval for that run.
- Never upload, publish, mutate playlists, or use live channel credentials in this pack.
- Do not claim editorial, licensing, or independent acceptance without real evidence.
- Create the required Codex-run report after every task that changes files.
- Stop at the first unmet dependency and report the smallest actionable next step.

## Completion definition

Completion means all 37 `M5-*` skills can run as German `standard` private-production
items through the canonical workflow, with isolated failures and resumable state. Every
successful item must have reviewed curriculum identity, independently verified facts,
measured narration timing, deterministic visuals, valid private media, quality evidence,
metadata, and a zero-mutation publish dry-run. Public publishing remains disabled.
