# Task 08 — Controlled Evaluation, Rollout, And Final Audit

Implement only this task after Tasks 01–07. This task may prepare evaluation and
rollout tooling, but it must not use production analytics or switch the default
to enforce without explicit human approval. Follow this folder's `README.md`.

## Goal

Compare baseline and strategy outputs reproducibly, document a rollout decision,
and make rollback operationally safe.

## Inspect First

- the calibration corpus/harness from Task 03
- rollout configuration and artifacts from Tasks 01–02
- Short, localization, analysis, and repair outputs from Tasks 04–07
- existing cost, status, report, telemetry, and analytics-import conventions
- `docs/plans/research-informed-horror-storytelling-plan.md`

## Required Work

1. Create a versioned evaluation manifest before examining outcomes. It must
   name the primary metric, practical effect threshold, sample, exclusions,
   stratification, strategy versions, cost budget, and decision rule.
2. Run blind baseline-versus-strategy editorial comparison separately for full
   stories and Shorts. Preserve randomized assignment and rater provenance
   without personal secrets.
3. Support imported, already-authorized aggregate audience metrics. Never fetch
   YouTube data, upload content, publish, or call a provider without explicit
   current approval.
4. Treat normalized retention, early retention, average percentage viewed, and
   ending retention as story outcomes. Treat CTR as title/thumbnail evidence
   unless those variables are controlled.
5. Stratify only when sample size permits and label exploratory analyses. Do not
   claim causality from a single episode or optimize thresholds after seeing
   results.
6. Produce a decision artifact: remain shadow, promote a scoped configuration
   to enforce, or return to off. Include confidence, regressions, cost, failures,
   stale-cache behavior, and dissenting evidence.
7. Require explicit human approval before changing any production/default
   rollout setting. Promotion requires every gate from the source plan.
8. Verify configuration-only rollback retains diagnostic artifacts and does not
   rewrite accepted stories.
9. Perform a final contract audit across full, Short, localized, sync/batch,
   resume, inspection, analysis, and repair paths. Update relevant docs and the
   source-plan implementation report accurately.

## Focused Verification

- Test manifest validation, seeded assignment, metric calculations, missing
  data, decision rules, approval guard, and rollback behavior.
- Use synthetic/import fixtures and mocked adapters only.
- Run targeted tests within the repository budget; broad verification requires
  separate explicit authorization.

## Acceptance Criteria

- The evaluation is reproducible from versioned inputs.
- Full and Short results are not pooled into a misleading aggregate.
- No production action occurs without explicit approval.
- Promotion cannot bypass fidelity, cost, editorial, or retention gates.
- Rollback is configuration-only and preserves evidence for diagnosis.
