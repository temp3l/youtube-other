# Image Batch Implementation Prompt Batches

Run these batches in order unless you intentionally split a batch into its source tasks. Each prompt is self-contained and includes the original task content.

## Recommended order

1. [Foundation: characterization, stable identity, reference stages](./01-foundation-identity-reference.md) — GPT-5.4 for architecture/schema design; GPT-5.4-mini only for mechanical fixture cleanup after the schema is clear.
2. [Full workflow: preparation, CLI lifecycle, reconciliation/resume](./02-full-workflow-cli-reconciliation.md) — GPT-5.4 for this whole batch. Use GPT-5.4-mini only for isolated CLI wiring once planner/service behavior is already green.
3. [Short strategy plus canonical paths and renderer integration](./03-short-strategy-paths-renderer.md) — GPT-5.4 for strategy/path integration review; GPT-5.4-mini for focused resolver/test iteration.
4. [Operator docs, smoke verification, provider safeguards](./04-docs-smoke-provider-safeguards.md) — GPT-5.4 for provider contract/safety review; GPT-5.4-mini for docs formatting and small test hardening.
5. [Final hardening: multilingual aliases, short downstream verification, remaining risks](./05-multilingual-short-downstream-risk-docs.md) — GPT-5.4 for the full batch because it crosses planner, manifests, import/resume, renderer, and docs. Use GPT-5.4-mini only for final docs polish after tests pass.

## Parallelization guidance

- Do not parallelize batch 01 with anything else; it defines test baselines and shared identity contracts.
- Batch 02 depends on batch 01 and should run in one session sequentially.
- Batch 03 depends on the identity contract from batch 01 and should merge after batch 02 if renderer/import paths overlap.
- Batch 04 depends on batches 01–03 and should not be run before the implementation is mostly complete.
- Batch 05 must remain sequential and final because it changes shared-output alias semantics and records final risk state.
