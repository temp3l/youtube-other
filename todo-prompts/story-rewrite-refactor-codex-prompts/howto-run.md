codex resume 019f143b-598d-73a3-8c9f-c52b689814e5

# refactor

- done: docs/plans/story-rewrite-repository-analysis-and-baseline-plan.md
- done: docs/plans/story-ir-and-artifact-variant-modeling-plan.md

1. 5.5 medium
2. /plan
3. paste:

---

Follow only the task defined in:

`todo-prompts/story-rewrite-refactor-codex-prompts/03-source-cleaning-and-provenance.md`

Read that file completely and treat it as the authoritative task specification.

Inspect the repository first and produce a repository-grounded plan. Do not modify files while still in Plan mode.

Do not start, partially implement, or prepare later tasks from the task pack.

Preserve existing CLI commands, external interfaces, artifact compatibility, directory conventions, resume behaviour, and `.env` configuration precedence.

This task is primarily analysis, documentation, baseline measurement, and any strictly non-invasive instrumentation explicitly permitted by the task specification. Do not begin the production refactor.

Do not issue unnecessary paid API calls. Prefer existing logs, manifests, persisted responses, fixtures, and deterministic token estimation.

Your plan must identify:

- the exact files and packages involved;
- the current full-story call graph;
- the current short-story call graph;
- model and configuration routing;
- prompt builders and duplicated prompt sections;
- validation, repair, retry, cost, persistence, and resume behaviour;
- concrete documentation files to create or update;
- any minimal instrumentation proposed;
- exact verification commands that actually exist in the repository;
- risks and uncertainties.

After I approve the plan, implement only this task, run the relevant checks, and update the task documentation before finishing.

3. No, stay in Plan mode

4. Shift + Tab

---

Create the plans under: ./docs/plans

Copy the complete approved plans into that folder.

Do not implement the plans.
Do not modify production code.
Do not create or update any other files.
Stop after writing the plan files.

---

5. codex --model gpt-5.4

---

ask codex for a prompt

---

## https://chatgpt.com/g/g-p-6a317d326e30819183556eca604b770c-youtube/c/6a420672-1554-83ed-922a-9f5aa3075447

### Batches

I defined these batches the tasks in from todo-prompts/story-rewrite-refactor-codex-prompts:

- Planning batch 1: StoryIR, artifact variants, source cleaning, genre policies
- Planning batch 2: full generation, localization, short adaptation and generation
- Planning batch 3: validation, repair, incomplete responses, retries
- Planning batch 4: metadata, audio, scenes, rendering
- Planning batch 5: costs, persistence, resume, tests, migration

find the relevant tasks and provide me a prompt to plan all tasks of batch 2
write the prompt to todo-prompts/story-rewrite-refactor-codex-prompts/batches/planning-batch-2.md" make it "strictly planning-only" and opinionated with exact instructions

## Prompt for Batch 1 GPT-5.5 in PLAN MODE

---

Plan the remaining work for batch 1 only. Assume prompts 01 and 02 are already complete. Do not implement yet.

Scope:

- remaining batch-1 work from:
  - `todo-prompts/story-rewrite-refactor-codex-prompts/03-source-cleaning-and-provenance.md`
  - `todo-prompts/story-rewrite-refactor-codex-prompts/04-genre-policies-and-full-story-contract.md`

Repo rules:

- inspect source first
- ignore root `README.md`
- ignore `docs.bak`
- use targeted reads and `rg`
- treat source as authoritative
- preserve public CLI/artifact compatibility unless a required change is justified
- no paid API calls
- no code edits

What to do:

1. inspect the current code in `packages/story-localization`, `apps/cli`, and any directly relevant shared/config modules
2. determine what is already done vs missing for:
   - deterministic source cleaning and provenance
   - centralized genre policies
   - compact full-story contract boundaries
3. produce a repo-grounded plan for the remaining unfinished work only

Output:

- `Current state`: what already exists, with exact files/functions/types
- `Gaps`: what is still missing or insufficient
- `Remaining tasks`: ordered plan with likely files, dependencies, validation, and compatibility risks
- `Decision points`: any architecture choices to settle before implementation
- `Done criteria`: map remaining work to prompts 03 and 04 acceptance criteria

Important:

- keep scope limited to batch 1
- do not plan batch 2+ except for brief downstream impact notes
- explicitly state whether source cleaning is deterministic, versioned, and provenance-preserving today
- explicitly state whether genre policy is centralized or scattered today
- explicitly state whether the full-story contract is separated from metadata/audio/scene/image/render/publication concerns today
- assume StoryIR and artifact variant modeling from 02 already exists
- focus on the delta from that baseline

---
