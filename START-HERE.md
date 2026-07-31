# YouTube API Planning Starter Kit

This kit prepares a planning-only, multi-agent Codex session for designing a production-grade API on top of the existing YouTube application.

## Recommendation

Run the first session in **planning mode** with **multi-agent mode enabled**.

Planning mode is important because the first objective is to establish the current architecture, locate duplicate execution paths, define the target API boundary, and agree on migration decisions before changing production code.

## Install

Extract this archive in the root of the YouTube repository:

```bash
unzip youtube-api-planning-starter.zip -d .
```

The archive intentionally creates only new planning files under:

```text
todo-prompts/api-planning/
docs/api-plan/
scripts/
AGENTS.api-planning.md
```

Review for filename conflicts before extraction if those paths already exist.

## Start the planning session

1. Open Codex at the repository root.
2. Enable planning mode.
3. Enable multi-agent mode with up to four concurrent agents.
4. Use the prompt:

```text
todo-prompts/api-planning/00-plan-api-multi-agent.md
```

5. Do not authorize implementation changes during this session.
6. Review the generated decision register before starting an implementation session.

## Expected result

Codex should populate `docs/api-plan/` with:

- Current architecture and execution-path analysis
- Duplicate implementation findings
- Target architecture
- API resource and endpoint model
- Workflow/job state model
- Security and multi-tenancy design
- Migration roadmap
- Risk and decision registers
- Implementation backlog
- Mermaid diagrams
- ADR drafts

## Validation

After the planning session, run:

```bash
./scripts/validate-api-plan.sh
```

This checks only that the required planning outputs exist. It does not validate the architectural quality of the plan.

## Next session

After reviewing and approving the planning outputs, use:

```text
todo-prompts/api-planning/01-debate-and-finalize-decisions.md
```

That second prompt asks Codex to challenge its own recommendations and resolve contradictions before implementation.
