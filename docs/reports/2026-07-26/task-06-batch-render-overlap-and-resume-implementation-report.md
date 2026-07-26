# Task 06 Batch Render Overlap And Resume

Date: 2026-07-26  
Commit: `0232e24`

Summary: Implemented
`docs/remote-rendering/tasks/task-06-batch-render-overlap-and-resume.md`.
Canonical private batches now serialize preparation and paid speech while
overlapping bounded render-ready lessons on one shared hybrid executor. Atomic
queue state records unit/scene phases, fingerprints, immutable image identity,
assignments, remote jobs, attempts, reassignments, and timestamps. Resume
reconciles canonical workflow state first, preserves validated fragments, and
fails closed on retry classification. Math workflow tasks use unit locks;
remote containers use one CPU and are globally capped by both remote scene and
job limits. `BatchCoordinator` remains final-status authority.

Changed paths: `apps/cli/src/math-{commands,render-hybrid,private-batch-scheduler}*`;
`packages/math-education/src/task-registry.ts`; Task 05/attestation corrections;
Task 06 reports.

Tests: scheduler 5 passed; focused CLI run/resume gate 1 passed; CLI typecheck
passed.

Unresolved risks: no provider, real batch, Docker, SSH/VPS, publication, or
broad verification ran. The final publish-dry-run terminal predicate was
reviewed after the single authorized typecheck and was not rerun.
