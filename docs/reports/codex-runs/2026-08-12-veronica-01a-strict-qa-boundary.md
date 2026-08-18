# Veronica 01A strict-QA boundary

Summary: the authorized QA-only attempt exposed a resume defect: planning-hash drift dispatched one `gpt-image-2` request and overwrote S02-B01 before QA failed closed. Provider execution stopped. The new pixel is retained as noncanonical evidence; the authorized old hash is unrecoverable.

Changed paths: `apps/cli/src/images-resume-command.ts` and test; `packages/image-generation/src/veronica-post-generation-visual-qa.ts` and test; recensus generator; current census, provisioning, ledger, reservations, evidence, tranche, and run reports.

Fixes: `--qa-existing` now follows a sequential hash-verifying route that cannot construct an image generator and forbids force/regeneration. QA uses strict Responses JSON schema and durable request/usage logs.

Tests: visual-QA 4/4; resume 7/7; CLI typecheck/build PASS; image-generation build PASS; recensus invariants PASS.

Cost: `$0.007525` / `€0.007173` for the unintended image; malformed QA showed zero organization model usage. Reservation released.

Commit: none; HEAD `492543b`.

Risk: replacement SHA `5bd465…632b` requires explicit adoption before QA.
