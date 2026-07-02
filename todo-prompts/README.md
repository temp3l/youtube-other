# Natural OpenAI Narration — Implementation Prompt Pack

This pack contains Codex implementation prompts for all 18 tasks under:

`docs/plans/natural-openai-narration/tasks/`

## Recommended execution order

| Batch | Tasks | Dependency mode | Minimum model | Recommended model | Best model |
|---|---:|---|---|---|---|
| 01 | 01 | Standalone | GPT-5 mini, medium | GPT-5, medium | GPT-5.5, low |
| 02 | 02 | After 01 | GPT-5, medium | GPT-5, high | GPT-5.5, medium |
| 03 | 03, 04, 06, 09 | Independent after 02; implement sequentially in one session | GPT-5, medium | GPT-5, high | GPT-5.5, medium |
| 04 | 05, 07, 08 | Sequential dependency chain | GPT-5, high | GPT-5.5, medium | GPT-5.5, high |
| 05 | 10, 11, 12 | Sequential dependency chain | GPT-5, high | GPT-5.5, medium | GPT-5.5, high |
| 06 | 13 | Integration checkpoint | GPT-5, high | GPT-5.5, medium | GPT-5.5, high |
| 07 | 14, 17 | Independent behavior, shared exports; implement sequentially | GPT-5, medium | GPT-5.5, medium | GPT-5.5, high |
| 08 | 15, 16 | Integration-heavy; implement sequentially | GPT-5, high | GPT-5.5, high | GPT-5.5, high |
| 09 | 18 | Final migration/docs task | GPT-5 mini, high | GPT-5, medium | GPT-5.5, low |

## Session strategy

- Start a fresh Codex session for each batch.
- Keep tasks inside a batch in the stated order.
- Commit or checkpoint after every task, not only after the whole batch.
- Do not start a batch until all dependency tests from the previous batch pass.
- Batches 07 and 08 may be developed in parallel branches after Batch 06, but both touch central exports and integration code. Expect a manual merge.
- Task 18 must run only after all implementation tasks are merged.

## General validation rule

Each prompt instructs Codex to:
1. inspect the task document and relevant architecture documents;
2. inspect the repository before changing code;
3. keep scope limited;
4. run task-specific focused tests;
5. run relevant package type-checks/tests;
6. run `git diff --check`;
7. report commands actually executed and any deferred issues.
