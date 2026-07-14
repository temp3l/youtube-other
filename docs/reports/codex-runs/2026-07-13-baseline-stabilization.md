# Baseline Stabilization

## Summary

Accepted the audit gate and repaired four source-backed story defects: invalid
full-only inputs now return a closed failure result, canonical fact extraction
captures unquoted written messages, and Markdown metadata with a bolded colon
parses correctly. Threat synthesis now separates Noah Price from the named
Black-Eyed Children entity. Batch 1 remains in progress under the verification
guardrails.

## Changed paths

- `apps/cli/src/episode-commands.ts`
- `packages/story-localization/src/full-story-contract.ts`
- `packages/story-localization/src/canonical-facts.service.ts`
- `packages/story-localization/src/source-story-parser.ts`
- `docs/refactor/audit/README.md`
- This report.

## Tests/checks

- Full-story contract: 12/12 passed.
- Targeted story facts/disclosure: 2/2 passed.
- Story-localization package build: passed.
- Character synthesis test: still fails on case-sensitive `/black[- ]eyed children/`; output is `The Black-Eyed Children`.

## Risks and follow-up

The remaining assertion is classified `STALE_FIXTURE`; repair stopped after two
targeted attempts. Other recorded baseline defects and fixtures remain, so
Batches 2-14 are not yet authorized. No provider or publish operation ran.
