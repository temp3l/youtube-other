# MICRO-034 narration-aligned visuals (E001–E003)

**Date:** 2026-08-13  
**Source:** MICRO-034 live visual canary / narration–scene alignment

## Summary

Plate prompts now follow each shot’s spoken subtitle/TTS window. Graphic cues are softened for OpenAI image safety; a violence refusal retries once with a non-physical staging rewrite (cast/location/blocking only).

## Changes

- `packages/microdrama/src/microdrama-narration-visual-alignment.ts` — cue→window mapping; broader soften (`bleeding`, `killer`, split-line `hits`)
- `packages/visual-planning/src/microdrama-provider-visual-brief.ts` — `rewriteProviderBriefForViolenceRetry`
- `packages/image-generation/src/microdrama-visual-generation/openai-adapter.ts` — one retry on `safety_violations=[violence]`

## Validation

- `pnpm test:focused -- packages/image-generation/src/microdrama-visual-generation/openai-adapter.unit.test.ts` — pass (1)
- `pnpm exec tsx scripts/microdrama-execute-micro-034-canary.ts --live-images --episodes E00{1,2,3} --review-density` — DONE (15 plates each)
  - E001/E002/E003 subtitled mp4s under `.artifacts/microdrama/micro-034-canary/en-us/e00{1,2,3}/`

## Risks

- Softening/retry can make violent beats less literal than the dialogue.
- E002 plate ~010 may have used the safer retry staging.
