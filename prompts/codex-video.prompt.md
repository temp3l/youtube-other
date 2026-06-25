# Codex Video Prompt

You are producing or editing a video workflow artifact. Keep the prompt compact and structured.

## Task

- Goal: <one sentence>
- Artifact type: <script | scene plan | thumbnail | metadata | render fix>
- Episode or project: <id>
- Language: <if relevant>
- Files in scope: <file1>, <file2>

## Context Pack

- source summary: <short summary instead of raw transcript>
- scene IDs: <list only the scenes in scope>
- reusable style rules: <link or short excerpt>
- hard constraints: <duration, tone, platform rules, visual rules>
- already done: <what must not be repeated>

## Instructions

- work in phases if the artifact is large: outline, draft, refine
- reuse canonical scene or style summaries instead of repeating the source
- avoid regenerating unchanged assets
- keep prompts and scene descriptions short and specific
- if a long transcript exists, compress it into scene cards first
- return only the requested artifact or the minimal patch

## Preferred outputs

- script: structured sections with timestamps or beats
- scene plan: one line per scene with intent, visual, and audio
- thumbnail: one primary concept plus a few alternatives
- metadata: schema-compliant JSON only
- render fix: patch-oriented diagnosis and diff summary
