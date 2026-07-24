# M2-010 private batch preflight

Status: **READY_FOR_PRIVATE_BATCH**. No provider call, subprocess, media render, or remote mutation was submitted.

Source task: `todo-prompts/math-2/10-class5-private-batch.md`.

Changed files: `apps/cli/src/math-commands.ts`, `apps/cli/src/math-commands.unit.test.ts`, `packages/math-education/src/orchestration/batch-planner.ts`, `packages/math-education/src/orchestration/batch-planner.unit.test.ts`, and this report. The repair replaces the three-item simulation capability in private planning with the 37-item production capability and adds canonical batch plan/run/resume/status/cancel, durable item telemetry, and aggregate/per-lesson cost gates.

Preflight command: `node apps/cli/bin/mediaforge.js math batch plan --grade 5 --variant standard --language de --private --paid-speech --workspace /tmp/m2-010-preflight-WHdPDK`

Plan: batch `batch-8c406fa09c5500c233f56d08be604af825bc522e`; release `9afb5e2c0ed7a10628df7f5d1d589739995910900d66b5b479894a3a95360b31`; approval `5abffd11c1de3eb9307702a89c2746c7ed907b8810a42e12b7ca9d6de55c8519`. Order: M5-ZO-001..024, M5-GM-001..003, M5-RF-001..006, M5-GM-004..005, M5-DZ-001..002.

Counts: 37 planned, 0 successful/failed/excluded, 592 workflow misses, 273 speech misses/calls, 175,290 characters, 8,880 seconds. Conservative estimate: USD 8.307539 total; maximum lesson USD 0.225386. Required ceilings: USD 0.226/lesson and USD 8.308 total. Concurrency 1, rate 0.05 item/s, two batch retries, three speech attempts. Workspace is empty, contained, writable, source-external, collision-free, and has 15,635,607,552 bytes available versus 2,147,483,648 required. Credentials are configured without secret output. Output remains private; live publish, OAuth, and remote mutation are unavailable.

Checks: planner 3/3 passed; added CLI preflight test passed; CLI typecheck, targeted ESLint, affected builds, diff check, and packaged preflight passed. The full CLI file reached 12 passing tests before an unrelated stale-dist content-identity failure; it was not rerun after the affected build because the focused-test budget was exhausted.

Risks/follow-up: no media exists yet, so media acceptance and M2-011 remain blocked. Paid execution requires the exact fresh approval: “Approve paid German speech for the canonical 37-lesson Class 5 standard/de private batch only, with a hard ceiling of USD 0.226 per lesson and USD 8.308 total.”
