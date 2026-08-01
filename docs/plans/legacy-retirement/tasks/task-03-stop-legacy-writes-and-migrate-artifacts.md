# Task 03: Stop Legacy Writes And Migrate Artifacts

## Objective

Enforce write-forward storage while preserving controlled reads of existing
legacy artifacts.

## Scope

Artifact/path resolvers, story-localization outputs, image state, narration
records, workflow repositories, migration commands, and their focused tests.

## Procedure

1. Use the Task 01 register to map each producer to one canonical `ArtifactRef`
   and repository write method.
2. Remove direct compatibility writes from new attempts; if a temporary
   projection remains necessary, name it, manifest it, and give it an expiry.
3. Dry-run migration for existing artifacts and classify each result as safe,
   identical, divergent, invalid, or operator-owned.
4. Migrate only validated, unambiguous artifacts; never overwrite differing
   canonical content.
5. Preserve provenance, hashes, rollback manifests, and downstream
   invalidations.
6. Keep legacy candidates read-only until downstream tasks and the support
   window are complete.

## Validation

- Focused resolver/repository tests prove canonical writes, containment,
  provenance, ambiguity rejection, and idempotent migration.
- Migration dry-runs have no unexplained conflicts in the approved population.
- New attempts produce no legacy-layout files except declared projections.

## Completion gate

All active producers write canonical artifacts only, and every existing legacy
artifact has a recorded migration or retention disposition.
