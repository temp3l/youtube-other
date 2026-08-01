# Strategic Reinvention Decision Register

Date: 2026-08-01
Authority: implementation prerequisite for `docs/plans/strategic-reinvention-implementation-plan.md`

Statuses:

- `ACCEPTED_DEFAULT`: implementation may proceed unless the operator changes it before the owning task starts.
- `EVIDENCE_REQUIRED`: implementation may build a fail-closed adapter, but must not claim or enable the capability.
- `BLOCKED`: no implementation may cross the named gate.

| ID     | Decision                                                                                                                                  | Status            | Implementation rule                                                                                                                                             |
| ------ | ----------------------------------------------------------------------------------------------------------------------------------------- | ----------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| SR-001 | Model `strategic-reinvention` as a reusable genre and `veronica-benini` as a separate creator overlay.                                    | ACCEPTED_DEFAULT  | Neither ID may substitute for the other. Generic packages contain no Veronica-specific branches.                                                                |
| SR-002 | Integrate through the canonical workflow engine rather than extending the dry-run stories planner as a second engine.                     | ACCEPTED_DEFAULT  | Add a `strategic-reinvention` content profile and task registrations. Compatibility commands delegate only after parity.                                        |
| SR-003 | Put generic schemas in `domain`, registries/merge logic in `config`, and concrete policy/tasks in a new `packages/strategic-reinvention`. | ACCEPTED_DEFAULT  | Do not create parallel genre, creator-profile, or approvals engines.                                                                                            |
| SR-004 | Add `it` to generic supported locales without changing existing profile defaults.                                                         | ACCEPTED_DEFAULT  | Dark Truth and mathematics target lists remain unchanged unless separately approved.                                                                            |
| SR-005 | Keep original sources separate from adapted scripts.                                                                                      | ACCEPTED_DEFAULT  | Sources live under `sources/`; approved adaptations use `languages/script-<locale>.md` and `languages/short/script-<locale>.md`. Never overwrite a source file. |
| SR-006 | Use read-compatible/write-forward path migration.                                                                                         | ACCEPTED_DEFAULT  | New strategic writes use resolver-selected canonical paths. Legacy paths remain read-only candidates with conflict reporting.                                   |
| SR-007 | Preserve supplied schema `1.0` as an import contract and normalize to internal `1.1`.                                                     | ACCEPTED_DEFAULT  | Internal `1.1` fixes empty beat sources, tier naming, locale typing, and external approval authority without accepting weaker data.                             |
| SR-008 | Keep mutable approval state out of the canonical blueprint.                                                                               | ACCEPTED_DEFAULT  | Blueprint declares required gates/policy IDs; workflow approval records remain authoritative.                                                                   |
| SR-009 | Merge permissions by intersection.                                                                                                        | ACCEPTED_DEFAULT  | System safety and legal/rights are absolute; genre, creator, and episode policy may narrow. Expansion requires a separate explicit grant.                       |
| SR-010 | Treat `status: discovery` as non-production.                                                                                              | BLOCKED           | Publishing, synthetic narration, cloning, and likeness remain disabled until written activation/rights grants are recorded.                                     |
| SR-011 | Require two distinct actors for high-risk approval.                                                                                       | ACCEPTED_DEFAULT  | One creator/editorial approver and one designated risk reviewer; duplicate actor IDs do not satisfy the gate.                                                   |
| SR-012 | Extend existing durable workflow approval records and persistence.                                                                        | ACCEPTED_DEFAULT  | Local and hosted adapters share one domain contract. Legacy episode review is compatibility-only.                                                               |
| SR-013 | Every first-person line and every beat must trace to approved source IDs.                                                                 | ACCEPTED_DEFAULT  | Unsupported first-person, opinion, claim, or advice fails adaptation validation.                                                                                |
| SR-014 | Rights permissions are conjunctive.                                                                                                       | ACCEPTED_DEFAULT  | Rights status, allowed use, AI transformation, locale, commercial use, expiry, access tier, and approval must all permit the operation.                         |
| SR-015 | Public/premium policy fails closed.                                                                                                       | ACCEPTED_DEFAULT  | Premium/private/confidential material cannot produce public or lead-generation output without a separately approved grant.                                      |
| SR-016 | Use independent 16:9 and 9:16 composition plans.                                                                                          | ACCEPTED_DEFAULT  | A crop of the landscape plan is not a valid Short plan.                                                                                                         |
| SR-017 | Synthetic likeness and voice are provider-dispatch gates.                                                                                 | BLOCKED           | Veronica configuration prohibits dispatch unless a separate written grant changes the effective policy.                                                         |
| SR-018 | Build multilingual-audio packaging behind a capability adapter.                                                                           | EVIDENCE_REQUIRED | Unsupported or unknown channel/API capability produces a blocking report; never silently creates separate public videos.                                        |
| SR-019 | Route strategic publishing through the generic approval-bound publisher.                                                                  | ACCEPTED_DEFAULT  | Legacy `uploadYoutubeEpisode` is forbidden for this profile. Ambiguous results require reconciliation before retry.                                             |
| SR-020 | Keep `autoPublish` false.                                                                                                                 | ACCEPTED_DEFAULT  | No CLI, API, workflow, fixture, or override can make publish automatic.                                                                                         |
| SR-021 | Require live offer/CTA catalogue validation.                                                                                              | BLOCKED           | Missing locale destination, campaign ID, boundary, or operator approval blocks publish packaging.                                                               |
| SR-022 | Treat debug content as sensitive.                                                                                                         | ACCEPTED_DEFAULT  | Normal logs contain hashes/IDs only. Content-bearing debug logs are opt-in, access-controlled, and excluded from durable audit events.                          |
| SR-023 | Validate remote-render boundaries strictly before strategic use.                                                                          | BLOCKED           | Require versioned schemas, unique IDs, containment, dependency hashes, typed markers, and configured maximum concurrency.                                       |
| SR-024 | Keep reference-assisted image edit batches disabled.                                                                                      | EVIDENCE_REQUIRED | Enable only after provider request/response semantics are verified and characterized without paid CI calls.                                                     |
| SR-025 | Use mock providers for the pilot.                                                                                                         | ACCEPTED_DEFAULT  | The acceptance fixture performs no paid or irreversible external call.                                                                                          |

## Operator Evidence Still Required

The following evidence is intentionally not inferable from the repository:

1. Written authorization to activate the creator profile.
2. Voice, likeness, adaptation, translation, commercial-use, and publishing grants.
3. Named high-risk reviewer roles and actor identities.
4. Live offer catalogue, locale destinations, campaign IDs, and attribution rules.
5. Target YouTube channel identity and alternate-audio capability evidence.
6. Rights and access classification for each pilot source.

Tasks may implement schemas, blocked states, mock behavior, and dry-run reports before this evidence exists. They may not enable production publication or synthetic creator media.

## Task 00 Evidence Checkpoint

No new operator evidence was supplied for this execution. `SR-010`, `SR-017`, `SR-021`, and `SR-023` remain `BLOCKED`; `SR-018` and `SR-024` remain `EVIDENCE_REQUIRED`. Implementations owned by those decisions must expose only fail-closed states, mock behavior, or dry-run capability reports.

Each decision has exactly one recorded status. Downstream ownership is:

| Decisions | Owning task(s) |
| --------- | -------------- |
| SR-001, SR-003, SR-009 | 03 |
| SR-002 | 09 |
| SR-004, SR-006 | 01 |
| SR-005, SR-007 | 01, 04, 07 |
| SR-008, SR-011, SR-012 | 05 |
| SR-010, SR-019, SR-020 | 10 |
| SR-013 | 04, 07 |
| SR-014 | 04 |
| SR-015 | 04, 07, 10 |
| SR-016 | 06 |
| SR-017 | 03, 06, 08 |
| SR-018 | 08, 10 |
| SR-021 | 08, 10 |
| SR-022, SR-023 | 02 |
| SR-024 | 02, 06 |
| SR-025 | 11 |
