# Planning, Contract Audit, and Dependency Graph

## Goal

Produce a repository-grounded implementation plan before broad code changes.

Inspect both:

1. current Veronica architecture
2. generic infrastructure from recent history enhancements

Do not assume history work is finalized.

# 1. Repository audit

Identify:

- monorepo/workspace boundaries
- Veronica genre implementation
- history visual-plan implementation
- versioned visual contracts
- story/scene models
- narration/TTS/alignment pipeline
- source/claim models
- image/media asset abstractions
- map/diagram/graphic abstractions
- FFmpeg wrapper/compiler
- artifact storage
- cache architecture
- durable workflow/orchestration
- approval-pack generation
- redaction/export code
- CLI/API entry points
- runtime validation/schema library
- logging/metrics/audit conventions
- tests/fixtures
- active dirty/shared files

# 2. Generic-vs-history-specific audit

Build a table:

```text
capability
current location
generic?
history-specific?
stable?
actively modified?
safe to reuse?
recommended Veronica strategy
```

Cover at least:

- narration anchors
- plan versioning
- plan hashing
- approval eligibility
- provenance
- claims/entities
- multi-shot grouping
- asset reuse
- ratio adaptation
- render instructions
- approval pack
- ZIP redaction
- duration validation
- regeneration scope
- quality metrics

# 3. Contract decisions

Decide with repository evidence:

1. shared visual-plan base vs separate Veronica v1
2. schema versioning strategy
3. planner versioning strategy
4. stable ID format
5. runtime validation approach
6. provenance shape
7. claim/source linkage
8. narration anchor representation
9. visual-state representation
10. approval eligibility contract
11. fallback contract
12. prepared-asset contract
13. aspect-ratio contract
14. FFmpeg render DSL
15. regeneration dependency model
16. cache-key composition
17. review-pack format
18. redaction strategy
19. aggregate-review extension point
20. planner-quality metric names

# 4. Architecture docs

Produce or update:

```text
docs/architecture/veronica-supplemental-media/
├── overview.md
├── repository-audit.md
├── history-reuse-analysis.md
├── concurrency-boundaries.md
├── data-flow.md
├── contract-map.md
├── decision-register.md
├── threat-model.md
├── implementation-plan.md
├── task-dependency-graph.md
├── acceptance-matrix.md
└── open-risks.md
```

Use repository conventions if different.

# 5. Multi-agent task graph

Each task must declare:

```text
task ID
agent
goal
owned files/patterns
shared files
dependencies
input contracts
output contracts
validation
conflict behavior
done criteria
```

The coordinator must prevent two agents from owning the same file.

# 6. Characterization tests

Before touching shared behavior, add focused tests for:

- history visual-plan compatibility
- horror unaffected behavior
- math unaffected behavior
- generic auto-genre unaffected behavior
- Veronica episodes without supplemental media unaffected behavior
- cache keys unchanged outside the new path
- export formats unchanged outside the new path

# 7. Planning completion gate

Implementation may start when:

- contracts are coherent
- task ownership is explicit
- concurrent-history boundaries are known
- destructive migrations are not required
- shared-file conflicts have adapters/deferred plans
- characterization tests exist for shared behavior being touched

Do not wait for routine user confirmation when safe decisions can be inferred.
