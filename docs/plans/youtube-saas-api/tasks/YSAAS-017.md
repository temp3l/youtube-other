# YSAAS-017 — Core production and review frontend

## Objective
Deliver the producer/reviewer workspace from canonical state, workflow, artifact, gate, and review contracts.
## Stories covered
US-001–US-002, US-006–US-011, US-025–US-029, US-059, US-061–US-062.
## Dependencies
YSAAS-001, YSAAS-004–YSAAS-007.
## Existing implementation
Server-rendered project/brief/run pages, asset/validation views, exact approval controls, navigation and 412 feedback.
## Required changes
- Frontend/BFF: episode workspace, queue filters, run timeline/recovery, artifact browser/comparison, invalidation confirmation, gate explanation, review queue/submission/history.
- Consume `EpisodeProductionState`; do not join jobs/files/directories or encode capability rules.
- Preserve unsaved input on conflicts where practical; reload/reapply deliberately.
- Accessibility: WCAG 2.2 AA, keyboard/focus/live states and media alternatives.
- Tests: loading/empty/error/stale/forbidden/concurrent decision/destructive confirmation.
## Explicit non-goals
Domain rules, automatic merges, raw logs, advanced waveform/frame comparison, or email/push.
## File ownership
Core production/review page modules and gateway adapters registered by YSAAS-004.
## Acceptance criteria
Users can answer current state, blocker, evidence, required action, and review validity without internal IDs or inferred mappings; all mutations use server preconditions.
## Validation
Focused page/BFF/accessibility tests and web typecheck.
## Completion evidence
Routes/states, accessibility checks, conflict/recovery cases, tests, known UX limitations.
