# 01A English Short paid pre-image QA

Date: 2026-08-11  
HEAD: `cf42724e2361e11e39b49f454422a9e76af5f6ee`

## Result

Final canary state: `BLOCKED`.

The canonical paid QA run used the configured interactive routing and stopped at the four-call/output-token reservation. Scene QA passed 8/8. Beat QA passed 7/13; six beat judgements are `UNAVAILABLE` because the estimated output-token ceiling would be exceeded. Sequence QA correctly did not dispatch because the required beat set was incomplete.

The run also exposed a deterministic artifact-integrity defect: the canonical semantic-plan file changed from `f4960a394a523f10dd9149d1425fbe48fe0320bd11e84bcaa907b7176ca49a4b` to `e6ca058ebb9f7f2da26d1b23e65e4096c310b5de025be0780b94fdbe6a075c75` when QA state was embedded. The post-run semantic review also contains `BUYER_PERSPECTIVE_REQUIRED` for S01. Per policy, no further paid remediation ran.

## Call and cost accounting

- Primary: 3 calls, `gpt-5.4-mini` / low (two scene operations, one beat batch).
- Escalation: 1 call, `gpt-5.6-terra` / medium. Reason: HOOK-B04 primary returned `REVIEW` for `NEW_INFORMATION_UNSUPPORTED` and `PROVIDER_PROMPT_BEAT_MISMATCH`; escalation resolved it to `PASS`.
- Advisor: 0; sequence: 0; retries: 0; cache hits: 0; uncached provider calls: 4.
- Reservation: 4 calls / `$0.1017745`; configured ceiling: `$0.40`; actual estimated cost: `$0.045203`.
- TTS, image, thumbnail, render, publication, and playlist calls: 0 each.

## Artifacts changed

- Canonical QA artifacts under `episodes/01a-revenue-is-not-a-good-business/` (ignored production workspace).
- Recovered compact pack: `review-packs/pre-image/en-short/run-1786480304249/` and matching ZIP.
- This report.

## Checks

- Source `4e82…7503`, WAV `2dfc…0622`, and timing `67e2…bb2`: preserved.
- Provider prompts: 13/13 deterministic `PASS`; provider projection/quality/coherence: `PASS`.
- Pack manifest/hash/cross-artifact checks: pass; ZIP integrity: pass.
- `git diff --check`: pass.

## Remaining risks and follow-up

Repair deterministic semantic-plan immutability and S01 buyer-perspective classification, then authorize a fresh bounded QA run for the six unavailable beats and sequence. Human pre-image approval remains pending. No image generation is authorized.
