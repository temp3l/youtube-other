# YouTube SaaS/API implementation plan

## Purpose

This directory turns the canonical product specifications in
`docs/product/youtube-saas-user-journeys/` into bounded implementation work. It
is an implementation plan, not implementation code, an estimate, or permission
to enable external effects.

Use `task-index.md` to select work, `dependency-graph.md` and
`parallel-execution.md` to sequence it, the matching file under `tasks/` as the
session brief, and `story-task-matrix.md` to verify product coverage. Shared
decisions live only in `architecture-decisions.md`.

## Status and authority

The plan contains 24 tasks: 12 P0, 10 P1, and 2 P2. The product decisions
supplied with this planning pass are authoritative. Where they conflict with
the existing accepted operations ADR, the plan preserves current fail-closed
behavior while adding the future capability behind a default-off feature flag.

No task authorizes paid providers, live OAuth, customer data, or YouTube
mutation. Those actions require task-specific authority and the acceptance
gates in YSAAS-024.

## Implementation-session rules

- Inspect the named evidence before editing and preserve unrelated worktree changes.
- Keep one task per implementation session/commit and create the required reports.
- Use focused tests first, at most three distinct test commands, and at most one
  affected-package typecheck unless broad verification is explicitly authorized.
- Do not create frontend workflow logic, expose secrets, weaken tenant isolation,
  or infer state from filenames, directories, or UI-local mappings.
