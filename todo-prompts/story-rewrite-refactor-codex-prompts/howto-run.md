# refactor

- done: docs/plans/story-rewrite-repository-analysis-and-baseline-plan.md

1. 5.5 medium
2. /plan
3. paste:

---

Follow only the task defined in:

`story-rewrite-refactor-codex-prompts/02-story-ir-and-artifact-variant-modeling`

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

Exit Plan mode and create only:

docs/plans/story-rewrite-repository-analysis-and-baseline-plan.md

Write the complete approved plan into that file.

Do not implement the plan.
Do not modify production code.
Do not create or update any other files.
Stop immediately after writing the plan file and report the exact file changed.

---

5. codex --model gpt-5.4

---

Implement the approved plan in:

`docs/plans/story-rewrite-repository-analysis-and-baseline-plan.md`

Also read and follow:

`story-rewrite-refactor-codex-prompts/01-repository-analysis-and-baseline.md`

Implement only task 01. Do not start later tasks.

Preserve existing CLI commands, external interfaces, artifact paths, resume behaviour, and `.env` configuration precedence.

Do not issue paid API calls. Prefer existing logs, manifests, persisted responses, fixtures, and deterministic token estimation.

Run the repository’s actual relevant checks and finish with:

- files changed;
- documentation created;
- instrumentation added, if any;
- verification results;
- unresolved findings;
- risks and recommended next task.

Do not implement StoryIR, prompt compiler, generation, localization, repair, or other later-phase production changes.

---
