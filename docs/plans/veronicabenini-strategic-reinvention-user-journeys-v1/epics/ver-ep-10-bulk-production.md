# VER-EP-10 — Bulk production

## VER-090 — Queue bulk episode production

**Priority:** P0  
**Actor:** Operator  
**Journeys:** VJ-09

As an operator, I want to submit many episodes for production so that campaigns can be produced efficiently.

### Acceptance criteria
- Episodes are independent queue units.
- Bulk request has stable identifier.
- Invalid episode input does not prevent valid episodes from queuing.

## VER-091 — Preflight a batch

**Priority:** P0  
**Actor:** Operator  
**Journeys:** VJ-09,VJ-14

As an operator, I want credentials, quotas, policy, and source requirements checked before a batch starts so that predictable failures happen cheaply.

### Acceptance criteria
- Preflight has no unintended paid generation calls.
- Blockers identify affected episodes.
- Operator can proceed with valid subset when policy permits.

## VER-092 — Bound production concurrency

**Priority:** P0  
**Actor:** Administrator  
**Journeys:** VJ-09,VJ-14

As an administrator, I want stage/provider concurrency limits so that bulk production does not overload infrastructure or rate limits.

### Acceptance criteria
- Concurrency is configurable by relevant resource/provider.
- Limits are enforced across workers.
- Queue fairness/starvation behavior is defined.

## VER-093 — Retry failed batch items independently

**Priority:** P0  
**Actor:** Operator  
**Journeys:** VJ-09,VJ-11

As an operator, I want failed episode/stage items retried independently so that successful work is not repeated.

### Acceptance criteria
- Retry target can be episode/stage scoped.
- Successful artifacts remain unchanged.
- Aggregate status reflects partial success.

## VER-094 — Generate aggregate approval pack

**Priority:** P1  
**Actor:** Reviewer  
**Journeys:** VJ-09,VJ-07

As a reviewer, I want an aggregate pack across episodes so that bulk review is efficient without hiding per-episode findings.

### Acceptance criteria
- Aggregate pack preserves per-episode boundaries.
- Blockers/findings can be filtered by episode/severity.
- Approval remains attributable to exact revisions.
