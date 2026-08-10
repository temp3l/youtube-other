# Veronica semantic QA and timing hardening

## Changed files

- `apps/cli/src/{images-resume-command,images-resume-command.unit.test,index}.ts`
- `packages/image-generation/src/{episode-image-pipeline,veronica-post-generation-visual-qa}.ts`
- `packages/veronica-media/src/{pipeline/orchestrator,rendering/build-render-manifest}.ts`
- `packages/story-localization/src/story-localization-openai-batch.ts`

## Tests/checks run

- Focused QA and timing unit tests: 5 passed.
- Veronica orchestrator integration test: 2 passed.
- Image recovery command unit test: 4 passed.
- Image-generation typecheck and targeted ESLint passed.

## Results

Veronica image commands now inject a Responses-vision evaluator and persisted semantic contracts, gate reused/new pixels, cache by pixel/semantic/model identity, retry failed assets twice with remediation, and record manual-review failures. Reuse registration occurs only after QA approval. Render manifests use persisted measured alignment reconciliation. Public recovery is consolidated as `images generate --resume`; internal callers retain the shared recovery function.

## Risks / follow-up

The existing generic scene manifest still calls prompt approval `qualityStatus: approved`; production acceptance is enforced by the Veronica QA gate rather than renaming that shared field. No production media was regenerated.
