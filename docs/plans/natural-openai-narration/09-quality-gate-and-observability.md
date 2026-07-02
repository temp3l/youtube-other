# Quality Gate and Observability

## Quality Gate

Produce `quality-gate.json` and a human-readable Markdown report.

Outcomes:

- `READY`
- `READY_WITH_WARNINGS`
- `REGENERATION_RECOMMENDED`
- `BLOCKED`

## Checks

- all required chunks exist;
- no duplicate chunk IDs;
- manifest ordering is contiguous;
- all chunk validations passed or only have allowed warnings;
- final duration is plausible;
- no clipping or excessive silence;
- final loudness is within profile bounds;
- voice/model/speed/config are consistent across chunks;
- no unreported fallback model, fallback voice, or fallback instruction profile was used;
- compatibility output exists when required by render pipeline.

## Optional AI Review

Do not require AI review by default. Add an optional OpenAI text-only subjective review stage that consumes metadata and short excerpts, not audio, unless a future task proves audio review value. Default cost impact should remain negligible.

## Structured Logging

Log fields:

- episode ID;
- language;
- locale;
- variant;
- chunk ID;
- model;
- voice;
- attempt;
- duration;
- input character count;
- instruction character count;
- output bytes;
- cache hit/miss;
- validation status;
- fallback usage;
- failure classification.

Never log:

- API keys;
- authorization headers;
- raw secrets;
- binary audio;
- full story text in routine logs.

## Metrics

Record:

- generation latency;
- retry count;
- success/failure rate;
- estimated character count;
- audio seconds generated;
- cache hit rate;
- validation failure reasons;
- regeneration frequency;
- approximate cost metadata through existing `@mediaforge/observability` pricing hooks.

Cost impact: negligible.
