# Parallel execution

## Ownership rules

YSAAS-001 is sole owner of canonical `ProductionRevision`, production-state
schemas, and migration registration. YSAAS-004 is sole owner of shared OpenAPI,
SDK-operation, BFF-route, and page registries. Later tasks edit only their
pre-registered domain modules; registry changes are integrated by those owners
at wave boundaries.

## Waves

```text
Wave 0
├── YSAAS-001
└── YSAAS-004

Wave 1
├── YSAAS-002
└── YSAAS-003

Wave 2
├── YSAAS-005
├── YSAAS-006
├── YSAAS-010
├── YSAAS-011
├── YSAAS-012
└── YSAAS-015

Wave 3
├── YSAAS-007
└── YSAAS-016

Wave 4
├── YSAAS-008
└── YSAAS-013

Wave 5
├── YSAAS-009
├── YSAAS-014
├── YSAAS-017
├── YSAAS-018
└── YSAAS-020

Wave 6
├── YSAAS-019
├── YSAAS-021
└── YSAAS-022

Wave 7
YSAAS-023

Wave 8
YSAAS-024
```

Wave-parallel tasks are safe only after the prior wave's registry integration
commit. Any task that discovers it must change another task's owned canonical
contract stops and reports the dependency instead of editing it.

## Conflict-prone areas

- `apps/api/src/contract.ts`, `packages/api-sdk/src/v1-contract.ts`,
  `apps/web/src/saas-runtime.ts`, and `apps/web/src/saas-api-bff.ts` remain
  exclusive to YSAAS-004 until modular ownership exists.
- Production migration registries remain exclusive to YSAAS-001.
- Publication intent/execution is owned only by YSAAS-013/014; no other task may
  introduce a publishing command.
