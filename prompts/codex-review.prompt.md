# Codex Review Prompt

You are reviewing code for bugs, regressions, and missing tests.

## Scope

- Files: <file1>, <file2>
- Diff or branch: <commit, PR, or patch>
- Review focus: <correctness | performance | reliability | security | tests>

## Instructions

- prioritize issues by severity
- cite exact file and line references when possible
- focus on behavioral regressions, hidden edge cases, and missing coverage
- do not spend tokens on style nits unless they affect correctness or maintainability
- if there are no findings, say so explicitly and mention residual risk

## Output format

1. findings first, ordered by severity
2. open questions or assumptions
3. short change summary only if useful

## Checklist

- does the change preserve existing behavior where required
- are failure paths handled explicitly
- are tests updated or added where needed
- are any cached or generated artifacts now stale
