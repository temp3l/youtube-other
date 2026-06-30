# Task 08 Plan: Full Localization Lineage and Locale Validation

## 1. Objective and Scope

Task 08 tightens the localized full-story path so every localized full artifact is explicitly derived from the validated canonical English full artifact introduced by Task 07, not from loose source markdown, cleaned source, legacy combined output, a sibling locale, or any short artifact. The implementation should add variant-specific lineage, locale-aware validation, localized-full failure routing, and sync/batch parity without redesigning the generic prompt compiler, generic preflight framework, persistence infrastructure, or retry architecture established in Tasks 05–07.

This task owns only two concerns:

1. localized-full parent lineage; and
2. localized-full locale validation and issue routing.

It does not own short-source extraction, short adaptation contracts, short prompt compilation, broader retry frameworks, or cross-artifact invalidation beyond the localized-full-specific deltas needed to make lineage safe.

### Shared baseline for Tasks 08–10

Tasks 09 and 10 should reference this section instead of restating it.

| Concern | Existing owner | Task 08 delta |
| --- | --- | --- |
| Canonical English full validity | Task 07 implementation | Consume only |
| Canonical English full lineage hashes | Task 07 implementation | Consume only |
| Generic prompt fingerprints | Task 05 implementation | Reuse |
| Generic preflight and duplicate-failed suppression | Task 06 implementation | Extend parent/locale semantics only |
| Localized-full parent lineage | None yet | Add |
| Localized-full locale validation | Partial today | Tighten |

The required end-to-end lineage for this task is:

`validated canonical English full narration -> validated localized full narration`

## 2. Current Sync and Batch Localized-Full Call Graphs

### Sync path

Current sync generation runs through `apps/cli/src/story-full-rewrite-command.ts` and `apps/cli/src/story-localization-commands.ts`, then into `packages/story-localization/src/story-localization.service.ts`.

Observed flow:

1. CLI resolves runtime config and language list.
2. `localizeStoryEpisode(...)` builds or resumes canonical English full first.
3. Canonical English full is persisted through `canonical-full-story.persistence.ts`.
4. Localized full prompts are built from canonical English parsed content and facts.
5. Preflight and generation run per locale.
6. Localized outputs are validated and persisted.

This is directionally correct, but the localized artifact semantics are weaker than canonical full semantics, and locale validation is not yet strong enough.

### Batch path

Current batch generation runs through `prepareStoryLocalizationBatch(...)` and import/retry helpers in `packages/story-localization/src/story-localization-batch-service.ts`.

Observed flow:

1. Canonical English full batch plan is created first.
2. Batch items for each localized full are created with `parentArtifact: { kind: "canonical-english-full", fingerprint, sourceHash }`.
3. Retry preparation compares prompt fingerprint, response schema fingerprint, and canonical parent fingerprint.
4. Import validates schema compatibility and persists results.

This already uses canonical English as the parent, which is the correct direction. Task 08 should make the lineage explicit and equally strict in sync and batch persistence, validation, and resume behavior.

## 3. Exact Current Source Artifact Used for Localization

The current authoritative parent is the canonical English full artifact persisted by Task 07.

Repository evidence:

- `canonical-full-story.persistence.ts` persists canonical full artifacts and a manifest containing:
  - `validation.status`
  - `lineage.sourceHash`
  - `lineage.cleanedSourceHash`
  - `lineage.storyIrHash`
  - `lineage.contractHash`
  - `lineage.contractBuildFingerprint`
  - `canonicalFingerprint`
  - `downstreamInvalidationFingerprint`
- `story-localization.service.ts` computes a canonical English full plan, persists it, then localizes from that canonical result.
- `story-localization-batch-service.ts` builds localized batch items with canonical parent fingerprints.

Important nuance: prompt construction currently uses canonical English parsed story content, which is acceptable, but localized persistence and validation should no longer rely on implicit assumptions that “canonical English happened first.” The localized full artifact itself needs explicit parent identity and hash/fingerprint fields.

## 4. Confirmed Lineage Defects

The following defects are confirmed from source:

| Defect | Evidence | Impact |
| --- | --- | --- |
| Localized-full lineage is weaker than canonical-full lineage | `story-localization.service.ts`, `story-localization-batch-service.ts` | Parent dependency is implied more than enforced |
| Localized-full validation is language-only, not locale-aware | `generated-story-validator.ts` | Wrong regional output or sibling-locale leakage can pass |
| CLI localization model defaults use short rewrite defaults | `story-localization-commands.ts` | Full localization path is configured through the wrong fallback family |
| Localized-full repair defaults route through validator/metadata config | `story-localization-commands.ts` | Repair path is not clearly localized-full-owned |
| Preflight parent metadata is under-specified for localized full | `story-generation-preflight.ts` | Resume/cache invalidation cannot fully distinguish parent state |
| Current validation does not explicitly detect duplicate sections, locale boilerplate leakage, metadata/audio/visual leakage, or truncation | `generated-story-validator.ts` | Bad localized output may be accepted or misrouted |

No inspected path currently shows localized full intentionally deriving from raw source, cleaned source directly, another localization, or a short when the canonical English full path is active. The defect is not the primary parent choice; it is the lack of durable, typed enforcement and validation.

## 5. Target Localized-Full Lineage and Artifact Fields

Localized full persistence should mirror the canonical-full rigor while staying variant-specific and additive.

### Required localized-full artifact fields

| Category | Required field |
| --- | --- |
| Identity | `language`, `locale`, `variant: "full"` |
| Parent | canonical English parent identity |
| Parent | canonical English parent fingerprint/hash |
| Shared narrative basis | `storyIrHash` |
| Contract basis | `contractHash` or equivalent contract fingerprint already used in full flow |
| Prompt | compiler version, prompt version, prompt fingerprint, selected modules |
| Schema | response schema name, version, fingerprint |
| Model | model name, reasoning effort, max output tokens |
| Execution | usage and cost |
| Validation | status, issue list, optional semantic issues |
| Repair | repair history |
| Status | completed/failed/blocked-preflight |

### Deliberate non-goals

Do not introduce a second generic artifact framework. Reuse the existing canonical/full artifact style and extend:

- `story-artifact-model.ts`
- `story-localization.types.ts`
- `story-localization.schemas.ts`

## 6. Locale Support Decision

`fr-FR` should be treated as active support unless implementation uncovers a missing locale module during Task 08 execution.

Reasoning:

- `language-profiles.ts` contains `fr -> fr-FR`.
- CLI language parsing defaults include `fr`.
- short rewrite constants also include `fr-FR`.

That is stronger evidence than any supporting plan text. The Task 08 plan should therefore require French behavior to be tested as an active supported locale, while allowing tests to confirm whether support is complete or compatibility-limited in practice.

## 7. Locale-Validation Ownership and Issue Codes

Task 08 should extend localized-full validation in `generated-story-validator.ts` and any shared issue-code definitions in `story-artifact-model.ts`.

### Existing validator coverage to preserve

| Check | Current status |
| --- | --- |
| Wrong language code | Exists |
| Missing exact written messages | Exists |
| Missing climax / culmination | Exists |
| Missing ending / consequence | Exists |
| Empty or too-short output | Exists |
| Boilerplate / editorial filler | Partial |

### New localized-full checks owned by Task 08

| Issue class | Purpose |
| --- | --- |
| Wrong regional locale | Detect locale mismatch within a shared language family |
| Source-language leakage | Detect untranslated English leakage |
| Sibling-locale leakage | Detect borrowing from another locale module |
| Untranslated boilerplate | Detect copied locale instructions or stock text |
| Missing immutable facts/entities | Enforce StoryIR-preserved identity |
| Changed identifiers | Prevent renamed messages/entities/objects that should remain stable |
| Missing central threat/mechanism | Enforce contract fidelity |
| Truncation/incomplete output | Detect abrupt ending or unfinished generation |
| Duplicated sections | Detect repeated paragraphs/segments |
| Metadata/audio/visual leakage | Reject non-narration content in localized full |

The plan should add concise issue codes rather than prose-only diagnostics, because Tasks 09 and 10 need stable failure classes for downstream routing.

## 8. Repair/Regeneration Routing

Localized-full failures must stay on the localized-full path.

### Routing rules

- Wrong language, wrong locale, locale leakage, untranslated boilerplate, or truncated localized-full output route to localized-full repair or localized-full regeneration only.
- Full localization must not borrow:
  - short model settings,
  - short response schemas,
  - short output caps,
  - short repair budgets,
  - short regeneration paths.
- Validator configuration is not a generation fallback.
- Unchanged failed prompt/schema/parent fingerprint combinations stay suppressed through the existing preflight duplicate-failed mechanism.
- A failed locale affects only that locale and its descendants, not sibling locales already validated successfully.

The plan should call out `apps/cli/src/story-localization-commands.ts` explicitly because that file currently falls back to short defaults for localization model/output settings and to validator/metadata defaults for repair.

## 9. Persistence, Resume, Cache, and Invalidation Delta

Task 08 should tighten only the localized-full delta.

### Persistence delta

Localized full artifacts, manifests, and cache entries should persist:

- canonical parent fingerprint/hash;
- shared `storyIrHash`;
- full contract hash/fingerprint used to build the localized prompt;
- prompt fingerprint;
- response schema fingerprint;
- locale.

### Resume delta

Resume should reject localized-full artifacts when any of these drift:

- canonical parent fingerprint/hash;
- locale module selection/fingerprint;
- prompt fingerprint;
- response schema fingerprint;
- localized-full validation status;
- failed artifact incorrectly represented as completed.

### Invalidation delta

Task 08 should use narrow invalidation:

| Change | Invalidates |
| --- | --- |
| Canonical English full fingerprint changes | All localized fulls depending on it |
| Locale module change for `es-419` | Only `es-419` full and descendants |
| German validator rule change | Only German localized full revalidation path |
| One locale fails validation | Only that locale’s artifact |

This is narrower than a repo-wide or sibling-wide invalidation model and matches the task specification.

## 10. Sync/Batch Parity

Sync and batch must agree on:

- canonical parent requirement;
- localized-full artifact identity;
- lineage fields;
- prompt/schema fingerprint semantics;
- locale validation;
- retry suppression behavior;
- repair/regeneration ownership.

Batch-specific notes:

- `story-localization-batch-service.ts` already compares retry item prompt/schema/parent fingerprints before reusing configuration hashes.
- Task 08 should preserve this logic and align sync persistence to the same fields rather than introducing parallel cache semantics.

## 11. File-by-File Changes

| File | Task 08 change |
| --- | --- |
| `story-artifact-model.ts` | Add localized-full lineage/issue-code fields only where shared typing belongs |
| `story-localization.schemas.ts` | Add schema support for localized-full lineage metadata |
| `story-localization.types.ts` | Add typed localized-full parent/persistence metadata |
| `generated-story-validator.ts` | Extend locale-aware localized-full checks and issue classification |
| `story-generation-preflight.ts` | Tighten localized-full parent descriptor semantics and locale handling |
| `story-localization.service.ts` | Persist and resume against explicit canonical parent lineage |
| `story-localization-batch-service.ts` | Mirror sync lineage semantics in manifest/import/retry |
| `apps/cli/src/story-localization-commands.ts` | Correct full-localization config routing defaults |
| `index.ts` | Export new localized-full helper/types if needed |

### Overlap with later tasks

| File | First task | Later consumer | Stable interface required |
| --- | --- | --- | --- |
| `story-artifact-model.ts` | 08 | 09, 10 | issue codes and parent lineage typing |
| `story-localization.types.ts` | 08 | 09, 10 | parent artifact descriptors |
| `story-generation-preflight.ts` | 08 | 10 | locale-aware parent semantics |
| `generated-story-validator.ts` | 08 | 10 | reusable localized-full failure classes |

## 12. Focused Tests and Verification Commands

### Tests to add or update

- `story-generation-preflight.unit.test.ts`
  - localized-full requires canonical parent descriptor
  - locale coverage for `es-419`, `de-DE`, `pt-BR`, `fr-FR`
- localized-full validator unit tests in `generated-story-validator` coverage
  - wrong language
  - wrong locale
  - sibling-locale leakage
  - untranslated boilerplate
  - duplicated sections
  - metadata/audio/visual leakage
- `story-localization.integration.test.ts`
  - validated canonical parent required
  - raw or sibling-locale source rejected
  - one locale failure leaves siblings valid
- `story-localization.batch.integration.test.ts`
  - batch lineage matches sync lineage
  - locale-module change invalidates only that locale and descendants

### Verification commands

Use focused commands only, derived from current Vitest usage in this repo:

- `pnpm test -- packages/story-localization/src/story-generation-preflight.unit.test.ts`
- `pnpm test -- packages/story-localization/src/story-localization.integration.test.ts`
- `pnpm test -- packages/story-localization/src/story-localization.batch.integration.test.ts`
- affected package typecheck only after focused tests pass

## 13. Implementation Order

1. Add shared localized-full lineage types and issue codes.
2. Extend localized-full validator for locale-aware failures.
3. Tighten preflight parent semantics.
4. Update sync localized-full persistence/resume.
5. Update batch manifest/import/retry parity.
6. Correct CLI localization model/repair routing defaults.
7. Add focused tests.

## 14. Compatibility Risks

| Risk | Mitigation |
| --- | --- |
| Existing readable legacy artifacts may not contain new lineage fields | Preserve read compatibility where possible; only canonical new writes become stricter |
| Locale validation may initially overfire on real outputs | Use compact issue codes and targeted fixtures/mocks in tests before broad rollout |
| CLI model fallback correction may change behavior for users relying on implicit short defaults | Keep documented precedence grounded in current config fields, not new config additions |

## 15. Remaining Repository Uncertainties

Only two uncertainties remain after source inspection:

1. Whether `fr-FR` has any downstream locale-module content gaps outside the inspected story-localization package.
2. Whether any legacy import/read path outside the inspected sync/batch services still consumes localized full artifacts without the tightened parent metadata.

These are narrow enough to defer to implementation-time focused tests rather than further planning expansion.
