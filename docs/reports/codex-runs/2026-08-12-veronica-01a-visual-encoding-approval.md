# 01A visual-encoding approval

Summary: persisted the operator-approved S02-B01 conservation treatment and added strict materialization checks binding source, semantic plan, review pack, pre-image approval, failed QA, failed prompt, and rejected pixels. No provider call or reservation occurred.

Changed paths: 01A `human-visual-encoding-decision.v1.json`; CLI resume command/options/test; recensus generator; current census, provisioning, ledger, tranche, and run reports; plan implementation report.

Tests: focused `images-resume-command` Vitest 8/8; CLI typecheck PASS; CLI build PASS; recensus invariants PASS.

Commit: none; HEAD `492543b`.

Risks: S02-B01 still has no passing pixel. The next one-image/one-QA provider tranche requires explicit authorization and must stop without retry on failure.
