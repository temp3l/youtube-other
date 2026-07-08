Summary: Generated episode 025 full and short video artifacts for English and German. Full English and German renders completed, German full approved, and both short renders completed with paid providers.

Changed files:
- `episodes/025-the-endless-backrooms/languages/script-en.md`
- `episodes/025-the-endless-backrooms/languages/script-de.md`
- `episodes/025-the-endless-backrooms/languages/short/script-en.md`
- `episodes/025-the-endless-backrooms/languages/short/script-de.md`
- `packages/rendering/src/index.ts`
- `packages/rendering/dist/index.js`

Checks run:
- `DARK_TRUTH_ENABLE_PAID_PROVIDERS=true pnpm mediaforge -- episode english --episode 025-the-endless-backrooms --output-root episodes`
- `pnpm mediaforge -- episode review approve --episode 025-the-endless-backrooms --language de --artifact full --output-root episodes`
- `DARK_TRUTH_ENABLE_PAID_PROVIDERS=true pnpm mediaforge -- episode short --episode 025-the-endless-backrooms --language en --output-root episodes --no-visual-retention`
- `DARK_TRUTH_ENABLE_PAID_PROVIDERS=true pnpm mediaforge -- episode short --episode 025-the-endless-backrooms --language de --output-root episodes --no-visual-retention`

Results: Full and short artifacts were written under `episodes/025-the-endless-backrooms/{en,de}/{full,short}`. English and German short renders succeeded after adding canonical short script files. German full approval is present.

Risks remaining: The short render logged duplicate/stale image warnings in `shared/short/images/generated`, so future reruns may still need cleanup there.

Follow-up tasks: None required for this episode unless the stale short-image set is cleaned up later.
