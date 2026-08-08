# YSAAS-008 — Localization derivatives

## Objective
Model and operate locale variants as independent production revisions linked to one root episode.
## Stories covered
US-012–US-015.
## Dependencies
YSAAS-001–YSAAS-004, YSAAS-006, YSAAS-007.
## Existing implementation
Story localization commands, translation utilities, multilingual packages, locale/profile contracts.
## Required changes
- Domain/persistence: root/variant/source linkage, target locale, independent revision, language dependency, localized slug/metadata, reuse links, partial states.
- API/SDK/BFF: create/list/compare/retry and batch-preflight inputs.
- Authorization/audit: source and target authorization; entitlement and reuse audit.
- Tests: source change, localized comparison, reused imagery, localized text/TTS/captions, partial failure and retry.
## Explicit non-goals
Machine-translation provider selection, automatic publication, slug identity, or broad bulk orchestration owned by YSAAS-009.
## File ownership
Localization modules; capability admission belongs to YSAAS-002 and shared assets to YSAAS-006.
## Acceptance criteria
Each locale variant has immutable source linkage and independent revisions; language-independent assets are explicitly reused; validation/review remains locale-specific; unsupported combinations fail preflight.
## Validation
Focused localization/domain/API tests and affected typecheck.
## Completion evidence
Identity examples, reuse/invalidation cases, tests, legacy-localization compatibility.
