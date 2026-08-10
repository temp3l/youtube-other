# Veronica semantic remediation quality hardening

Date: 2026-08-10

Start HEAD: `7883aaf1422e144b2fc54c6441a2fb051e3570a2`

Cross-genre worktree conflict: none; worktree was clean and no active adoption process was found.

## Status

- `VERONICA_SEMANTIC_REMEDIATION_QUALITY: PASS`
- `VERONICA_PROVIDER_PROMPT_READINESS_INTEGRITY: PASS`
- `VERONICA_L02_L03_EIGHT_PACK: READY_FOR_HUMAN_PRE_IMAGE_REVIEW`
- `LIVE_TTS_PROVIDER_CALL_COUNT = 0`
- `IMAGE_PROVIDER_CALL_COUNT = 0`
- Text-model calls: `0`

## Root causes and corrections

1. Missing theses passed because the semantic gate substituted `narrativeBeat`, while provider projection required explicit `visibleThesis`. The gate now requires the explicit field for every provider-target scene.
2. Keyword-soup passed because length/token overlap and fixed-looking heuristic scores were treated as semantic quality. Scores now come from named structural checks, including linguistic sanity, finite predicate, narration grounding, visual expressibility, scene specificity, and adjacent distinction.
3. Occupation-proxy repair replaced whole scenes with one neutral comparison environment. Repair now preserves the causal mechanism and neutralizes only unsupported profession details.
4. Buyer repair appended one compare/recognize/choose action. Typed consequence families now select narration-supported remember, categorize, hesitate, ignore, trust, notice, refer, choose, recognize, or understand behavior without changing action ownership.
5. Doorway leakage came from a final-scene index fallback and unrevalidated motif state. The fallback was removed; motif use now requires narration support and episode-local provenance.
6. Aggregate readiness ignored provider projection. Pack v6 now requires semantic gate, semantic quality, provider projection, provider prompt quality, timing integrity, and hashes independently.

Remediation policy is `veronica-semantic-auto-remediation.v2`, semantic gate `v5`, proposition `v1`, provider projection `v4`, prompt quality `v1`, and review pack `v6`. Maximum rounds remain `2`; low-confidence or non-convergent plans fail closed. Natural pacing v3 and selected-audio timing ownership were unchanged.

## Corpus results

| Pack | Initial blockers | Final blockers | Missing theses | Malformed theses | Projection blocked | Rounds | Collapse | Timing | Hashes | Ready |
|---|---:|---:|---:|---:|---:|---:|---|---|---|---|
| L02 full | 24 | 0 | 0 | 0 | 0 | 1 | PASS | PASS | PASS | yes |
| L02-S01 | 9 | 0 | 0 | 0 | 0 | 2 | PASS | PASS | PASS | yes |
| L02-S02 | 0 | 0 | 0 | 0 | 0 | 0 | PASS | PASS | PASS | yes |
| L02-S03 | 12 | 0 | 0 | 0 | 0 | 2 | PASS | PASS | PASS | yes |
| L03 full | 26 | 0 | 0 | 0 | 0 | 1 | PASS | PASS | PASS | yes |
| L03-S01 | 11 | 0 | 0 | 0 | 0 | 2 | PASS | PASS | PASS | yes |
| L03-S02 | 10 | 0 | 0 | 0 | 0 | 2 | PASS | PASS | PASS | yes |
| L03-S03 | 9 | 0 | 0 | 0 | 0 | 1 | PASS | PASS | PASS | yes |

All remain `BLOCKED_PENDING_HUMAN_PRE_IMAGE_APPROVAL`.

| Pack | Scenes | Assets | Generic fallback | Action reuse | Environment reuse | Motif reuse | Result |
|---|---:|---:|---:|---:|---:|---:|---|
| L02 full | 9 | 14 | 0 | .4444 | .3333 | .1111 | PASS |
| L02-S01 | 5 | 5 | 0 | .2 | .4 | 0 | PASS |
| L02-S02 | 5 | 5 | 0 | 0 | 0 | 0 | PASS |
| L02-S03 | 5 | 5 | 0 | .6 | .6 | 0 | PASS |
| L03 full | 10 | 14 | 0 | .3 | .3 | 0 | PASS |
| L03-S01 | 5 | 5 | 0 | .2 | .6 | 0 | PASS |
| L03-S02 | 5 | 5 | 0 | .25 | .25 | 0 | PASS |
| L03-S03 | 5 | 5 | 0 | .6 | .4 | 0 | PASS |

| Short | Speed | WAV | Calibration | Canonical | Scene end | Event end | README | Result |
|---|---:|---:|---|---:|---:|---:|---:|---|
| L02-S01 | .9645 | 59.8725 | WITHIN_PREFERRED_RANGE | 59.8725 | 59.8725 | 59.872 | 59.8725 | PASS |
| L02-S02 | 1.0162 | 57.9163 | WITHIN_ACCEPTANCE_TOLERANCE | 57.9163 | 57.9163 | 57.916 | 57.9163 | PASS |
| L02-S03 | .9034 | 57.4400 | PACING_TARGET_MISSED | 57.4400 | 57.4400 | 57.440 | 57.4400 | PASS |
| L03-S01 | 1.0603 | 57.4371 | PACING_TARGET_MISSED | 57.4371 | 57.4371 | 57.437 | 57.4371 | PASS |
| L03-S02 | 1.0296 | 56.7679 | PACING_TARGET_MISSED | 56.7679 | 56.7679 | 56.768 | 56.7679 | PASS |
| L03-S03 | .9425 | 58.2393 | WITHIN_PREFERRED_RANGE | 58.2393 | 58.2393 | 58.240 | 58.2393 | PASS |

| Finding | Initial | Final blockers | Strategy |
|---|---:|---:|---|
| VISIBLE_THESIS_REQUIRED | 40 | 0 | proposition-derived explicit thesis |
| BUYER_PERSPECTIVE_REQUIRED | 10 | 0 | narration-specific consequence family |
| OCCUPATION_PROXY_DRIFT | 16 | 0 | preserve mechanism; neutralize proxy only |
| SEMANTICALLY_DECORATIVE_SCENE | 28 | 0 | unique claim and adjacent information gain |
| ABSTRACT_PROP_DRIFT | 3 | 0 | concrete actor/evidence/action relation |
| NARRATION_RELATIONSHIP_MISMATCH | 4 | 0 | strong proposition replan |
| MULTI_STATE_STILL_AMBIGUITY | 21 | 0 | decisive Short transition; full sequence retained |

## Representative before/after

- Missing hook, L03-S03-HOOK: no thesis and framework action → “Open your website and pretend you have never seen your business before. The visitor can identify the category before deciding to continue,” with a visitor scanning one opening screen.
- Keyword soup, L03-S02-V01: malformed “Because third relevant context…” in generic comparison setting → a simple-site/category claim in a concrete usability-test setting.
- Generic repair, L02-S03-V02: neutral evidence comparison → seller-first package visibly moved behind customer problem evidence.
- Leaked doorway, L02-S03-V04: unsupported foothold/future doorway → buyer identifies lived problem evidence before inspecting the matching response.

## Changed files

`veronica-semantic-quality.ts`, semantic gate/contracts/policy/adapter/index, CLI review pack, archive builder, focused semantic tests, and this architecture/report documentation.

## Verification

- Semantic gate focused run: 21 pre-existing tests passed before the final isolated consequence fix; the repaired consequence-specific test then passed independently.
- CLI review-pack unit test: 5/5 passed.
- Strategic package typecheck: passed.
- Strategic and CLI builds: passed.
- Targeted ESLint: passed.
- Eight normal no-provider regenerations: passed.
- All per-pack hashes and cross-artifact timing/provider integrity: passed.
- Combined ZIP test: passed; SHA-256 `5238b2912d4c4bd65b10b698666623417d23e2d45a8135263ec936671639e80c`.

Archive: `artifacts/review/veronica-l02-l03-chatgpt-review-quality-hardened-20260810T1953Z.zip` (ignored generated artifact; present in workspace). Remaining step: human/ChatGPT prompt review before any image generation.
