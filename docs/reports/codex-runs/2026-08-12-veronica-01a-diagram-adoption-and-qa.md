# 01A diagram adoption and QA

Summary: adopted exact PNG `5e11f15c…5bbe` as scene-007 through a hash-bound, replay-safe deterministic path. Failed provider pixels `88304fe7…0ad` were archived. One strict `gpt-5.4-mini` QA request passed; no image generation or retry occurred.

Changed paths: `apps/cli/src/images-resume-command.ts`, its unit test, `apps/cli/src/index.ts`, recensus script, scene-007 manifest/adoption/archive/QA artifacts, reservation, census/provisioning/ledger/tranche/run reports, and the plan implementation report.

Tests: `pnpm test:focused -- apps/cli/src/images-resume-command.unit.test.ts` (9/9); CLI typecheck PASS; CLI build PASS; recensus invariants PASS.

Commit: none; HEAD `492543b`.

Risks: HOOK-B04 and S01-B02 lack current strict QA. Next bounded tranche is two sequential QA-only calls, maximum $0.03; stop on first failure and never generate images.
