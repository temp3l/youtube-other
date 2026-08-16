# MICRO-038 — Audited TikTok public publication canary

Date: 2026-08-12  
Source plan: `docs/tasks/microdrama/implementation-backlog.json` (MICRO-038)

## Summary

Implemented and executed MICRO-038 as a separately approved **public** Direct Post canary for en-US **E002**, gated on MICRO-037 private canary evidence, MICRO-050 OAuth evidence, `public_canary` capability, and `TIKTOK_PUBLIC_POSTING_ENABLED`.

Fixture TikTok adapters only (`publicationCalls: 1`, no live TikTok network).

## Files changed

- `packages/microdrama/src/micro-038-*` (bindings, auth, preflight, prep, execute, MICRO-037 evidence loader, integration test)
- `scripts/microdrama-prepare-micro-038-public-publication-canary.ts`
- `scripts/microdrama-execute-micro-038-public-publication-canary.ts`
- `packages/microdrama/src/index.ts` exports
- Backlog status → DONE
- Evidence: `docs/reports/codex-runs/2026-08-12-micro-038-*-evidence.json`

## Validation

- `pnpm exec vitest run -c vitest.integration.config.ts packages/microdrama/src/micro-038-tiktok-public-publication-canary-execute.integration.test.ts -t "authorizes and executes public publication canary after upstream evidence"` → pass
- Operator prep + execute scripts → pass

## Results

- Status: DONE
- Publish id: `tiktok.publish.micro-038.1`
- Receipt: `video.micro-038.public`
- Privacy: public; capability: `public_canary`

## Risks / follow-up

- Fixture adapters only; live TikTok public posting remains a separate operator decision.
- Next backlog item depending on MICRO-038: MICRO-039 (progressive E011+) and/or MICRO-042 (public video analytics read).
