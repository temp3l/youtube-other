# Task 16: Pilot And GA Acceptance

## Objective

Make release scope evidence-based and prevent unsupported capability claims.

## Pilot Gate

- approved education capability matrix passes provider-free end to end and controlled provider smoke tests
- OIDC, tenancy, object storage, webhooks, quotas, audit, restore, rotation, and incident runbooks pass
- publication fault injection proves one video or reconciliation-required
- API/SDK compatibility policy and numeric pilot limits are approved

## GA Gate

- every entitled Dark Truth and education locale/variant/preset cell has parity evidence
- load, soak, queue recovery, backup/restore, retention/deletion, webhook chaos, and publication reconciliation pass
- SLO, RPO/RTO, deprecation window, support, and operational ownership are approved

## Verification

Run only the focused suites named by the completed tasks, then one explicitly authorized release-validation pass. Do not regenerate broad fixtures or snapshots.

## Acceptance Criteria

Release documentation advertises only proven matrix cells, failed gates keep the system internal or pilot-limited, and unresolved provider ambiguity cannot be waived into automatic retry.
