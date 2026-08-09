# History V3.6 visual-plan shadow boundary

V3.6 visual-plan integration is additive and shadow-only. It consumes accepted
renderer specs and the frozen V3.5 episode plan. It does not infer relations,
read narration for keywords, or change V3.5 beats, shots, timing, or production
artifacts.

Placement uses `supportClaimIds` already preserved in renderer provenance. For
each claim, the first exact V3.5 beat containing that claim is selected. The
semantic overlay is attached to the latest of those beats, when every support
claim has become available. Missing exact anchors produce
`NO_SAFE_PLACEMENT`; proximity and prose heuristics are forbidden.

Coexistence uses `ADDITIVE_SEMANTIC_OVERLAY`. Every V3.5 beat and shot remains
in the base plan and replacement count is fixed at zero. Provisional V3.5
timing may be used for shadow review, while `TIMING_MEASUREMENT_REQUIRED`
remains visible for real production approval.

`MEDIAFORGE_HISTORY_V36_VISUAL_PLAN=shadow` selects the V3.6 shadow route in
the pure routing seam. Missing, unknown, and production-like values resolve to
V3.5. No production workflow reads this flag yet, so production behavior is
unchanged and activation requires an explicit later approval and wiring step.

For a bounded production candidate only,
`MEDIAFORGE_HISTORY_V36_VISUAL_PLAN=canary` must be paired with an exact,
comma-separated `MEDIAFORGE_HISTORY_V36_CANARY_EPISODES` allowlist. Only a
named episode may select `V3_6_PRODUCTION_CANDIDATE`; all other episodes stay
on V3.5. This route writes only isolated canary artifacts and never changes the
global production default.
