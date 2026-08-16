# MICRO-034 5–8s unique image cadence

Review density derives unique plates/cuts from episode **max** duration so each unique image lands about every **5–8 seconds** (~6.5s midpoint). For ~60s → **9 unique images** (1 plate per cut). Fixed prior bug that used half-duration targetSeconds.

```bash
pnpm exec tsx scripts/microdrama-execute-micro-034-canary.ts --live-images --episodes E001 --review-density
```

**DONE**. `.artifacts/microdrama/micro-034-canary/en-us/e001/…en-us.subtitled.mp4`
