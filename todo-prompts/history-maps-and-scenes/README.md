# History YouTube Success — Codex Prompt Pack

This pack continues after the two visual-planning and rendering prompts.

## Run order

1. `03-history-editorial-research.md`
2. `04-history-retention-audio.md`
3. `05-history-packaging-publishing.md`
4. `06-history-analytics-localization.md`

Run each prompt in a fresh Codex session from the repository root and commit after each completed goal.

## Token-conscious settings

```toml
model = "gpt-5.6-terra"
model_reasoning_effort = "high"
model_verbosity = "low"

[agents]
enabled = true
max_concurrent_threads_per_session = 1
```

Use normal/goal mode rather than a separate plan-only run. Escalate to Sol only for a focused review or unresolved architectural/test failure.

## Priority under limited allowance

1. Goal 3: topic selection and research integrity
2. Goal 4: retention and narration/audio quality
3. Goal 5: packaging and publishing
4. Goal 6: analytics and localization

Goal 6 is most valuable after several videos have accumulated useful analytics.

## Invocation

Paste one prompt into Codex, or place it under `prompts/` and instruct Codex:

> Implement this prompt completely. Reuse existing abstractions, keep all changes history-profile gated, run the required tests, and continue until the completion criteria are satisfied.
