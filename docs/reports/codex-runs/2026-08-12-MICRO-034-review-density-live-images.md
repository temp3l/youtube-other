# MICRO-034 review-density live images (E001–E003)

## Summary

Regenerated **E001** (and continued with **E002–E003**) using live OpenAI images, provider visual briefs, review density (5 plates / 7 cuts), and **4 unique front-loaded cuts in ~0–15s**.

Operator command timed out at the old 900s Vitest limit after artifacts/evidence were written; operator timeout raised to **1800s**.

## Operator

```bash
pnpm exec tsx scripts/microdrama-execute-micro-034-canary.ts --live-images --episodes E001,E002,E003 --review-density
```

Evidence: `docs/reports/codex-runs/2026-08-12-micro-034-live-image-canary-execution-evidence.json` — status **DONE**, episodes E001–E003.

## Review paths

- E001 (~60.6s): `.artifacts/microdrama/micro-034-canary/en-us/e001/…en-us.subtitled.mp4`
- E002 (~60.4s): `.artifacts/microdrama/micro-034-canary/en-us/e002/…en-us.subtitled.mp4`
- E003 (~63.1s): `.artifacts/microdrama/micro-034-canary/en-us/e003/…en-us.subtitled.mp4`
