# Task index

| Task | Title | Priority | Phase | Dependencies |
| --- | --- | --- | --- | --- |
| YSAAS-001 | Production revision and state | P0 | Foundation | — |
| YSAAS-002 | Capability and configuration registry | P0 | Foundation | 001 |
| YSAAS-003 | Authorization, audit, idempotency, concurrency | P0 | Foundation | 001 |
| YSAAS-004 | Modular contract and runtime seams | P0 | Foundation | — |
| YSAAS-005 | Workflow portfolio and recovery | P0 | Production | 001, 003, 004 |
| YSAAS-006 | Artifact lineage, invalidation, regeneration | P0 | Production | 001–004 |
| YSAAS-007 | Review lifecycle and validity | P0 | Review | 001, 003, 004, 006 |
| YSAAS-008 | Localization derivatives | P1 | Localization | 001–004, 006, 007 |
| YSAAS-009 | Bulk production and localization | P2 | Operations | 002, 003, 005–008 |
| YSAAS-010 | Usage, quotas, provider health | P1 | Operations | 002–004 |
| YSAAS-011 | API credentials and developer journey | P0 | Platform | 003, 004 |
| YSAAS-012 | Webhook management and delivery history | P1 | Platform | 003, 004 |
| YSAAS-013 | Channels and publication preparation | P0 | Publishing | 001–004, 006, 007 |
| YSAAS-014 | Publication execution and recovery | P0 | Publishing | 003, 006, 007, 013 |
| YSAAS-015 | Clone, templates, shared reuse | P1 | Lifecycle | 001–004, 006 |
| YSAAS-016 | Archive, restore, deletion, retention | P1 | Lifecycle | 001, 003, 004, 006, 015 |
| YSAAS-017 | Core production and review frontend | P0 | Frontend | 001, 004–007 |
| YSAAS-018 | Configuration, voice, localization frontend | P1 | Frontend | 002, 004, 008, 010 |
| YSAAS-019 | Bulk operations frontend | P2 | Frontend | 004, 009, 010 |
| YSAAS-020 | Developer and integrations frontend | P1 | Frontend | 004, 011, 012 |
| YSAAS-021 | Publishing frontend | P1 | Frontend | 004, 013, 014 |
| YSAAS-022 | Onboarding, search, action center frontend | P1 | Frontend | 001–007, 013, 015–017 |
| YSAAS-023 | Provider-free acceptance | P0 | Acceptance | 002–013, 017–022 |
| YSAAS-024 | External and publishing acceptance | P1 | Release | 014, 016, 023 + authority |
