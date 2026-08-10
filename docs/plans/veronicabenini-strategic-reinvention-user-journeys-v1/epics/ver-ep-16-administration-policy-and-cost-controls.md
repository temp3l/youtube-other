# VER-EP-16 — Administration, policy, and cost controls

## VER-150 — Configure providers

**Priority:** P0  
**Actor:** Administrator  
**Journeys:** VJ-14

As an administrator, I want provider credentials and defaults configured centrally so that production behavior is controlled.

### Acceptance criteria
- Secrets are stored securely and never returned in plaintext.
- Effective provider configuration can be preflighted.
- Changes are audited.

## VER-151 — Configure cost budgets

**Priority:** P0  
**Actor:** Administrator  
**Journeys:** VJ-09,VJ-14

As an administrator, I want cost ceilings and paid-step policies so that agentic production cannot spend without bounds.

### Acceptance criteria
- Budget can block/require approval before cost-bearing steps.
- Estimated/actual usage is recorded where available.
- Exceeded budget fails safely without corrupting run state.

## VER-152 — Configure approval policies

**Priority:** P0  
**Actor:** Administrator  
**Journeys:** VJ-04,VJ-07,VJ-14

As an administrator, I want approval gates configurable by stage/risk so that production can balance autonomy and control.

### Acceptance criteria
- Policy is versioned.
- Effective policy captured by run.
- Policy changes do not retroactively approve old output.

## VER-153 — Configure feature flags

**Priority:** P1  
**Actor:** Administrator  
**Journeys:** VJ-14

As an administrator, I want new production features gated so that they can be rolled out safely.

### Acceptance criteria
- Flags are evaluated in server-side policy.
- Run records relevant flag state/version.
- Disabling feature has defined behavior for in-flight runs.

## VER-154 — Fail closed on missing required configuration

**Priority:** P0  
**Actor:** Operator  
**Journeys:** VJ-09,VJ-11,VJ-14

As an operator, I want production preflight to fail closed when required credentials/configuration are missing so that the system does not enter a partially invalid run.

### Acceptance criteria
- Missing configuration is detected before dependent paid work.
- Error names exact configuration class without exposing secret value.
- Retry after correction reuses valid preflight/source work.
