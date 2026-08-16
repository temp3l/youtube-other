# MICRO-039-E013 — Progressive E013 separately authorized batch

Date: 2026-08-12  
Source plan: `docs/plans/microdrama/implementation-plan.md` (MICRO-039 continuation)

## Summary

Added a **separately authorized** progressive batch for **E013 only** (4 locales). Requires DONE MICRO-039-E012 evidence (+ MICRO-036/038/042). Does not widen E011/E012 authorizations. Fixture private publication for en-US E013; TTS-capable production ports (mock in default/operator fixture path).

## Changes

- `packages/microdrama/src/micro-039-e013-*`
- Scripts: `scripts/microdrama-*-micro-039-e013-progressive-batch.ts`
- Exports in `packages/microdrama/src/index.ts`
- Evidence: `docs/reports/codex-runs/2026-08-12-micro-039-e013-*-evidence.json`

## Validation

- `pnpm test:focused -- packages/microdrama/src/micro-039-e013-bounded-progressive-batch-execute.integration.test.ts` → pass
- Operator prepare + execute → pass

## Results

- Episodes: E013 × en-US/de-DE/es-ES/pt-BR
- `publicationCalls: 1`
- Projection: `microdrama.batch-execution-evidence.MICRO-039-E013`

## Follow-up

E014+ needs new explicit authorization. Live paid TTS (`--live-tts`) and live TikTok posting remain separately gated.
