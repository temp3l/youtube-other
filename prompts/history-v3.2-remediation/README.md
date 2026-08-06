# History Approval Packs V3.2 — Codex Runbook

This prompt pack converts the V3.1 rejection report into an implementation and verification workflow for Codex.

## Recommended execution strategy

Use the **master goal in one Codex session** when your context and allowance permit it. The phase prompts are recovery checkpoints: use them only when you intentionally split the work, resume after interruption, or need to constrain token consumption.

Do not run the regeneration prompt before the implementation milestones and their tests pass.

## Prerequisites

1. Start from the repository root containing the History planner, schemas, CLI integration, episode fixtures, and tests.
2. Ensure the working tree is clean or create a checkpoint commit.
3. Extract this folder into the repository, preferably at:

   ```text
   prompts/history-v3.2-remediation/
   ```

4. Confirm that the existing V3.1 implementation and the three canonical episodes are available:
   - Napoleon’s Invasion of Russia
   - Fall of the Roman Empire
   - Black Death
5. Keep `references/history-approval-packs-v3.1-review-report.md` unchanged. It is an authoritative acceptance input.

## Recommended Codex configuration

For the main implementation session:

- model: `gpt-5.6-sol`
- reasoning: `high`
- verbosity: `low` or `medium`
- approval policy: `on-request`
- sandbox: workspace write
- network: enable only when needed for source research or dependency documentation
- subagents: enabled; use them for isolated analysis and verification, not competing edits to the same contracts

A lower-cost worker model is suitable for repository discovery, test inventory, repetitive fixture inspection, and packaging checks. Keep architecture, provenance policy, approval gates, and final integration on the strongest model.

## Preferred one-session workflow

From the repository root:

```bash
codex
```

Inside Codex:

1. Run `/status` and confirm the repository root, model, permissions, and loaded `AGENTS.md` instructions.
2. Select `gpt-5.6-sol` with high reasoning using `/model` if needed.
3. Enter Plan mode using `/plan` or `Shift+Tab`.
4. Submit:

   ```text
   Read prompts/history-v3.2-remediation/01-history-v3.2-master-goal.md and
   prompts/history-v3.2-remediation/references/history-approval-packs-v3.1-review-report.md. Treat them as the
   authoritative goal and acceptance contract. Inspect the repository deeply,
   create the required durable plan/status artifacts, and produce a milestone
   plan. Do not modify production code while still in Plan mode.
   ```

5. Review the proposed plan. It must preserve the order and gates in the master goal. In particular, it must not regenerate bundles before timing, provenance, map/diagram semantics, status reporting, and tests are corrected.
6. Exit Plan mode and submit:

   ```text
   Pursue the approved History V3.2 goal end-to-end. Follow the repository plan
   and status artifacts milestone by milestone. Run each milestone's validation,
   repair failures before continuing, keep changes scoped, and do not declare
   completion until every required acceptance check has evidence.
   ```

7. Let the main session own integration. Steering is appropriate when it attempts to:
   - classify the Math regression as unrelated without evidence;
   - let an LLM assign authoritative source status;
   - force weak diagrams instead of rejecting them;
   - regenerate before implementation gates pass;
   - report a green result while blockers remain;
   - change unrelated genre defaults.

## Staged workflow

Use this sequence when splitting the work across sessions:

1. `02-history-v3.2-baseline-and-contracts.md`
2. `03-history-v3.2-timing-engine.md`
3. `04-history-v3.2-claim-provenance.md`
4. `05-history-v3.2-visual-semantics-and-quality.md`
5. `06-history-v3.2-regeneration-and-verification.md`
6. `07-history-v3.2-independent-review.md` in a **fresh review-only session**

For each implementation phase:

1. Start Codex from the same repository root.
2. Tell it to read the master goal, review report, current plan/status files, and the selected phase prompt.
3. Require it to continue from repository evidence rather than trusting prior chat summaries.
4. Do not start the next phase until the current phase's validations pass or the status file records a concrete blocker.

Suggested kickoff text:

```text
Read prompts/history-v3.2-remediation/01-history-v3.2-master-goal.md,
prompts/history-v3.2-remediation/<PHASE-FILE>.md,
prompts/history-v3.2-remediation/references/history-approval-packs-v3.1-review-report.md,
and the current V3.2 plan/status/decision artifacts in the repository. Execute
only the selected phase, including implementation, tests, documentation, and
verification evidence. Fix failures before declaring the phase complete.
```

## Resuming an interrupted session

Use `08-history-v3.2-resume.md`. Codex must inspect Git state and durable status artifacts before continuing. Do not rely only on the previous conversation transcript.

## Independent review

Run `07-history-v3.2-independent-review.md` in a fresh Codex session after regeneration. Prefer the strongest review model and high or extra-high reasoning. The reviewer must not modify the working tree.

You can also invoke `/review` for the resulting commit or uncommitted changes, but the supplied review prompt remains necessary because it includes domain-specific approval-pack acceptance gates.

## Expected durable repository artifacts

The implementation goal requires Codex to create or update durable files such as:

```text
docs/history-v3.2/PLAN.md
docs/history-v3.2/STATUS.md
docs/history-v3.2/DECISIONS.md
docs/history-v3.2/VERIFICATION.md
```

Equivalent repository-conventional paths are acceptable. These files are the source of truth for resumption and audit.

## Completion standard

Completion means more than build success. The final state must include:

- corrected deterministic behavior;
- focused and regression tests;
- all three regenerated V3.2 approval packs;
- individual and combined ZIPs;
- deterministic regeneration evidence;
- checksum, redaction, schema, reference, and approval-gate verification;
- an independently reproducible final report;
- no false-green status surfaces;
- no approval eligibility while material provenance is unresolved;
- no production approval based only on provisional narration timing.
