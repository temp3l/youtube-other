# GPT-5.6 Prompt Cache Controlled Verification

Date: 2026-08-11
Verdict: **ABORTED BEFORE DISPATCH — PREFIX ACCOUNTING SUPERSEDED**
Paid requests: 0 of 2 authorized
Measured cost: USD 0.00 of USD 0.10 authorized

## Transport decision

Official OpenAI Batch documentation states that result order may differ from input
order. Batch therefore cannot prove deterministic first-write/second-read behavior.
The planned transport was two sequential synchronous `/v1/responses` calls using
the exact Story Batch body projection, with request B gated on request A usage.
Sources: [Batch API](https://developers.openai.com/api/docs/guides/batch) and
[Prompt Caching](https://developers.openai.com/api/docs/guides/prompt-caching).

## Static gate

- Prefix fingerprints equal: passed.
- Routing keys equal when derived from the common prefix: passed.
- Logical request fingerprints differ: passed.
- Serialized stable prefix bytes equal: passed.
- Output limit: 64 tokens; retries, fallbacks, repairs, and tools: disabled.
- Estimated explicit content prefix: 144 tokens.
- Required minimum: 1,024 tokens.
- Planner result: `disabled`, `PREFIX_TOO_SHORT`, no projected routing key or breakpoint.

The fail-closed decision was correct for the then-current estimator, but the
estimator counted only the explicit system `input_text`. OpenAI documents the
Structured Outputs schema as provider-rendered cached prefix content before the
system message. The production request uses `text.format` JSON schema and no tools.
No provider request was dispatched, so there is no usage or cache-economics result.

## Reconciled offline accounting

| Story Batch variant | Explicit content | Stable schema | Tools | Effective estimate | Result |
|---|---:|---:|---:|---:|---|
| canonical full | 144 | 676 | 0 | 820 | genuinely sub-threshold |
| ordinary localization | 144 | 676 | 0 | 820 | genuinely sub-threshold |
| affect-preserving localization | 144 | 961 | 0 | 1,105 | eligible only with at least two same-prefix items |
| English short | 144 | 602 | 0 | 746 | genuinely sub-threshold |

The earlier Phase 2A positive fixture repeated `"stable story contract"` 260
times, so its explicit system block—not a production contract—exceeded 1,024.
The live preflight used a representative production system block. Neither result
counted dynamic narration; the contradiction came from a synthetic fixture plus
incomplete schema accounting.

## Next prerequisite

Measure whether production plans actually contain at least two affect-preserving
localization items with identical model, locale, prompt policy, schema, tools, and
system prefix inside one cache lifetime. Without that burst evidence, do not run
another paid experiment. Do not restructure or pad prompts, broaden caching, or
add distributed claims.
