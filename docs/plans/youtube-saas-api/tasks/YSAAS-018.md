# YSAAS-018 — Configuration, voice, localization frontend

## Objective
Expose capability-driven production configuration, voice/visual state, and locale-variant journeys.
## Stories covered
US-003–US-004, US-012–US-019, US-024, US-056.
## Dependencies
YSAAS-002, YSAAS-004, YSAAS-008, YSAAS-010.
## Existing implementation
Speech administration renderer, profile-entitlement displays, hard-coded pilot locale/profile mappings.
## Required changes
- Frontend/BFF: inherited/overridden/resolved configuration, genre defaults, voice preview/assignment/consent, visual profile lock/reuse, locale admission, localization management/comparison.
- Show provider health/fallback and affected future revisions; never render credentials.
- Use approved comparison modes and WCAG 2.2 AA.
- Tests: unsupported capability, revoked voice, explicit fallback, source/localized comparison, stale config, reset-to-inherited.
## Explicit non-goals
Capability calculation in UI, legal sufficiency claims, provider-specific secret forms, or bulk UI owned by YSAAS-019.
## File ownership
Configuration/speech/localization page modules only.
## Acceptance criteria
Every selectable option comes from server capabilities; inherited and overridden values are distinct; consent revocation blocks future generation; localized/source evidence remains clear.
## Validation
Focused BFF/page/accessibility tests and web typecheck.
## Completion evidence
Pages/states, removed UI mappings, redaction/accessibility results, tests, remaining provider limitations.
