# VRI-08 slide redesign and readability

Date: 2026-08-09

## Summary

Added a versioned `veronicabenini` source-slide derivative contract and deterministic planning helper. It preserves originals by producing metadata only, binds source checksum/revision, effective configuration, dependencies, transformation chain, reuse/regeneration rationale, and requires reflowed localized overlays for text-bearing slides. Context-only and forbidden sources fail closed. Added independent 16:9/9:16 scene readability checks for safe areas, minimum text size, blind crops, and reused composition identities. No provider or live render calls were added.

Exact fingerprint reuse is recorded as `content-hash-match`; unchanged language-independent imagery remains reusable without locale identity.

## Changed files

- `packages/veronica-media/src/preparation/source-slide-redesign.ts`
- `packages/veronica-media/src/preparation/source-slide-redesign.unit.test.ts`
- `packages/veronica-media/src/composition/aspect-ratio.ts`
- `packages/veronica-media/src/composition/aspect-ratio.unit.test.ts`
- `packages/veronica-media/src/index.ts` (VRI-08 export only; preserved VRI-07 export)

## Checks

- `pnpm test:focused -- packages/veronica-media/src/preparation/source-slide-redesign.unit.test.ts packages/veronica-media/src/composition/aspect-ratio.unit.test.ts` — passed, 5 tests.
- `pnpm --filter @mediaforge/veronica-media typecheck` — blocked by existing errors in `src/narration/revision.ts`, `src/planning/direction.ts`, and `src/planning/semantic-planner.ts`; no VRI-08 error reported.
- `git diff --check` — passed.

## Risks and follow-up

The helper exposes the derivative contract but is not yet wired into the planner/orchestrator; that integration should consume it when VRI-09 composes ratio-specific derivatives.
