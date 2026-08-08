# Internal Content Producer Use Cases

## Operating Boundary

Internal, provider-free production only. Content is planned, produced, reviewed,
and audited in MediaForge; paid generation and publication remain disabled.

## Prioritized Journeys

1. **Editorial planning** — Create a named project for an approved profile and
   use the dashboard to see projects and the next brief to complete.
2. **Briefing a producer-ready episode** — Add a versioned, profile-specific
   brief: historical topic and audience, mathematical skill and grade, Dark
   Truth premise, or Veronica source assets and mode.
3. **Running production safely** — Start work from a pinned brief revision,
   follow durable workflow/job/step status, and explicitly cancel or resume.
4. **Review handoff** — Inspect immutable assets and validation findings, then
   decide an exact hash/revision-bound challenge when one is supplied by the
   workflow. Approval discovery needs a tenant-scoped queue read model.
5. **Operational visibility** — Inspect zero-cost pilot usage and immutable
   audit facts without seeing provider credentials, raw prompts, or paths.
6. **Locale and voice readiness** — See the platform language catalog, the
   narrowly entitled locale per profile, and whether server-managed voice
   selection is available. Never expose consent records or provider settings.

## API Fit And Gaps

Existing project, episode, workflow, asset, validation, approval-challenge,
quota, usage, and audit endpoints power these flows. A cross-project workflow
list, review-queue list, and speech-administration SDK surface are intentionally
not inferred from other data and remain the next API additions.

## Acceptance

- Dashboard and episode board use actual BFF project/episode reads.
- Profile-specific brief forms preserve existing typed API contracts.
- Workflow admission exposes only the profile-entitled pilot locale; the full
  platform catalog remains visible with unentitled languages clearly marked.
- Reviewer handoff uses real project/asset/validation reads and never invents
  an approval queue.
- Every current producer action has a focused BFF test; unavailable queue data
  is stated plainly rather than shown as fabricated content.
