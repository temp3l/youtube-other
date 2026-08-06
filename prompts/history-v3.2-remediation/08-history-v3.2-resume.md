# Resume Goal — Continue History Approval Packs V3.2 Safely

Resume the History Approval Packs V3.2 remediation from repository state, not from conversation memory.

## Required startup sequence

1. Read all applicable `AGENTS.md` instructions.
2. Read:
   - `prompts/history-v3.2-remediation/01-history-v3.2-master-goal.md`
   - `prompts/history-v3.2-remediation/references/history-approval-packs-v3.1-review-report.md`
   - current `PLAN.md`, `STATUS.md`, `DECISIONS.md`, and `VERIFICATION.md`
3. Inspect:
   - current branch and commit SHA;
   - `git status` and diff;
   - recent relevant commits;
   - generated/untracked files;
   - last recorded validation commands and outputs.
4. Reconcile repository reality with `STATUS.md`. Correct stale status before implementation.
5. Identify the first incomplete milestone whose prerequisites are satisfied.
6. Re-run the narrow validations needed to establish a trustworthy starting point.
7. Continue that milestone only.

## Operating rules

- Follow the master goal’s milestone order and stop-and-fix rules.
- Do not regenerate bundles before implementation gates pass.
- Do not trust prior claims of passing tests without current evidence.
- Do not classify regressions as unrelated without baseline proof.
- Do not fabricate provenance or allow model-generated status to bypass policy.
- Keep non-History behavior unchanged and characterized.
- Update durable status, decisions, and verification evidence as work proceeds.

At the end of the turn, report:

- repository state found;
- reconciled milestone status;
- changes made;
- commands and results;
- next incomplete action;
- any real blocker.
