# Veronica 01A HOOK-B04 v3 adoption and QA

Changed: strict v3 CLI schema/adoption test, canonical scene-004 pixels/manifests/adoption archives, reservation, recensus logic, census/ledger/tranche/run reports, review pack, and implementation report.

Result: v3 PNG `ed527430…cc72a` was chained-adopted with zero image calls. Strict QA recognized the 19-unit reservoir and one retained unit, but failed semantic 0.78, instant-read 0.74, narration support 0.77, and must-show partial because the physical stop remained ambiguous. No retry ran.

Tests/checks: focused resume test 9/9 PASS; CLI typecheck PASS; CLI build PASS; archive/hash bindings PASS; 48-source recensus PASS; reservation released; ZIP integrity PASS.

Cost: $0.006500 / €0.006196; cumulative €2.321875; remaining €2.561141; held €0.

Review pack: `docs/reports/codex-runs/2026-08-12-veronica-01a-hook-v3-qa-failure-review-pack.zip`, SHA-256 `f4943586ad07e936ebe14764766f14302a3f2587d2bfd701b742b89db2e8c18c`.

Risk/next: human stop-geometry decision required before any v4 prototype. Commit: none; HEAD `492543b`.
