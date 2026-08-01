# Strategic Reinvention Multiagent Task Index

These briefs implement `docs/plans/strategic-reinvention-implementation-plan.md`. They do not relax its evidence gates or authorize paid/irreversible provider actions.

## Multiagent Rules

1. The lead agent owns architecture, shared integration files, merge barriers, Git staging, commits, and the final implementation report.
2. Parallel agents may edit only the paths assigned by their task. If another path is required, stop and ask the lead to reassign it.
3. Agents sharing one worktree do not commit, rebase, restore, or stash. The lead stages exact owned paths after all agents in a wave finish.
4. Read `AGENTS.md`, `docs/ai-context/context-pack.md`, this index, the master plan, decision register, audit, and the assigned task before editing.
5. Inspect package-specific `AGENTS.md` when entering that package.
6. Run the directly affected test first. Stay within three distinct test commands and one affected-package typecheck.
7. No paid calls, uploads, migrations, broad tests/builds, snapshot updates, fixture regeneration, or generated-asset edits.
8. Every modifying task writes its required Codex run report. The lead updates the plan implementation report at each merge barrier.

## Dependency Graph

```text
00
├── 01 locale/domain/path ──> 03 registries/profile
├── 02 security hardening ──> 03
│
03 ──┬── 04 source provenance ──> 07 adaptation
     ├── 05 durable approvals ──> 07,09,10
     ├── 06 visual policy ─────> 09
     └── 08 locale media ─────> 09,10

04,05 ──> 07
06,07,08 ──> 09 canonical workflow
05,08,09 ──> 10 publishing
09,10 ──┬── 11 pilot
        └── 12 documentation
11,12 ──> 13 final verification
```

## Execution Table

| Wave | Task                                                                             | Owner paths                            | Parallel with | Checkpoint            |
| ---- | -------------------------------------------------------------------------------- | -------------------------------------- | ------------- | --------------------- |
| 0    | [00 Execution gate](task-00-execution-gate.md)                                   | planning/decision docs                 | none          | lead only             |
| 1    | [01 Locale, domain, paths](task-01-locale-domain-and-path-contracts.md)          | domain/shared                          | 02            | domain foundation     |
| 1    | [02 Security prerequisites](task-02-security-observability-and-remote-render.md) | observability/process/remote/doctor    | 01            | safety foundation     |
| 2    | [03 Registries and profile](task-03-registries-and-profile-package.md)           | config/new profile package             | none          | profile foundation    |
| 3    | [04 Source provenance](task-04-content-source-provenance.md)                     | source-ingestion/profile source policy | 05,06         | provenance foundation |
| 3    | [05 Durable approvals](task-05-durable-scoped-approvals.md)                      | workflow/persistence/approval CLI      | 04,06         | approval foundation   |
| 3    | [06 Editorial visual policy](task-06-editorial-documentary-visual-policy.md)     | visual-planning/image policy           | 04,05         | visual foundation     |
| 4    | [07 Source-led adaptation](task-07-source-led-adaptation-and-provenance.md)      | profile adaptation modules             | 08            | adaptation            |
| 4    | [08 Italian locale media](task-08-italian-localization-and-media.md)             | localization/speech/metadata           | 07            | locale media          |
| 5    | [09 Canonical workflow](task-09-canonical-workflow-integration.md)               | profile task graph/CLI composition     | none          | workflow integration  |
| 6    | [10 Publishing safety](task-10-multilingual-packaging-and-publishing.md)         | youtube-upload/publication composition | none          | irreversible boundary |
| 7    | [11 Pilot fixture](task-11-deterministic-pilot-fixture.md)                       | new fixture/tests                      | 12            | acceptance fixture    |
| 7    | [12 Documentation](task-12-operator-documentation-and-migration.md)              | operator/architecture docs             | 11            | docs                  |
| 8    | [13 Final verification](task-13-final-verification-and-reporting.md)             | reports only                           | none          | release evidence      |

## Merge Barriers

- After Wave 1: lead resolves locale/export changes and security changes before Task 03.
- After Wave 3: lead freezes source, approval, and visual artifact contracts before adaptation.
- After Wave 4: lead checks that no creator-specific policy leaked into capability packages.
- After Wave 5: workflow status, resume, and invalidation must be deterministic before any publishing edit.
- After Wave 6: all live paths remain blocked; only then may the pilot and docs proceed.

## Required Git Checkpoints

Parallel agents do not commit. At each barrier the lead runs `git diff --check` on the wave paths, reviews ownership, stages only those paths, and creates the checkpoint named in the master plan. A task with failing acceptance criteria is not staged with successful sibling work unless the files and contracts are truly independent.
