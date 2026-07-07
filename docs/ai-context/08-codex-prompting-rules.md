# AI Context: Codex Prompting Rules

## Prompt Structure

Ask Codex to:

1. Inspect `AGENTS.md` and `docs/ai-context/context-pack.md`.
2. Inspect exact plan/source/test files named in the task.
3. State current dirty-tree assumptions.
4. Make a narrowly scoped change.
5. Run focused verification only.
6. Create `docs/reports/codex-runs/YYYY-MM-DD-<task>.md`.
7. Summarize changed files, tests, results, and risks.

## Use Plan Mode When

- Designing multi-step architecture.
- Splitting work across several future Codex prompts.
- Deciding task order or parallelization.
- Evaluating provider/API risk before implementation.

## Do Not Use Plan Mode When

- Making a focused implementation from an existing plan.
- Updating one docs page.
- Fixing a focused test failure.
- Running a known safe verification command.

## Preferred Task Size

- One plan task or one subsystem boundary per prompt.
- Avoid combining source, fixtures, generated assets, and provider verification.
- Batch only docs/report cleanup tasks that do not affect runtime behavior.

## Safety Rules

- No broad unrelated refactors.
- No generated asset edits unless explicitly requested.
- No secrets, tokens, private env values, or credential dumps in docs/reports.
- No paid provider/API calls without explicit approval.
- No destructive git commands.
- Do not claim success without listing actual verification.
- For `docs/plans/*` work, create/update the required implementation report.
- For any file-changing work, create a Codex-run report.

## Model/Reasoning

- Use GPT-5/Codex with high reasoning for architecture, validation, cross-package behavior, release stabilization, or provider-risk work.
- Use medium reasoning for single-package implementation with focused tests.
- Use lower reasoning only for simple docs/report edits.

## Generated Assets And Legacy Paths

- Treat generated paths as outputs, not source.
- Avoid editing `episodes/**/output`, `episodes/**/state`, `episodes/**/generated-assets`, `audio`, `video`, `images`, `transcripts`, `logs`.
- Historical legacy paths may appear in audits/plans/tests. Do not reintroduce them as active canonical paths.
