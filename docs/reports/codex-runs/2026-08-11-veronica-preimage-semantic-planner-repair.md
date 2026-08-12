# Veronica pre-image semantic planner repair

Date: 2026-08-11  
HEAD inspected: `cf42724e2361e11e39b49f454422a9e76af5f6ee`

## Root cause and producer/consumer graph

The semantic extractor used an already-selected visual strategy as fallback evidence when narration matched no positioning rule. That circular mapping selected a positioning/expertise mechanism, whose topic-specific treatment then validated against its own mechanism regex. Remediation stayed in that family. The normal production path also never invoked the existing beat materializer.

`Pack 2 source -> visual planner input -> v2.3 source plan -> semantic extraction -> concrete compatibility -> bounded family-rejecting remediation -> audio-derived scene timing -> semantic beat planner v2 -> deterministic prompt compiler -> deterministic readiness -> paid-QA eligibility gate`

## Changes

- Added source-derived conservative mechanisms: quantity comparison, input/output flow, retained remainder, workload accumulation, and scaling relation.
- Removed strategy-to-semantic fallback; added typed concrete family incompatibilities and rejection provenance.
- Added bounded contextual-thesis expansion with exact contributing spans.
- Materialized semantic beats in normal production, separated unique assets/events/semantic holds, and blocked compound openings held on one asset.
- Provider readiness now requires beat materialization/quality where applicable.
- Planner `v2.3`, compatibility `v2`, gate `v8`, and beat planner `v2` invalidate contaminated derived state. Legacy derived plans decode, then regenerate on version/config mismatch.

Changed source/tests: `positioning-production-adapter.ts`, `positioning-visual-contracts.ts`, `veronica-semantic-quality.ts`, `veronica-pre-image-semantic-gate.ts`, `veronica-visual-beats.ts`, `veronica-visual-plan-resolver.ts`, and their focused unit tests.

## Verification

- Focused suite attempts: initial regressions exposed doorway-fixture and contextual finite-action gaps; both repaired. Exact contextual test: 1 passed.
- Beat/resolver/adapter command: 20 passed, 1 failed because the new implicit compiler fallback required a canonical reference pack in a temporary workspace. Root cause repaired by preserving the legacy no-compiler fallback; not rerun because the repository retry budget was exhausted.
- `pnpm --filter @mediaforge/strategic-reinvention build`: PASS after final repair.
- `git diff --check`: PASS before report creation.

## 01A deterministic canary

- Source SHA-256: `4e82a65208256d74b2171c4475ee624d9506cfd6f0b21b1f055074d4062c7503`.
- Selected audio unchanged: 71.6 s, 154.19 WPM, WAV `2dfc4193…190622`; timing fingerprint `ef44d1a…afdd0` and timing file hash unchanged.
- Plan: 8 scenes, 13 semantic beats, 13 events, 13 unique/new assets, 0 reuse.
- Density: assets by 5/10/15 s = 2/3/4; average hold 5.508 s; longest semantic/unique-asset hold 7.625 s.
- Deterministic semantic, beat, provider, and canonical validation: PASS; 13/13 prompts PASS.
- Unsupported title-badge, audience-fit, expertise-recognition, first-visitor, referral/work-example, and doorway treatment content is absent from final treatments/prompts. Rejected motifs remain only in remediation audit reasons.
- Paid QA eligibility: true. Offline judges remain unavailable, so scene/beat/sequence result is UNAVAILABLE.

## Safety, risks, next step

Observed paid/external calls: TTS 0; scene QA 0; beat QA 0; sequence QA 0; escalation 0; advisor 0; image 0; thumbnail 0; render 0; publication 0; playlist 0.

Remaining: `TTS_COST_ACCOUNTING_UNCONFIGURED`; paid judge composition was intentionally not exercised. Focused adapter regression needs one later rerun after the fallback repair.

Next paid stage after review approval (do not run here):

`pnpm mediaforge -- veronica-media source-grounded-qa --workspace episodes --episode-id 01a-revenue-is-not-a-good-business -L en --variant short --allow-paid-openai-qa --max-provider-calls 4 --max-estimated-cost-usd 0.40 --json`
