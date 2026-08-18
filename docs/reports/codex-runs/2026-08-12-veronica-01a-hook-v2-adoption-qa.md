# Veronica 01A HOOK-B04 v2 adoption and QA

Changed files: `apps/cli/src/images-resume-command.ts`, its unit test, recensus generator, canonical scene-004 image/manifests/adoption archives, reservation, census/ledger/tranche/run reports, and this report.

Result: v2 PNG `4b0d6b2c…adc9` was adopted with source/review/previous-adoption bindings and zero image calls. Strict `gpt-5.4-mini` QA failed (semantic 0.62; instant 0.55; narration 0.48; must-show partial): the four cost trays did not make the exact 19:1 split legible without narration. No retry ran.

Tests/checks: focused resume test 9/9 PASS; CLI typecheck PASS; CLI build PASS; recensus PASS (48 sources, 1/47 deterministic PASS/BLOCK); reservation released.

Cost: $0.007436 / €0.007088; cumulative €2.315679; remaining €2.567337; held €0.

Risk/follow-up: human editorial encoding decision required before a zero-cost v3 prototype. Commit: none; HEAD `492543b`.

ChatGPT review pack: `docs/reports/codex-runs/2026-08-12-veronica-01a-hook-v2-qa-failure-review-pack.zip`; SHA-256 `78980947638f2f883bb57f08f5931e041899a2c7c00a0492d4a7b56f67e5e840`; ZIP integrity PASS.
