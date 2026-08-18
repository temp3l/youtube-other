# Veronica English portfolio — ChatGPT review pack

## Review request

Review the current English Veronica Shorts portfolio for whether it is safe to authorize a **bounded image-generation canary**. Do not recommend image generation merely because a plan exists: assess source grounding, scene/beat specificity, semantic progression, visual diversity, continuity, prompt readiness, and the portfolio-level deferrals.

Give a concise verdict (`AUTHORIZE CANARY`, `AUTHORIZE WITH CONDITIONS`, or `DO NOT AUTHORIZE`) and:

1. identify any concrete 01A scene or beat that should change before images;
2. distinguish a plan/evidence issue from a production-prerequisite issue;
3. assess whether the deferred v5 episodes must be renewed as a source/audio/timing unit;
4. name the smallest safe next execution tranche.

## Current decision context

- Terminal portfolio state: `PORTFOLIO_QA_COMPLETE`.
- Discovery: 48 English sources across 2 packs; 0 duplicate current revisions.
- 01A is the only current production-ready pre-image episode. Its deterministic plan passes validation, semantic quality, and provider-readiness checks. Its persisted paid QA has 8/8 scene PASS, 13/13 beat PASS, and sequence PASS.
- The paid campaign used six `gpt-5.4-mini` calls, zero retries/escalations, and an estimated $0.1142835 new spend. Aggregate ledger: $0.36067175 of the $2.50 hard ceiling; $2.13932825 remains.
- No TTS, image, thumbnail, render, or publication call was made by this portfolio run. Image generation is still not authorized by this pack.
- 36 episodes lack required audio/timing. Eleven have stale source-provenance mappings. Three v5 candidates are specifically deferred because their workspace points to Pack 1 narration/audio/timing while the v5 scripts materially differ; narration must remain unchanged, so renewal must be explicit and atomic.

## Evidence order

1. Read `reports/portfolio-combined-run.md` and its JSON for the portfolio decision and ledger.
2. Read `evidence/01a/script.md`, `pre-image-semantic-plan.v1.json`, then `source-grounded-visual-qa.v1.json` for the current 01A evidence chain.
3. Use `scenes.json`, `visual-treatments.v1.json`, `visual-bible.v1.json`, timing, and prompt artifacts for a scene-by-scene review.
4. Read `deferred-provenance/README.md` before drawing conclusions about the three v5 deferred episodes.
5. `reports/code-review.md` summarizes the reviewed engineering changes and verification; it is not a substitute for the source artifacts.

## Important evidence rule

Do not use older per-episode review archives as the current QA verdict. Some embed a cache-only `UNAVAILABLE` QA snapshot from before the paid campaign. This pack includes the canonical current shared QA artifact whose result hash is `c1a8071279084c2aeb6c85666050cec68fb3b11e168716cee0a2de9e69160dfc` and whose admission identity is current for the plan.

Provider prompt files are evidence only. They are unapproved and must not be submitted to an image provider.
