# Task 06 — Analysis V2 And Evidence Gates

Implement only this task after Tasks 03–05. Keep new qualitative judgments in
shadow/advisory mode. Follow this folder's `README.md`.

## Goal

Version the story production analysis so weaknesses in suspense and interest are
reported with evidence, without weakening deterministic gates or silently
rejecting existing accepted artifacts.

## Inspect First

- `packages/story-localization/src/story-production-analysis.ts`
- `packages/story-localization/src/story-production-analysis.service.ts`
- `packages/story-localization/src/story-production-analysis.persistence.ts`
- `packages/story-localization/src/story-production-analysis.unit.test.ts`
- `packages/story-localization/src/story-workflow-quality.ts`
- `packages/story-localization/src/story-quality-gate.ts`
- `apps/cli/src/story-analysis-command.ts`

## Required Work

1. Add a versioned V2 response/artifact schema with separate dimensions for:
   information-gap management, credible response narrowing, earned surprise,
   causal/goal continuity, threat coping, tension modulation, and presence.
2. Require every qualitative finding to cite paragraph spans and, when
   available, affect-plan question/beat/evidence IDs. Reject invented IDs and
   out-of-range evidence.
3. Keep deterministic contract results separate from model opinions. Hard
   source, lineage, final-line, rename-map, and duration failures always win.
4. Make score computation and verdict derivation deterministic for a fixed
   structured response. Version prompt, schema, rubric, weights, gates, and
   fingerprint dependencies.
5. Preserve V1 artifact readability. Do not silently reclassify accepted
   artifacts merely because V2 exists.
6. Keep new dimensions advisory during shadow evaluation and leave current
   production thresholds unchanged.
7. Expose human-readable and JSON evidence summaries using existing analysis CLI
   behavior. Never log the full story unintentionally.
8. If optional model-assisted V2 analysis is added, it must be explicitly
   selected by the operator and use existing provider/cost controls.

## Focused Verification

- Extend analysis tests for schema/version migration, stable verdicts, evidence
  validation, invented IDs, deterministic-over-subjective precedence, and V1
  compatibility.
- Add the exact workflow-quality or CLI test needed for advisory behavior.
- Use mocked providers only. Run at most three focused commands plus one package
  typecheck.

## Acceptance Criteria

- Identical structured input always yields the same verdict and fingerprint.
- Every subjective finding has valid evidence.
- New dimensions do not become production gates.
- Existing hard failures cannot be cleared by V2.
- Existing accepted V1 artifacts remain understandable and operational.
