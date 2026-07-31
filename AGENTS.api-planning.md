# API Planning Agent Instructions

These instructions apply to the API planning work in `docs/api-plan/`.

## Operating mode

- Planning and analysis only.
- Do not implement production functionality.
- Do not refactor existing production code.
- Do not change database schemas, runtime configuration, CI, deployment manifests, or dependencies.
- Small read-only inspection commands are allowed.
- Tests may be executed when they do not mutate repository state or call paid/external providers.

## Architectural invariant

The new API must expose the existing canonical application and workflow capabilities. It must not create a second story, audio, rendering, thumbnail, localization, validation, or publishing implementation.

The target dependency direction should normally be:

```text
HTTP API / CLI / workers / schedulers
                ↓
       application use cases
                ↓
       workflow orchestration
                ↓
 domain contracts and ports
                ↓
 persistence / storage / providers / renderers / YouTube
```

Repository evidence may justify a variation, but every variation must be documented.

## Multi-agent boundaries

Agents may inspect the repository concurrently, but they must not edit overlapping files.

Recommended workstreams:

1. Repository and dependency inventory
2. CLI and execution-path tracing
3. Workflow state, queues, retries, and persistence
4. API resource model and OpenAPI contract
5. Authentication, authorization, multi-tenancy, and security
6. Storage, assets, render workers, and publishing
7. Observability, audit, testing, and deployment
8. Migration sequencing, risks, and implementation backlog

The lead agent owns consolidation and final decisions.

## Evidence standard

Every material statement must be marked as one of:

- **Verified** — supported by repository evidence
- **Inferred** — likely but not directly proven
- **Recommended** — target-state proposal
- **Unresolved** — requires operator decision or more evidence

For verified findings, cite concrete file paths, symbols, commands, schemas, or tests.

## Project-specific requirements

Preserve all relevant behavior for both content systems:

### Dark Truth

- Story bible
- Reference images
- Canonical facts
- Localization
- Full videos and Shorts
- Thumbnail and publishing workflows
- Human approval and quality gates

### Mathematics education

- Curriculum and grade metadata
- Locale support
- Presentation presets
- Audio presets
- Chalkboard rendering and retained board state
- Full videos, Shorts, exercises, metadata, and publishing

## Quality requirements

- Strict TypeScript types
- No `any` as an architectural escape hatch
- Thin controllers and CLI adapters
- Explicit application-service boundaries
- Durable, resumable, and idempotent workflows
- Duplicate-publication prevention
- Tenant-safe asset and credential access
- Stable machine-readable errors
- OpenAPI contract with drift prevention
- Testable providers and renderers
- Structured observability and immutable audit events
