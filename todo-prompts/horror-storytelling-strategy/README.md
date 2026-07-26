# Horror Storytelling Strategy — Future Work

These prompts extend the existing Dark Truth story system. They preserve the
current source-fidelity, lineage, final-line, duration, localization, and cache
contracts while making rewritten stories more frightening and interesting.

The source plan is
`docs/plans/research-informed-horror-storytelling-plan.md`. Source code remains
authoritative when this task pack and the repository disagree.

## Current Baseline

- `HorrorAffectPlan` is deterministic, source-grounded, validated, and hashed.
- Eligible canonical-English fiction currently receives the affect-plan prompt
  module automatically.
- The plan hash currently participates in the enforced compiler fingerprint.
- No extra model/provider call is introduced.
- There is no rollout switch, standalone persisted plan artifact, calibration
  corpus, Short projection, localization projection, analysis V2, targeted
  affect repair, or controlled production evaluation.

## Execution Order

1. [Rollout control and characterization](01-rollout-control-and-characterization.md)
2. [Persistence, resume, and inspection](02-persistence-resume-and-inspection.md)
3. [Calibration corpus and editorial rubric](03-calibration-corpus-and-editorial-rubric.md)
4. [Short affect-plan projection](04-short-affect-plan-projection.md)
5. [Localization affect preservation](05-localization-affect-preservation.md)
6. [Analysis V2 and evidence gates](06-analysis-v2-and-evidence-gates.md)
7. [Targeted repair and regeneration routing](07-targeted-repair-and-regeneration-routing.md)
8. [Controlled evaluation, rollout, and final audit](08-controlled-evaluation-rollout-and-final-audit.md)

Dependency flow:

```text
01 -> 02 -> 04 -> 05 -> 06 -> 07 -> 08
       \-> 03 -----------^----------^
```

Task 03 may follow Task 01 while Task 02 is being reviewed, but do not merge it
with runtime changes. Keep Tasks 04–08 sequential because they change shared
contracts, fingerprints, gates, and rollout decisions.

## Rules For Every Task

- Read `AGENTS.md`, `docs/ai-context/context-pack.md`, the source plan, and this
  README before editing.
- Inspect the listed source and current tests before deciding exact file changes.
- Reuse existing Dark Truth services, schemas, persistence, prompt compiler,
  workflow, CLI, and validation code. Do not build a parallel story pipeline.
- Preserve immutable source facts, the accepted final line, rename maps,
  narration-only output, Unicode, word/duration budgets, and artifact lineage.
- Do not add a model call unless a task explicitly permits an optional,
  operator-selected analysis call.
- Never call live OpenAI, YouTube, or another provider during tests.
- Do not mutate generated episode assets or run broad tests, builds, typechecks,
  snapshot updates, or fixture regeneration.
- Run the directly affected test file first and obey the repository verification
  budget.
- Update documentation only for behavior, configuration, command, or
  architecture changes.
- After file changes, create the required Codex run report. Update the source
  plan implementation report because these tasks execute
  `docs/plans/research-informed-horror-storytelling-plan.md`.
- Stop after the selected task. Report changed paths, exact checks, results,
  commit hash, and unresolved risks.

## Product Decisions

Do not silently invent these during implementation:

- primary optimization metric and practical improvement threshold;
- permitted calibration episodes;
- default intensity and whether episodes may override it;
- analysis sampling/cost policy; and
- authority to use production analytics or change the default to `enforce`.

Tasks should use safe defaults or leave explicit decision records where human
input is still required.
