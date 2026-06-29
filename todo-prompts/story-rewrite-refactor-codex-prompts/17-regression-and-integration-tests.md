# Task: Regression And Integration Tests

Complete focused regression coverage after implementation phases.

## Required Regression Fixtures

Add fixtures for:

- canonical English full generation;
- Spanish full localization;
- German full localization;
- Portuguese full localization;
- English short from English full;
- Spanish short from Spanish full;
- German short from German full;
- Portuguese short from Portuguese full;
- optional French full and short;
- output-token exhaustion;
- stale parent full hash;
- metadata/audio leakage attempts;
- wrong-language localized output;
- orphaned short references;
- synopsis-like short output.

## Integration Assertions

Assert:

- no full story uses short model, short schema, or short repair budget;
- no short uses full regeneration route;
- localized shorts derive from matching localized full;
- metadata/audio/visual stages are not prerequisites for narration;
- cost and telemetry group by locale and variant;
- resume rejects stale shorts.

## Test Ergonomics

Use mocks/fakes for provider calls. Do not issue paid requests. Prefer focused Vitest files over repo-wide runs.

## Acceptance Criteria

- Tests fail against known old defects and pass against the new design.
- Coverage includes full and short variants separately.
- Test names document the prevented regression.
