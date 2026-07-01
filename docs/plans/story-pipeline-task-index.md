# Story Pipeline Task Index

| Task | Title | Dependencies | Parallel group | Main packages | Risk | Model | Reasoning | Commit boundary |
| ---- | ----- | ------------ | -------------- | ------------- | ---- | ----- | --------- | --------------- |
| 01 | Locale Guard And `sp` Audit | none | A0 | shared, story-localization, cli | Low | GPT-5.4 Medium | Medium | locale normalization and tests only |
| 02 | Workflow Schema Contracts | 01 | A1 | story-localization or workflow | Medium | GPT-5.4 Medium | Medium | schemas/types/tests only |
| 03 | Workflow Manifest Store | 02 | A1 | workflow/story-localization, shared | Medium | GPT-5.5 Medium | Medium | persistence store and tests |
| 04 | Unified CLI Skeleton | 02,03 | A2 | apps/cli | Low | GPT-5.4 Medium | Medium | command skeleton/dry-run |
| 05 | English Rewrite Stage Wrapper | 03 | A3 | story-localization | Medium | GPT-5.5 Medium | Medium | wrapper around existing service |
| 06 | English Source Fallback Flow | 05 | A3 | story-localization | High | GPT-5.5 Medium | Medium | fallback/gate persistence |
| 07 | Quality Gate Adapter Full And Short | 03 | A3 | story-localization | Medium | GPT-5.5 Medium | Medium | reusable quality decision adapter |
| 08 | Locale Branch Isolation And Fallback | 06,07 | B1 | story-localization | High | GPT-5.5 Medium | Medium | per-locale fallback |
| 09 | Independent Short Outcomes | 07 | B1 | story-localization | Medium | GPT-5.5 Medium | Medium | short stage/gate links |
| 10 | Visual Branch Boundary | 06,07 | B1 | image-generation, story-localization | Medium | GPT-5.5 Medium | Medium | image dependency scheduling |
| 11 | Media Stage Adapters | 08,09,10 | B2 | speech, metadata, rendering, upload, image-generation | High | GPT-5.5 Medium | Medium | adapters, no internals rewrite |
| 12 | Provider Batch Hybrid | 03,08 | B2 | story-localization, image-generation | High | GPT-5.5 Medium | Medium | batch grouping/reconciliation |
| 13 | Cost Budgets And Telemetry | 03,07 | B2 | observability, story-localization, cli | Medium | GPT-5.5 Medium | Medium | cost/budget fields |
| 14 | Status And Inspect Reports | 04,11,12,13 | C1 | apps/cli, story-localization | Medium | GPT-5.4 Medium | Medium | reports only |
| 15 | Resume And Invalidation | 03,11,13 | C1 | workflow/story-localization | High | GPT-5.5 Medium | Medium | invalidation/resume |
| 16 | Legacy Command Delegation | 14,15 | C2 | apps/cli | High | GPT-5.5 High | High | delegation with compatibility |
| 17 | End-To-End Hardening | 16 | C3 | cli, story-localization, media packages | High | GPT-5.5 Medium | Medium | tests/fixtures only unless gaps found |

## Recommended Execution Batches

- First serial batch: 01, 02, 03.
- First parallelizable batch: 04, 12 schema prep, 13 cost schema prep after 03.
- Main parallel implementation batch: 08, 09, 10 after 07.
- Compatibility batch: 14 and 15 with coordination after media adapters.

## Cheaper Model Tasks

01, 02, 04, 14, and documentation/deprecation warning slices of 16 are suitable for GPT-5.4 Medium.

## Strong Model Tasks

03, 05, 06, 07, 08, 09, 10, 11, 12, 13, 15, and 17 require GPT-5.5 Medium.

## Architecture-Sensitive Tasks

16 may require GPT-5.5 High if legacy delegation changes shared command behavior or crosses many central files.
