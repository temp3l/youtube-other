# Tighten Veronica semantic prompts

Date: 2026-08-10

## Changed files

- `packages/shared/src/semantic-image-prompt.ts`
- `packages/strategic-reinvention/src/semantic-image-prompt.ts`
- `packages/strategic-reinvention/src/semantic-image-prompt.unit.test.ts`
- `packages/strategic-reinvention/src/fixtures/l01-s01-semantic-image-prompt.v1.json`
- `docs/architecture/semantic-image-prompt-preflight.md`
- `docs/reports/codex-runs/2026-08-10-tighten-veronica-semantic-prompts.md`

## Result

V01 now uses one professional evaluation context. V03 is a direct two-professional buyer comparison. Veronica adapter v2 applies semantic-first treatment precedence, rejects narration-unrequired abstraction, and opts into deterministic whole-clause projection targeting 250–350 words with a 450-word fail-closed ceiling. All five L01-S01 meanings, 9:16/text-free constraints, diversity, and multilingual reuse remain intact. History stays on adapter v1; map-state, reference-gating, and trusted-script tests pass.

## Checks

- Focused Veronica: 8 passed
- Shared assembler: 4 passed
- Focused History: 6 passed
- Shared, Strategic Reinvention, History typechecks: passed
- Targeted ESLint: passed
- Offline previews: 280–341 words; V01 284, V03 341

## Remaining risk / follow-up

No paid provider or image generation ran. Next: generate only the five reviewed calibration scenes after human approval.
