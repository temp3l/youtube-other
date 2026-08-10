# VJ-14 — Administer Genre Configuration and Providers

## Primary actor
Administrator

## Main flow
1. Admin opens Veronica genre settings.
2. Admin configures default LLM, image, TTS, translation, storage, rendering, and publishing providers.
3. Admin configures per-language voices and optional per-genre overrides.
4. Admin defines concurrency, retry, budget, fallback, and approval policies.
5. Changes are versioned and auditable.
6. New production runs capture the effective configuration version.
7. Existing approved revisions are not retroactively changed.
8. Missing required secrets/configuration fail closed during preflight.

## Success outcome
Operations remain reproducible even as provider or genre configuration evolves.
