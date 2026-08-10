# Actors and Personas

## Creator / Channel Owner
Owns the editorial direction of the Veronica Benini genre. Wants to turn ideas or supplied source material into polished videos with minimal production friction while retaining control over final output.

### Goals
- Create episodes quickly.
- Preserve source meaning.
- Reuse valuable source media.
- Produce localized editions cheaply.
- Avoid unnecessary regeneration.
- Maintain consistent genre identity.

## Editor / Reviewer
Evaluates story quality, narration, visual coherence, source usage, translations, and final renders before publication.

### Goals
- Review changes rather than entire pipelines.
- See why an asset or sentence was generated.
- Approve or reject at useful granularity.
- Compare revisions.
- Verify that remediation did not alter approved material unnecessarily.

## Production Operator
Runs individual or bulk production jobs and resolves operational failures.

### Goals
- Start/resume production safely.
- Understand blockers.
- Avoid duplicate expensive work.
- Recover failed stages independently.
- Produce approval packs and delivery artifacts.

## Administrator
Configures providers, genre defaults, policies, budgets, feature flags, and publishing integrations.

### Goals
- Centralize configuration.
- Fail closed when credentials or policy are missing.
- Control costs and provider selection.
- Audit configuration changes.

## Automated Production Agent
Executes bounded production steps, derives decisions from source/episode context, and preserves artifact lineage.

### Goals
- Operate autonomously inside policy.
- Reuse prior outputs whenever valid.
- Escalate ambiguous or unsafe changes to review.
- Produce deterministic machine-readable state.

## API / SaaS Consumer
Integrates episode creation, production, review, localization, rendering, or status retrieval into an external workflow.

### Goals
- Stable typed contracts.
- Idempotent requests.
- Webhook/pollable status.
- Explicit errors.
- Multi-tenant isolation.

## Localization Reviewer
Validates translated narration, captions, embedded text, and culturally sensitive adaptations without forcing visual re-generation.

### Goals
- Review language-specific deltas.
- Preserve shared visual assets.
- Correct translations without rebuilding unaffected stages.

## Viewer
Consumes published 16:9 or 9:16 output.

### Goals
- Clear narration.
- Readable on-screen text.
- Coherent visuals.
- Appropriate pacing.
- Accurate translated presentation.
