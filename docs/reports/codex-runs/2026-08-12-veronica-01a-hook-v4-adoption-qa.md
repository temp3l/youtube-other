# Veronica 01A HOOK-B04 v4 adoption and QA

Changed: strict v4 CLI schema/adoption test, canonical scene-004 pixels/manifests/adoption archives, reservation, recensus logic, census/ledger/tranche/run reports, editorial pack, and implementation report.

Result: v4 PNG `22731f2f…b5b3` was chained-adopted with zero image calls. Strict QA retained the 19:1 output but failed semantic 0.66, instant-read 0.62, narration support 0.58, and must-show partial: the separate blocked order still required narration. No retry ran; the four-variant diagram loop is closed.

Tests/checks: focused resume test 9/9 PASS; CLI typecheck PASS; CLI build PASS; archive/hash bindings PASS; 48-source recensus PASS; reservation released; ZIP integrity PASS.

Cost: $0.006486 / €0.006182; cumulative €2.328058; remaining €2.554958; held €0.

Editorial pack: `docs/reports/codex-runs/2026-08-12-veronica-01a-hook-b04-editorial-decision-pack.zip`, SHA-256 `c8d4869a00e61a4cde4c006dc52d70a1cefd6f0f9ee8e4da4fed9507c0b30593`.

Risk/next: human-selected new metaphor or HOOK deferral; portfolio can proceed separately via a three-short narration/timing canary. Commit: none; HEAD `492543b`.
