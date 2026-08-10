# History V3.6 production activation record

- Activated: `2026-08-10T00:35:14Z`
- Previous mode: `OFF` / V3.5
- New mode: `GLOBAL` / V3.6
- Routing config: `MEDIAFORGE_HISTORY_V36_VISUAL_PLAN=global`; rollback is `off`
- Routing implementation commit: `c6847c7d14edce5acee1a271fea56daf0e3eecd2`
- Activation commit: `5b75d3b3a7c3f8a27256c29e0f71e46847cf1406`
- Production-readiness baseline: `history-v3.6-production-readiness-baseline` (`cbeab20078c3932e1e08cdb9e607fde34a96c9e4`)
- Canary bounded-rollout baseline: `fc0be5851b3bc262e6d45fdac55664341c48c50f`; readiness tag commit `15460165464f72296557dd3879194b733485559b`
- Timing: measured TTS/final audio required; minimum `300s`
- GLOBAL smoke: Black Death, D-Day, and non-canary Napoleon passed V3.6 composer selection and exact placement
- Negative control: provisional Napoleon failed closed with `TIMING_MEASUREMENT_REQUIRED`
- OFF/CANARY regressions: passed; exact canary allowlist retained
- Rollback: set `MEDIAFORGE_HISTORY_V36_VISUAL_PLAN=off`; all smoke episodes route to unchanged V3.5 derivatives and V3.6 manifest routing is cleared
- Validation: 10 focused tests passed; History typecheck and targeted ESLint passed; V3.5 planner/contracts/adapter source unchanged; hard invariant failures `0`
- Episode regeneration/publication: not run
