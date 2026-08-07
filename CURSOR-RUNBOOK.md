# Cursor Runbook — History V3.4

Use one new Cursor chat per phase.

Keep Composer 2.5 Fast mode disabled.

## Phase 00 — Plan-mode analysis

Open a new Plan-mode chat and paste:

```text
Read and execute:

@prompts/history-v34-cursor/00-repository-analysis.md

Also follow:

@.cursor/rules/history-v34-focused.mdc

This is analysis only. Do not edit production code, tests, schemas,
configuration, or generated artifacts.

Create only the required repository-specific report. Verify every path,
symbol, and command against the repository before finishing.
```

Expected output:

```text
reports/history-v34-pipeline-analysis.md
```

Review and commit the report before continuing.

## Phase 01 — Franklin fixture

Open a new Agent-mode chat and paste:

```text
Implement:

@prompts/history-v34-cursor/01-franklin-golden-fixture.md

Also read:

@reports/history-v34-pipeline-analysis.md
@.cursor/rules/history-v34-focused.mdc

Work only on the Franklin fixture.

Start with failing generated-artifact acceptance tests. Make behavioral
changes only in source code, planners, validators, schemas, CLI integration,
or tests.

Do not edit episodes/*-v3.4 reference artifacts directly.

Do not claim completion until the Franklin artifact acceptance test passes,
all mandatory visual structures exist, and the second generation is
deterministic.
```

## Phase 02 — Napoleon fixture

Open a new Agent-mode chat and paste:

```text
Implement:

@prompts/history-v34-cursor/02-napoleon-second-fixture.md

Also read:

@reports/history-v34-pipeline-analysis.md
@.cursor/rules/history-v34-focused.mdc

Treat the passing Franklin fixture as a protected regression.

Do not weaken tests or thresholds. Do not regenerate Rome or Black Death.
Do not silently replace mandatory maps or the logistics diagram with
archival imagery.

Finish only after both Franklin and Napoleon generated-artifact acceptance
tests pass and Napoleon is deterministic.
```

## Phase 03 — Generalization

Open a new Agent-mode chat and paste:

```text
Implement:

@prompts/history-v34-cursor/03-generalize-rome-black-death.md

Also read:

@reports/history-v34-pipeline-analysis.md
@.cursor/rules/history-v34-focused.mdc

Franklin and Napoleon are protected golden fixtures.

Add Rome and Black Death artifact acceptance tests before implementation.
Do not weaken existing thresholds. Regenerate all four packs only after all
focused and portfolio acceptance tests pass.
```

## Phase 04 — Publishing

Open a new Agent-mode chat and paste:

```text
Implement:

@prompts/history-v34-cursor/04-publishing-readiness.md

Also follow:

@.cursor/rules/history-v34-focused.mdc

This is a publishing-only phase.

Do not modify narration, claims, entities, map geometry, diagram semantics,
trusted-script authority, or semantic approval logic.

Publishing state must remain below final until measured audio, rendered
videos, final thumbnails, reviewed captions, and human upload review exist.
```

## Phase 05 — Independent audit

Open a new Plan-mode or read-only Agent chat and paste:

```text
Audit the final generated release using:

@prompts/history-v34-cursor/05-final-independent-audit.md

Also follow:

@.cursor/rules/history-v34-focused.mdc

Do not modify source code or generated artifacts.

Independently inspect the actual generated files and ZIPs. Do not repeat
their exported gate values without verification. Create only the required
audit report.
```

## Steering Composer during a phase

When the agent starts broadening the scope, send:

```text
Stop broadening the task. Return to the current fixture and its generated-
artifact acceptance test. Do not touch unrelated genres or later phases.
```

When the agent attempts to patch generated outputs:

```text
Revert direct edits to generated approval artifacts. Implement the behavior
in source code and regenerate the artifacts through the documented pipeline.
```

When the agent attempts to weaken a test:

```text
Do not weaken or delete the acceptance requirement. Fix the implementation
that produces the failing artifact.
```

When the agent reports completion without evidence:

```text
Run the required generated-artifact acceptance command now and report the
exact exit status, output path, artifact counts, SHA-256 hash, and
determinism result.
```
