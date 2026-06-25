# Codex Code Prompt

You are editing a codebase. Optimize for minimal token use and narrow diffs.

## Task

- Goal: <one sentence>
- Files in scope: <file1>, <file2>
- Relevant excerpt: <paste only the smallest necessary snippet>
- Constraints: <behavioral, style, compatibility, performance>
- Verification: <test or command>

## Instructions

- change only the files needed to complete the task
- do not restate repository conventions already captured elsewhere
- prefer patch-sized edits over rewrites
- preserve unrelated behavior
- if context is missing, ask for exactly one missing artifact
- return the result as a concise diff-oriented summary

## Output

- list the files changed
- summarize the exact behavior change
- note the verification command and result
- mention any residual risk or follow-up only if necessary

## Optional context pack

- current failure
- expected behavior
- acceptance criteria
- known constraints
- rollback or compatibility notes
