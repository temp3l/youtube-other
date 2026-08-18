# Veronica 01A image canary

Summary: generated the authorized `HOOK-B04`, `S01-B02`, and `S02-B01` images once with `gpt-image-2`; added hash-bound review approval, beat-scoped resume/QA support, strict request and retry ceilings, current-source resolution, and QA-client compatibility. No remaining images were generated.

Changed paths: `apps/cli/src/{images-resume-command,index,veronica-media-commands,veronica-pre-image-review-pack}.ts`; `packages/image-generation/src/{episode-image-pipeline,veronica-post-generation-visual-qa}.ts`; focused tests; Veronica architecture note; current census, provisioning, ledger, reservation, evidence, tranche, and consolidated reports.

Tests/checks: focused Vitest 13/13; exact readiness-gate test 1/1; CLI typecheck PASS; image-generation/CLI builds PASS; recensus invariant check PASS. A direct no-`temperature` regression was added after the three-command test cap and not rerun. One unrelated pre-existing image-pipeline fixture failed and was not changed.

Commit: none; HEAD `492543b`.

Risk: pixel QA was rejected before evaluation because the provider disallowed `temperature`; usage was zero and the client is fixed. Three QA-only replacement requests require authorization.
