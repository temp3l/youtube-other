# Prompt Templates

This directory holds reusable prompt templates for token-efficient Codex work.

Use the smallest template that fits the task:

- `codex-code.prompt.md` for code changes and debugging
- `codex-video.prompt.md` for script, scene, and render work
- `codex-review.prompt.md` for reviews, audits, and bug finding

Guidelines:

- keep the source of truth outside the prompt when possible
- pass file paths, scene IDs, and short excerpts instead of full dumps
- ask for diffs or patch-only output unless a full artifact is required
- split planning, implementation, and verification into separate turns
