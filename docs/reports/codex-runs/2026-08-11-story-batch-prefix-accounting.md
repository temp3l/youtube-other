# Story Batch Prefix Accounting Run

Date: 2026-08-11

## Changed files

- Shared prompt-cache measurements and prefix identity.
- Story Batch schema/tool extraction, grouping, manifest schema, and focused tests.
- OpenAI characterization, remediation plan, implementation report, and aborted
  live-verification evidence.

## Checks and results

- Official OpenAI Prompt Caching documentation inspected: Structured Outputs
  schemas and stable tools contribute to the cached prefix.
- Tracked production JSONL and current production schemas measured offline.
- Focused shared/Story cache tests: 26 passed.
- Paid OpenAI requests: 0; cost: USD 0.00.

## Root cause and classification

Phase 2A's positive projection test used a system string repeated 260 times, so
the fixture itself exceeded 1,024 tokens. The live preflight used the real
144-token system block but omitted the cacheable Structured Outputs schema. With
the schema included, current estimates are full/ordinary localization 820,
localized-affect 1,105, and English short 746; tools are absent. Story Batch is
therefore `VARIANT_DEPENDENT`, not uniformly eligible or uniformly sub-threshold.

## Risks and follow-up

Token counts remain conservative offline estimates, not provider tokenization.
Only affect-preserving localization is over 1,024, and it still requires at least
two exact-prefix items in one cache-lifetime burst before a live test is justified.
No prompt restructuring, padding, distributed claim, or cache-family expansion was
performed.
