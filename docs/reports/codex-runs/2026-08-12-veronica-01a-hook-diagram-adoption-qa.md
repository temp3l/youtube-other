# 01A HOOK-B04 diagram adoption and QA

Summary: generalized deterministic adoption to support strict scene-specific geometry, archived failed provider pixels, adopted exact PNG `cc10c877…7bf4a`, and ran one QA-only request. QA failed only narration support (0.73 vs 0.80); semantic 0.84, instant-read 0.78, must-show PASS. No image generation or retry.

Changed paths: CLI adoption command/test/build; scene-004 manifest/adoption/archive/QA; reservation; recensus; current census, provisioning, ledger, tranche, run, and plan implementation reports.

Tests: focused Vitest 9/9; CLI typecheck PASS; CLI build PASS; artifact/QA identity and recensus invariants PASS.

Commit: none; HEAD `492543b`.

Risks: HOOK-B04 remains strict-QA blocked; S01-B02 remains withheld. Next: authorize a zero-cost v2 order-bundle prototype and exact-hash review pack only; no adoption/provider call.
