# Cursor Agentic Multi-Agent Kickoff Prompt

Read and execute all Markdown files in:

```text
prompts/veronica-media-integration-agentic-goal-v2/
```

If this pack is located elsewhere, use its actual path.

Treat `00-agentic-goal.md` as the governing product goal.

Treat the remaining files as mandatory concurrency, planning, implementation, and acceptance guidance.

## Execution mode

Work in agentic goal mode.

Use multiple agents and parallel execution where safe.

Before implementation:

1. inspect repository structure
2. inspect Git/worktree state
3. detect dirty files and external changes
4. audit recent history-channel visual-plan enhancements
5. separate generic reusable infrastructure from history-specific behavior
6. create a dependency-aware task graph
7. assign disjoint file ownership to workers
8. add characterization tests for any shared behavior that may be modified

## Critical concurrent-session constraint

Another Cursor session may be editing history at the same time.

Assume the worktree can change externally.

Do NOT:

- reset
- clean
- stash
- revert
- overwrite
- force-checkout
- auto-resolve by discarding

changes you did not create.

If a required shared file is being edited externally:

1. record the collision
2. avoid modifying that file
3. continue independent implementation
4. use an additive adapter or Veronica-owned module when safe
5. defer only the minimum shared integration step
6. document exact follow-up merge work

Do not block the whole goal because one shared integration point is temporarily unavailable.

## Parallelization

Parallelize independent tasks such as:

- contracts
- secure media ingestion
- narration/media planning
- localization/redesign
- portrait/landscape preparation
- FFmpeg DSL/compiler
- cache/regeneration graph
- approval pack
- metrics
- tests/docs

Do not run two workers against the same file or shared contract simultaneously.

The coordinator owns cross-cutting contract decisions.

## Engineering behavior

- inspect existing implementations before creating abstractions
- reuse generic history infrastructure only when stable and truly generic
- never import history-specific map/chronology/entity semantics into Veronica
- prefer additive opt-in changes
- preserve all existing genre defaults
- use strict TypeScript + runtime validation
- use deterministic manifests and hashes
- keep expensive stages resumable
- enforce hard approval eligibility
- resolve final timing after TTS alignment
- generate independent 16:9 and 9:16 plans
- use FFmpeg as a deterministic compositor, not a document-layout engine

## Validation

Use focused validation per worker/task.

Do not repeatedly run the complete repository test/build suite.

Escalate to broad validation only when:

- shared contracts changed
- cross-package risk requires it
- final acceptance requires it

## Autonomy

Continue through:

```text
audit
→ plan
→ parallel implementation
→ focused validation
→ integration
→ end-to-end fixtures
→ independent review
→ final acceptance report
```

without asking for routine confirmation.

Pause only for:

- destructive operations
- unavailable required credentials with no local substitute
- irreversible migrations
- a material product decision that cannot safely be inferred
- an unavoidable shared-file conflict that blocks all meaningful progress

At completion provide:

- implementation summary
- task/agent results
- exact validation performed
- generated fixture artifacts
- acceptance verdict
- remaining risks
- `MERGE-STATUS.md` describing interactions with the concurrent history session
