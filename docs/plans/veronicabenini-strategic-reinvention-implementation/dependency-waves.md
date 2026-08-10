# Dependency waves

| Wave | Tasks | Safe parallel set | Completion gate |
| --- | --- | --- | --- |
| 0 — identity | VRI-01 | none | VRI-01 exclusively owns shared schemas; alias contract merged. |
| 1 — lifecycle/source/fingerprints | VRI-02, VRI-03, VRI-04 | all three | Persistence, source, and workflow cache owners are disjoint. |
| 2 — editorial/visual | VRI-05, VRI-06, VRI-07, VRI-08 | VRI-06/VRI-07/VRI-08 after VRI-05 | Narrative input contract frozen. |
| 3 — derivatives | VRI-09, VRI-10, VRI-11, VRI-12 | VRI-09/VRI-11 when inputs stable | Locale, approval, composition contracts merged. |
| 4 — workflow/render | VRI-13, VRI-14, VRI-15 | VRI-14/VRI-15 after VRI-13 | No fixture production path. |
| 5 — publish/bulk/policy | VRI-16, VRI-17, VRI-18 | VRI-17/VRI-18 | Publish remains fail-closed. |
| 6 — API/operations | VRI-19, VRI-20, VRI-21 | VRI-19/VRI-21; VRI-20 follows VRI-19 | OpenAPI edits serialized. |
| 7 — analytics/compatibility | VRI-22, VRI-23, VRI-24, VRI-25 | VRI-22/VRI-25 | Legacy writes contained. |
| 8 — hardening | VRI-26 | none | Acceptance fixture and all gates pass. |

## Shared-file ownership

VRI-01 owns `packages/domain/src/workflow-contracts.ts` and profile/config schemas. VRI-02 owns lifecycle repository writes. VRI-04 owns cache/artifact contracts; VRI-12 owns approval records. VRI-19 owns `apps/api/src/contract.ts`; VRI-20 depends on it. VRI-25 owns resolver migration policy.
