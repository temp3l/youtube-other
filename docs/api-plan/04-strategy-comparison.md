# Architecture Strategy Comparison

Scores: 1 poor to 5 strong. For migration cost and operational complexity, 5 means lower cost/complexity.

| Strategy                          | Type safety | Reliability | Testability | Security | Observability | Cancel | Retry/resume | Concurrency | Migration cost | Ops complexity | Maintainability | Total / 55 |
| --------------------------------- | ----------: | ----------: | ----------: | -------: | ------------: | -----: | -----------: | ----------: | -------------: | -------------: | --------------: | ---------: |
| API invokes CLI subprocesses      |           1 |           2 |           2 |        1 |             2 |      2 |            2 |           2 |              5 |              3 |               1 |         23 |
| API invokes low-level packages    |           3 |           2 |           3 |        2 |             3 |      3 |            2 |           3 |              3 |              4 |               2 |         30 |
| shared application/workflow layer |           5 |           4 |           5 |        4 |             4 |      4 |            4 |           4 |              3 |              4 |               5 |         46 |
| separate workflow-control service |           5 |           5 |           5 |        4 |             5 |      5 |            5 |           5 |              1 |              1 |               4 |         45 |

## Debate

1. **CLI subprocesses:** **Verified** wrappers already exist in story audio/images. **Inferred:** translating requests to argv/stdout preserves CLI ownership, inherits environment/local paths, weakens typing and cancellation, and expands injection risk. **Recommended:** operator-only transitional adapter, never target or public syntax.
2. **Direct low-level packages:** **Verified:** packages expose useful services. **Inferred:** controllers would reconstruct CLI composition and create the prohibited second pipeline. Useful only inside extracted use cases.
3. **Shared layer:** **Verified:** the generic workflow operator and canonical math bindings prove viability. **Recommended:** target and migration path.
4. **Separate service:** reliable after normalization, but **Inferred:** premature while state/assets/composition are local. **Recommended:** preserve clean ports so it is a later deployment choice, not a new domain implementation.

## Decision

Adopt strategy 3 as a modular monolith with separate process roles. Re-evaluate strategy 4 only after database/object-store authority, tenant context, stable workflow commands, leases, and operational evidence exist.
