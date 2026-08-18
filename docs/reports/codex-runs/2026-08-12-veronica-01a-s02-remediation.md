# 01A S02-B01 remediation

Summary: added a hash-bound, single-scene remediation path; preserved rejected pixels; generated one `gpt-image-2` low 864×1536 replacement; ran one `gpt-5.4-mini` low strict QA; stopped without retry on failure. QA: semantic 0.66, instant-read 0.56, narration support 0.54, must-show partial. Visual inspection confirmed S01/S02 distinction but ambiguous quantity reduction.

Changed paths: `apps/cli/src/images-resume-command.ts`, its unit test, `apps/cli/src/index.ts`, recensus generator, 01A image/manifest/QA artifacts, reservation, census, ledger, provisioning, tranche, and run reports.

Tests: focused Vitest 8/8; CLI typecheck/build PASS; recensus invariants PASS. Final no-wrapper assertion was not rerun after the task verification ceiling.

Commit: none; HEAD `492543b`.

Risks: current S02 pixel failed QA; the final no-wrapper assertion was not rerun; no additional paid retry is authorized.
