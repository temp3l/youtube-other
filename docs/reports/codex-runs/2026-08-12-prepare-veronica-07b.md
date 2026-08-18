# Veronica 07b deterministic remediation

Terminal state: **BLOCKED_MISSING_PRODUCTION_INPUT**. The deterministic 07B plan remains valid, but the persisted workspace lacks current eligible narration/timing; replacement or TTS was not authorized. Paid/provider calls: **0**; estimated new spend: **$0**.

Root causes: HOOK used an unsupported threshold fallback and low-confidence unresolved semantics; D04 used an unrelated audience-fit template and a malformed thesis; S03 used unresolved/internal remediation language. Fresh compilation also exposed the same fallback defect in S01/D03. Semantic-quality failure was fallback/template reuse, not source content.

Remediation: [overrides](2026-08-12-prepare-veronica-07b-overrides.json) replace only those five treatments with source-grounded, occupation-neutral consultation/choice scenes. HOOK, D04, and S03 are episode-specific corrections; pre-TTS remediation’s mandatory WAV read was a reusable defect, fixed to retain `selectedAudioHash: null`.

Changed: `packages/strategic-reinvention/src/positioning-production-adapter.{ts,unit.test.ts}`; the override; ignored `episodes/07b-selling-isnt-manipulation/**`; this report.

Checks: focused adapter Vitest file, 15/15 pass; deterministic rematerialization reports validation PASS, semantic quality PASS, provider readiness PASS. No QA, images, TTS, render, or publish executed.

Next safe action: provision current canonical audio/timing, then establish fresh admission and join a bounded QA campaign.
