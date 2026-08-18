# Veronica English pre-image portfolio remediation plan

## 2026-08-12 execution update

Wave 2 now fails closed on stale workspace/source provenance; it does not silently replace scripts that may still be bound to selected audio and timing. Wave 4 has typed budget/prerequisite/provider unavailability for safe later resume. Wave 1 is prepared by the provisioning manifest. Wave 3 remains open: the three legacy cases need source-compatible candidate evidence, not cosmetic restaging.

## Wave 1 — Production-input coverage (INFRASTRUCTURE_FIX)

Root cause: 36 active English scripts lack selected narration audio and/or canonical timing. Own: episode provisioning and TTS/timing workflow. Do not fabricate inputs; provision canonical audio/timing, then create normal workspaces. Expected impact: unlock 75% of the census. No QA cache can be reused because identities will be new.

## Wave 2 — Canonical planner-input resolver (SYSTEMIC_FIX)

Root cause: 8 input-complete episodes fail MISSING_PLANNING_INPUT. Own: veronica-visual-plan-resolver and workspace preparation. Make active source/script mapping discoverable without episode-specific branches. Regression: fixtures for long and short active English workspaces. Expected impact: unlock 8 episodes; regenerate plans/admissions; paid QA only after deterministic PASS.

## Wave 3 — Visual-beat diversity hard blockers (SYSTEMIC_FIX)

Affected: l02-s01, l02-s02, l05-s01. Own: candidate generation, ranking, bounded refinement, and sequence diversity. Preserve source meaning while resolving adjacent duplication, low information gain, and opening novelty. Regression: focused source-grounding and real-action-diversity canaries. New plans/prompts/admissions; cached QA invalidated only for changed identities.

## Wave 4 — QA reservation observability (INFRASTRUCTURE_FIX)

Root cause: a conservative capped primary run completed scenes but left beat entries budget-unavailable. Own: source-grounded QA scheduler/cache classification. Treat budget-unavailable outcomes as resumable under a new authorized tranche without treating them as semantic findings. Regression: cache/reservation resume test.

## Wave 5 — Minimal portfolio verification

After Waves 1–3, admit all deterministic passes; run batched cheap primary QA fairly across episodes, escalating only samples needed to classify ambiguity. Residual source-specific editorial findings become EPISODE_SPECIFIC_EDIT or EDITORIAL_HUMAN_DECISION, never bulk patches.
