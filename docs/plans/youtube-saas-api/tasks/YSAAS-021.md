# YSAAS-021 — Publishing frontend

## Objective
Deliver channel, preparation, scheduling, execution, recovery, and post-publication UX while respecting the platform flag.
## Stories covered
US-030–US-037, US-057, US-061–US-062.
## Dependencies
YSAAS-004, YSAAS-013, YSAAS-014.
## Existing implementation
Publication read model and disabled integrations/publication UI; no channel/OAuth or publish mutation controls.
## Required changes
- Frontend/BFF: channel connect/disconnect/reauthorize; metadata/thumbnail/captions/visibility/schedule; preflight; explicit publish confirmation; progress/recovery; metadata-only update.
- Hide/disable execution when flag, OAuth, horizon, policy, approval, or gate is unavailable and explain the reason.
- Display timezone/instant and provider constraints from server decisions.
- Tests: flag off, stale intent, DST/provider restriction, expired OAuth, timeout/reconciliation, retry without regeneration, WCAG 2.2 AA.
## Explicit non-goals
Browser tokens, client-side provider rules, public-first defaults, unbounded retry, or automatic reconciliation guesses.
## File ownership
Publishing page/BFF modules only; domain execution remains YSAAS-014.
## Acceptance criteria
The exact revision/intent/channel/visibility is confirmed; flag-off has no executable control; failures offer publication-only safe recovery; published state binds video identity to source evidence.
## Validation
Focused BFF/page/accessibility tests and web typecheck; no live mutation.
## Completion evidence
Flag/gate state matrix, schedule/recovery cases, tests, enablement requirements.
