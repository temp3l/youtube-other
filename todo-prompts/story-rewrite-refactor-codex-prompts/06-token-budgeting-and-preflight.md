# Task: Token Budgeting And Preflight

Add deterministic preflight before paid calls for all story narration variants.

## Objective

Prevent predictable full and short generation failures, especially output-token exhaustion and repeated unchanged failed requests.

## Requirements

Token budgeting must distinguish:

- canonical English full;
- localized full;
- canonical English short;
- localized short;
- full repair;
- short repair;
- semantic validation where model-backed.

Preflight must check:

- input token estimate;
- output token cap;
- target word range and duration;
- schema availability;
- language and locale support;
- variant-specific model config;
- cost ceiling;
- request fingerprint duplicate failure;
- missing validated parent full story for short generation.

## Configuration

Honor existing `.env` precedence from `packages/config/src/index.ts`, including story, localization, short, short rewrite retry, validator, metadata, and speech settings. Add missing explicit config only when needed and tested.

## Tests

Add tests for:

- full budget failure before provider call;
- short budget failure before provider call;
- output cap changes affect fingerprint;
- config precedence;
- no repeated unchanged failed request.

## Acceptance Criteria

- Every paid narration stage has variant-specific preflight.
- Full stories and shorts have separate output caps and retry caps.
- Preflight failures are persisted and counted without provider calls.
