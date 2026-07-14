# M2-011: Independently accept the private Class 5 mathematics rollout

Perform an adversarial, implementation-independent acceptance review of the completed
German Class 5 private batch and its production path. Do not repair production code in this
review. Do not run paid providers, render new production media, or publish anything.

## Independence

Use a fresh isolated reviewer context if available. Give the reviewer the acceptance
contract, current repository, refreshed audit/backlog, task reports, and batch workspace,
but not implementation reasoning or intended fixes. The reviewer must have no permission
to change production source. If isolation is unavailable, label the result `ADVERSARIAL
SELF_REVIEW`; never call it independent acceptance.

## Scope

Review M2-001 through M2-010 and verify claims from source, executable behavior, and actual
artifacts rather than report text. Preserve the dirty worktree.

At minimum, inspect:

- all historical finding dispositions in the refreshed audit;
- canonical workflow ownership and absence of parallel production state machines;
- reviewed release/provenance/DAG evidence for exactly 37 Class 5 skills;
- lesson specification and verifier v3 coverage for every skill;
- fact locks across narration, visuals, solutions, metadata, and thumbnails;
- provider authorization, request identity, cache, cost, redaction, and telemetry;
- artifact containment, lineage, hashes, promotion, invalidation, resume, and batch isolation;
- German speech, measured timing, accessibility, visual semantics, final media, and quality;
- private-only metadata and zero-mutation publish dry-runs;
- packaged CLI and story/horror compatibility;
- absence of secrets or generated production media in tracked changes.

## Sampling and full checks

Validate manifest and binary integrity for all 37 items programmatically without changing
them. Deep-review at least the three pilot lessons plus one fraction/decimal lesson, one
geometry/measurement lesson not in the pilot, and `M5-DZ-002`. Select samples deterministically
and record them.

Attack the system with copied artifacts across lessons, locales, releases, and stages;
recomputed self-consistent hashes; stale profile/verifier/renderer versions; missing and
duplicate facts; altered answers; invalid media bytes; symlink/path escape; interrupted
state; forged approval; provider count mismatch; placeholder artwork marked publish-ready;
and any legacy command that can bypass the canonical operator.

Use at most three focused test commands under `AGENTS.md`. Static artifact validation and
read-only local probes may be additional non-test checks. Do not run broad repository gates
unless the user separately authorizes them.

## Verdict rules

Return `ACCEPT` only if:

- all 37 canonical items are complete, valid, private, and reproducible;
- no Critical or High implementation/content defect remains;
- every mathematical and visual claim is bound to independent verifier evidence;
- resume/cache/batch/provider evidence is truthful;
- public upload is impossible from this task pack;
- allowed public-release blockers, such as placeholder artwork and absent live-channel
  approval, remain explicit and fail closed.

Otherwise return `REJECT` with findings ordered by severity, exact evidence, owning module,
and the smallest repair task. Do not generate a vague follow-up prompt.

## Outputs

Create a dated acceptance report under `docs/mathe/audits/`, update
`docs/mathe/audits/remediation-backlog-v2.md` truthfully, and create the required Codex-run
report. Include the verdict, reviewer-independence level, commit/worktree baseline, commands,
artifact checks, finding list, accepted limitations, public-release blockers, and next step.
Do not commit unless explicitly requested.
