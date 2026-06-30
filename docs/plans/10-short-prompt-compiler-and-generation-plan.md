# Task 10 Plan: Short Prompt Compiler and Generation

## 1. Objective and Scope

Task 10 completes the short-generation refactor by replacing the current compatibility-oriented full-text prompt path with a short-specific compiler and generation flow that consumes the validated Task 09 contract. The result should be a narrow, deterministic, matching-locale short generation pipeline with correct prompt/schema/model routing, bounded repair, and reliable resume invalidation.

This task owns:

1. short prompt compilation;
2. short provider generation;
3. short validation, repair, and controlled regeneration;
4. short resume invalidation tied to the real parent and contract basis.

It does not own canonical full lineage, localized-full locale validation, deterministic extraction itself, or generic preflight architecture. Those are owned by Tasks 07, 08, 09, and 06 respectively.

Required flow for this task:

`validated matching-locale full -> deterministic extraction -> short contract -> short compilation -> short preflight -> generation -> validation -> targeted repair or controlled regeneration -> validated matching-locale short`

## 2. Current Short Prompt/Provider Flow

The current short path spans:

- `short-rewrite.service.ts`
- `short-rewrite.prompt.ts`
- `story-prompt-compiler.ts`
- `story-generation-preflight.ts`
- `apps/cli/src/story-short-rewrite-command.ts`

### Current behavior

1. Resolve source input, usually a generated English full source markdown.
2. Build a pseudo-source story object.
3. Extract canonical facts from that pseudo object.
4. Call `compileShortStoryPrompt(...)`.
5. Inject the entire full story text into the prompt.
6. Run short preflight and provider call.
7. Validate word range/hook and optionally repair.

### Current configuration routing

- short model selection already prefers `openAiShortModel`, then `openAiStoryModel`
- repair model currently falls back through validator/metadata configuration
- short schema already exists as `shortRewriteResponseSchemaDescriptor`

This means the repo already has the right high-level split between full and short schemas/models, but the compiler input boundary is still wrong.

## 3. Confirmed Defects

| Defect | Evidence | Impact |
| --- | --- | --- |
| Short prompts embed entire full story payload | `story-prompt-compiler.ts`, `short-rewrite.prompt.ts` | Excessive prompt size and weak boundary between extraction and generation |
| Localized short parent is not matching-locale typed | `short-rewrite.service.ts`, `story-generation-preflight.ts` | Wrong-locale lineage can pass |
| Current repair path uses broad source context | `short-rewrite.prompt.ts`, `short-rewrite.service.ts` | Repair is more expensive and less bounded than needed |
| Resume does not consider parent full hash or short contract hash | `short-rewrite.service.ts`, `short-rewrite.schemas.ts` | Stale outputs can be reused incorrectly |
| Short persistence lacks schema/compiler/contract lineage | `short-rewrite.schemas.ts` | Cannot prove generated short matches its actual contract inputs |
| Compile/preflight zero-call boundary is not enforced around the new contract-driven flow | current tests | Provider may still be reachable after upstream invalid state |

## 4. Target Short Compiler Inputs and Outputs

Task 10 should define a short-specific compiler that consumes the Task 09 contract rather than full-story markdown.

### Compiler inputs

| Input | Source |
| --- | --- |
| Validated Task 09 short contract | Task 09 persistence |
| Deterministic extraction | Task 09 output |
| Matching locale module | existing locale module system |
| Applicable genre policy | existing genre policy system |
| Short constraints | existing short WPM/duration/word config |
| Short response schema descriptor | existing `shortRewriteResponseSchemaDescriptor` |

### Compiler outputs

| Output | Purpose |
| --- | --- |
| System message | short-specific instruction set |
| User message | compact short-generation request |
| Schema name/version/fingerprint | deterministic request basis |
| Prompt fingerprint | request identity |
| Input-section token estimates | preflight integration |
| Selected module IDs/versions | reproducibility |
| Structured diagnostics | compile-time block/allow decisions |

### Prompt requirements

The compiled prompt must explicitly require:

- a hook within the configured opening window;
- immediate story identity and conflict;
- compressed escalation;
- one coherent narrative thread;
- preserved threat, mechanism, culmination, and ending;
- final consequence or sting;
- natural spoken rhythm;
- locale-appropriate narration.

### Prompt exclusions

The compiled prompt must explicitly exclude:

- metadata and SEO;
- audio/TTS production instructions;
- scenes and images;
- thumbnails;
- rendering or publication instructions;
- validation diagnostics;
- repair history;
- full-story payload when compact extraction is sufficient.

## 5. Model/Config Routing

Task 10 should stay conservative and evidence-based.

### Existing config evidence

- `packages/config/src/index.ts` already supports:
  - `openAiStoryModel`
  - `openAiLocalizationModel`
  - `openAiShortModel`
  - `openAiValidatorModel`
  - `openAiMetadataModel`
- `apps/cli/src/story-short-rewrite-command.ts` already prefers `openAiShortModel ?? openAiStoryModel`

### Planning decision

Do not introduce a new localized-short model setting unless implementation proves the current `openAiShortModel` fallback is inadequate. The plan should recommend:

1. keep short generation on the short-specific model path;
2. keep full/localized-full on their own full/localization paths;
3. avoid using full schemas or full output caps for short generation;
4. keep repair bounded to short-specific caps and contexts.

If implementation later justifies a localized-short-specific model override, it must come with focused tests and a clear config precedence story. That is not needed for the current plan.

## 6. Generation, Validation, Repair, and Regeneration Flow

Task 10 should turn the current short flow into a narrow state machine.

### Target flow

1. Resolve validated matching-locale parent full artifact.
2. Load deterministic extraction and validated short contract.
3. Compile short prompt.
4. Run short preflight.
5. If compile or preflight blocks, stop with zero provider calls.
6. Run generation with short schema only.
7. Run deterministic validation.
8. Optionally run semantic validation if already supported by the repo’s validator path.
9. Route failures either to targeted short repair or controlled short regeneration.
10. Persist validated short artifact with lineage.

### Strict repair rules

| Failure type | Repair input |
| --- | --- |
| Hook failure | opening-local context only |
| Ending failure | ending-local context only |
| Other fragment-local issue | smallest relevant contract excerpt |
| Global coherence failure | short regeneration |

### Hard boundaries

- short never enters full regeneration;
- full schemas are never used for short variants;
- full output caps are never used for short variants;
- full retry budgets are never used for short variants;
- parent full hash and short-contract hash participate in request fingerprints;
- unchanged failed requests remain suppressed through the existing duplicate-failed preflight behavior.

### Validation expectations

Deterministic validation should continue to enforce at least:

- word range
- hook alignment
- thumbnail constraints where still applicable
- preservation of written messages/identifiers when the contract marks them required
- threat/mechanism/climax/ending retention at the short level

Task 10 should reuse validator infrastructure where possible instead of inventing a second short validator stack.

## 7. Persistence and Resume Delta

Task 10 should finalize the short persistence model started in Task 09.

### Persisted short artifact basis

Short sidecar/artifact/manifest records should include:

- target language and locale;
- validated parent full identity;
- parent full fingerprint/hash;
- extraction version/hash;
- short contract version/hash/build fingerprint;
- compiler version;
- prompt version/fingerprint;
- response schema name/version/fingerprint;
- model, reasoning effort, max output tokens;
- validation status;
- repair history;
- usage/cost;
- canonical vs compatibility marker.

### Resume rejects

Resume should reject when any of these change:

- stale or wrong-locale parent;
- stale extraction or contract fingerprint;
- stale compiler or schema version/fingerprint;
- failed artifact represented as successful;
- compatibility-derived short when a canonical parent is now available.

This is stricter than current resume logic, which mainly checks source hash, prompt fingerprint, prompt version, model, language, and validation booleans.

## 8. File-by-File Changes

| File | Task 10 change |
| --- | --- |
| `story-prompt-compiler.ts` | Implement short-specific compiler over compact contract inputs |
| `short-rewrite.prompt.ts` | Remove full-story-text assumptions from short prompt assembly |
| `short-rewrite.service.ts` | Orchestrate compile/preflight/generate/repair/regenerate over contract inputs |
| `short-rewrite.schemas.ts` | Persist compiler/schema/contract/repair lineage |
| `short-rewrite.types.ts` | Add compiler input/output and repair-context typing |
| `story-generation-preflight.ts` | Ensure short request fingerprints incorporate parent and contract hashes |
| `apps/cli/src/story-short-rewrite-command.ts` | Preserve short-specific config routing; adjust only if needed for explicit short boundaries |
| `index.ts` | Export short compiler/helpers/types |

### Overlap with earlier tasks

| File | First task | Later consumer | Stable interface required |
| --- | --- | --- | --- |
| `story-prompt-compiler.ts` | 09 | 10 | contract-driven short input boundary |
| `short-rewrite.schemas.ts` | 09 | 10 | persisted parent/extraction/contract fields |
| `short-rewrite.types.ts` | 09 | 10 | canonical short contract/extraction types |
| `story-generation-preflight.ts` | 08 | 10 | parent-aware request fingerprint semantics |

Duplicate abstractions should be avoided by compiling directly from the Task 09 contract, not by introducing a second short-contract or second short-compiler interface.

## 9. Focused Tests and Verification Commands

### Tests to add or update

- `story-prompt-compiler.unit.test.ts`
  - forbidden sections excluded
  - full-story payload not injected when compact extraction exists
  - short schema selected only for short variants
- `short-rewrite.service.unit.test.ts`
  - matching localized parent used
  - parent and contract hashes affect fingerprints
  - repair excludes full payload and metadata
  - stale parent invalidates resume
  - compile or preflight failure yields zero provider calls
- `short-rewrite.unit.test.ts`
  - short repair/regeneration boundaries
  - compatibility-derived short rejected when canonical parent available
- CLI unit tests if short command wiring changes

### Verification commands

Use focused commands only:

- `pnpm test -- packages/story-localization/src/story-prompt-compiler.unit.test.ts`
- `pnpm test -- packages/story-localization/src/short-rewrite.service.unit.test.ts`
- `pnpm test -- packages/story-localization/src/short-rewrite.unit.test.ts`
- `pnpm test -- apps/cli/src/story-short-rewrite-command.unit.test.ts`
- affected package typecheck only after focused tests pass

## 10. Implementation Order

1. Consume Task 09 contract/extraction interfaces in the short compiler.
2. Replace full-text prompt assembly with compact short prompt assembly.
3. Add parent/contract-aware fingerprint composition.
4. Tighten preflight to block stale or mismatched short requests before provider calls.
5. Add minimal-context repair builders and controlled regeneration routing.
6. Extend persistence/resume semantics.
7. Add focused tests.

## 11. Compatibility Risks

| Risk | Mitigation |
| --- | --- |
| Existing tests assume full localized story text appears in prompts | Update focused compiler/service tests to assert compact contract behavior instead |
| Existing compatibility-source path may still rely on broad prompt context | Keep compatibility explicit and noncanonical, but do not let it redefine canonical short generation |
| English locale normalization inconsistency may affect resume or manifests | Preserve behavior intentionally until implementation settles whether short English should remain `en` or align to `en-US` |

## 12. Remaining Uncertainties

Two repository uncertainties remain narrow but worth recording:

1. Whether localized-short batch support should be updated within Task 10 or explicitly deferred if no existing batch path consumes the new contract.
2. Whether semantic validation for shorts should remain optional in this task or be limited to deterministic validation only, depending on what existing validator hooks already support without broadening scope.

Neither uncertainty blocks the recommended implementation model:

- Task 08: tighten localized-full lineage and locale validation.
- Task 09: insert deterministic extraction and compact short contract.
- Task 10: compile and generate shorts only from that contract, with narrow repair/regeneration and zero-provider-call blocking on compile/preflight failure.
