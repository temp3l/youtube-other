# MICRO-034 live images (E001)

## Summary

Wired OpenAI live image generation for MICRO-034 and regenerated **E001** with real plates (no mock 70B PNGs). Subtitled MP4 rewritten in place under `.artifacts/microdrama/micro-034-canary/en-us/e001/`.

## Changed paths

- `packages/image-generation/src/microdrama-visual-generation/openai-adapter.ts` (new)
- `packages/image-generation/src/microdrama-visual-generation/index.ts`
- `packages/microdrama/src/micro-034-visual-production-ports.ts` (live port; registry attach no longer forces mock bytes)
- `packages/microdrama/src/micro-034-canary-bindings.ts`, `en-e001-e003-visual-canary-preflight.ts`, authorization prep/execute/tests/index/script

## Operator

```bash
pnpm exec tsx scripts/microdrama-execute-micro-034-canary.ts --live-images --episodes E001
```

**DONE** (~395s). Evidence: `docs/reports/codex-runs/2026-08-12-micro-034-live-image-canary-execution-evidence.json`  
Plates: five `864x1536` PNGs (~1.4–2.1MB). Subtitled output: `.../e001/...en-us.subtitled.mp4` (~3.5MB).

## Tests

- `pnpm exec vitest run -c vitest.integration.config.ts --bail=1 packages/microdrama/src/micro-034-bounded-visual-canary-execute.integration.test.ts -t "after mock MICRO-033"` — PASS

## Risks

E002/E003 under the same canary root still have mock plates unless re-run with `--live-images`. Canary budget accounting uses estimated $0.25/image, not live invoice totals.
