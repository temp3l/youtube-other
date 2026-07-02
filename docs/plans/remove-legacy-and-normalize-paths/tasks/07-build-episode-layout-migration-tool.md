# Task 07: Build Episode Layout Migration Tool

## Objective

Inventory and migrate repository-owned episode scripts safely.

## Background

Many episodes contain root, language-folder, generated, and audio-source duplicate scripts.

## Scope

Add a dry-run-first utility and reports.

## Expected files

- `scripts/` migration utility or `apps/cli` admin command
- migration tests

## Procedure

1. Walk `episodes/` excluding generated output/state trees where appropriate.
2. Detect all script candidates.
3. Compute raw and normalized hashes.
4. Plan canonical targets.
5. Report identical duplicates, divergent duplicates, and collisions.
6. Implement `--write` only for safe moves.

## Safety constraints

Default dry-run. No silent overwrite. Divergence requires manual resolution.

## Validation

```bash
pnpm test:focused -- <migration-tool-unit-test>
pnpm mediaforge -- <migration-command> --dry-run --json
```

## Completion checklist

- [ ] structured report
- [ ] rollback notes
- [ ] 022 inventory complete

## Dependencies

Task 03.

## Batching

Do not batch write mode with tool creation.
