# Task: Final Cross-Cutting Audit

This is an audit-first prompt. Do not implement fixes until the audit identifies exact issues and a plan is approved.

## Audit Areas

Verify:

- every prompt references existing repository concepts or instructs discovery;
- full and short stories are first-class variants;
- every paid generation stage has preflight, validation, cost, persistence, and resume coverage;
- full and short lineage is unambiguous;
- localized shorts derive from matching validated localized full story;
- no narration model receives metadata, audio, visual, rendering, publishing, diagnostics, or repair history;
- full stories cannot enter short model routes;
- short stories cannot enter full regeneration routes accidentally;
- task dependencies are ordered correctly;
- acceptance criteria are testable;
- README matches actual prompt filenames and order;
- Portuguese remains `pt-BR`;
- French support is intentionally preserved or explicitly migrated.

## Required Measurements

Report:

- prompt size reduction or section-token estimates;
- failed-call cost behavior;
- retry and regeneration counts by variant;
- cache hit/miss behavior by variant;
- validation coverage by issue code;
- unresolved risks.

## Required Output

Create a final audit report with:

- findings ordered by severity;
- exact file references;
- commands/tests run;
- unresolved repository questions;
- recommended follow-up tasks.

## Acceptance Criteria

- Audit proves the refactor satisfies `master-specification.md` and the updated task pack.
- No critical full/short lineage or routing defect remains.
- Any remaining issue has a concrete follow-up owner and test.
