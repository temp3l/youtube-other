# YSAAS-016 — Archive, restore, deletion, retention

## Objective
Implement reversible archival and retention-aware destructive lifecycle operations.
## Stories covered
US-051–US-054.
## Dependencies
YSAAS-001, YSAAS-003, YSAAS-004, YSAAS-006, YSAAS-015.
## Existing implementation
Retention decisions, object storage, immutable audit/workflow/approval records, asset reference concepts; no episode archive model.
## Required changes
- Domain/persistence: archive state, restore transition, deletion evaluation/request, tombstones, category retention, shared references and publication implications.
- API/SDK/BFF: archive/restore/evaluate-delete/delete and effective retention reads.
- Authorization/audit: owner/admin destructive policy, confirmation/step-up hook, immutable request/result.
- Tests: active workflow, shared asset, published episode, retention hold, repeated request, restore after archive/purge.
## Explicit non-goals
Inventing legal requirements, immediate hard-delete by default, deleting published YouTube videos, or broad cleanup jobs beyond configured policy.
## File ownership
Lifecycle/retention modules; shared reference graph belongs to YSAAS-015/006.
## Acceptance criteria
Archive leaves lineage intact; restore starts no workflow; deletion cannot remove referenced/protected evidence; unknown retention fails closed; audit survives content deletion per policy.
## Validation
Focused lifecycle/retention/object-storage tests and typecheck.
## Completion evidence
Retention categories, transition matrix, deletion/restore cases, tests, operational risks.
