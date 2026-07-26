# Research-Informed Horror Storytelling Plan

Date: 2026-07-24
Status: proposed
Target: Dark Truth canonical English full stories and derived Shorts

## 1. Decision

Implement horror technique as a versioned, story-specific affect plan between the
canonical story contract and prompt compilation. Do not add more unstructured
prompt advice and do not put editorial choices into `StoryIR`, which should remain
the source-truth boundary.

The first release should:

1. represent suspense, curiosity, surprise, controlled uncertainty, response
   narrowing, causal continuity, threat coping, and tension/release explicitly;
2. compile only the relevant parts of that plan into the full and Short prompts;
3. validate structural facts deterministically and reserve subjective judgments
   for evidence-backed model or human review;
4. run in shadow mode before any new score becomes a production gate; and
5. measure story quality and audience response separately from thumbnail, topic,
   locale, and publication effects.

## 2. Scope And Assumptions

This plan assumes the repository's current Dark Truth profile is authoritative:
adult narrated horror, restrained dark-documentary delivery, no reliance on jump
scares, a focal subject, a primary threat, a discoverable rule, escalating sensory
evidence, a costly choice, and a memorable final image or line.

It covers:

- canonical English full-story generation;
- Short adaptation from an accepted canonical full story;
- prompt compilation, validation, analysis, cache identity, persistence, and
  focused tests; and
- an offline and production evaluation design.

It does not cover:

- free-form premise generation;
- changing factuality or invention boundaries;
- scene images, thumbnails, audio synthesis, or publishing;
- choosing a new narration speed; or
- claiming that a psychological finding directly proves YouTube retention.

The current profile says 175–185 WPM while current localization defaults use
different language-specific fast rates. That configuration conflict should be
resolved separately through an explicit product decision and is not evidence of
a horror-writing effect.

## 3. Research Findings And Operational Translation

The evidence below is useful but heterogeneous. It includes narrative-comprehension
experiments, media-psychology studies, a horror survey, a recreational-horror
field study, and reviews. None directly tests LLM-written, audio-first YouTube
horror. The implementation must therefore treat each translation as a testable
design hypothesis, not as a guaranteed performance improvement.

| Finding                                                                                                  | Evidence                                                                                                                                                                                                                                                                                                                                                                                                                                 | Implementation hypothesis                                                                                                                                                                                          | Guardrail                                                                                                                                          |
| -------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| Event order can produce suspense, curiosity, or surprise.                                                | Brewer and Lichtenstein distinguish event structure from discourse structure and describe affect-producing organizations ([1982](https://doi.org/10.1016/0378-2166%2882%2990021-2)). Hoeken and van Vliet found different discourse organizations changed affect and processing; suspense could persist when the ending was known and a surprising event was appreciated ([2000](https://doi.org/10.1016/S0304-422X%2899%2900021-2)).    | Give each canonical beat an intended affect and explicitly record what the audience knows, what the character knows, what is withheld, and when it pays off. Permit dramatic irony as well as outcome uncertainty. | Do not force a twist. A surprise must have source-supported setup and may not alter immutable facts or the established rule.                       |
| Suspense rises when viable solutions appear restricted.                                                  | Seven experiments found higher reported suspense when readers perceived fewer paths out of a dilemma ([Gerrig and Bernardo, 1994](https://doi.org/10.1016/0304-422X%2894%2990021-3)).                                                                                                                                                                                                                                                    | Track concrete protagonist responses and show how failed responses remove or worsen options while revealing useful information.                                                                                    | Never fabricate a response solely to satisfy a declining option count. Every response must be allowed by the source contract.                      |
| Curiosity depends on a salient information gap.                                                          | Loewenstein's review proposes curiosity as deprivation produced by a perceived gap in knowledge ([1994](https://doi.org/10.1037/0033-2909.116.1.75)).                                                                                                                                                                                                                                                                                    | Maintain an open-question ledger with opening beat, partial answers, due beat, and final resolution or intentional residual uncertainty.                                                                           | Limit simultaneous primary questions. Do not confuse vagueness with curiosity; the audience must know what it wants to learn.                      |
| Readers build coherent event models across time, space, protagonist, causality, and intention.           | The event-indexing model found narrative events connected in memory along those five dimensions ([Zwaan, Langston, and Graesser, 1995](https://doi.org/10.1111/j.1467-9280.1995.tb00513.x)).                                                                                                                                                                                                                                             | Record state transitions and causal predecessors for each beat. Validate unexplained discontinuities, missing goals, and effects without causes.                                                                   | A deliberate time or viewpoint jump is allowed when explicitly signaled; continuity does not mean chronological uniformity.                        |
| Absorption combines attention, imagery, and affect; engagement also includes understanding and presence. | Transportation was operationalized as imagery, affect, and attentional focus ([Green and Brock, 2000](https://doi.org/10.1037/0022-3514.79.5.701)). A later narrative-engagement scale separated understanding, attention, emotional engagement, and presence ([Busselle and Bilandzic, 2009](https://doi.org/10.1080/15213260903287259)).                                                                                               | Keep concrete viewpoint, sensory anchors, protagonist goals, and observable consequences. Review engagement as multiple dimensions rather than one generic "retention" score.                                      | Sensory density is not a proxy for immersion. Repeated adjectives or irrelevant detail should fail specificity checks.                             |
| Horror can be enjoyed through threat simulation and mixed positive/negative affect.                      | A horror-media survey supported a threat-simulation account and found audience differences in sensation seeking, imagination, and supernatural versus natural threat preference ([Clasen, Kjeldgaard-Christiansen, and Johnson, 2020](https://doi.org/10.1037/ebs0000152)). Horror-film studies found positive and negative feelings can co-occur within a protective frame ([Andrade and Cohen, 2007](https://doi.org/10.1086/519498)). | Center observable coping: perceive threat, choose a response, observe the result, update the rule, pay a cost. Keep fiction/disclosure and safety framing owned by metadata/profile policy.                        | The survey is correlational and does not justify demographic stereotyping. Use an explicit channel audience profile, not inferred personal traits. |
| Unknown threat is potent, but comprehensibility still matters.                                           | A broad clinical review argues that fear of the unknown may be fundamental to anxiety ([Carleton, 2016](https://doi.org/10.1016/j.janxdis.2016.03.011)).                                                                                                                                                                                                                                                                                 | Preserve uncertainty about scope, intent, or consequence while progressively establishing a usable rule.                                                                                                           | This is an indirect application. Never use it to justify incoherent mechanics or permanently withholding all causal information.                   |
| Recreational fear appears to have a "just right" range rather than a more-is-better relationship.        | A field study of 110 haunted-attraction visitors found an inverted-U relationship between local self-reported fear and enjoyment, with important limits on the overall measure ([Andersen et al., 2020](https://doi.org/10.1177/0956797620972116)).                                                                                                                                                                                      | Plan local rises, partial releases, and renewed escalation instead of uniform maximum intensity. Calibrate intensity by channel profile.                                                                           | A haunted-house result is not a narration timing rule. Do not encode a universal numerical tension curve or fixed scare interval.                  |

## 4. Current Repository Fit

The repository already implements several compatible ideas:

- `story-prompt-module-registry.ts` asks for an immediate impossible detail,
  concrete anchors, escalating experiments, emotional cost, a consistent rule,
  and a concrete final image;
- `professional-story-contracts.ts` models mechanics, failed experiments,
  12–16 professional beats, exit questions, climax foreshadowing, and editorial
  review;
- `story-mechanics.ts` provides canonical beats and a mechanics contract;
- `short-adaptation-contract.ts` preserves causal and retention boundaries for
  compression; and
- `story-production-analysis.ts` scores tension, pacing, clarity, emotional
  impact, originality, and ending quality.

The primary gaps are:

1. `RetentionBeat` is a generic four-item plan and affects little beyond legacy
   adaptation.
2. There is no explicit audience/character knowledge state, information-gap
   ledger, solution-space ledger, or affect payoff contract.
3. The beat model does not represent the five continuity dimensions.
4. Some mechanics and failed-response fields are heuristic fallback prose rather
   than source-grounded claims. The new strategy must carry provenance and
   confidence instead of strengthening invented placeholders.
5. Current analysis collapses several constructs into broad model-assigned
   scores and promotes fixed thresholds without a calibrated horror corpus.
6. Current prompt rules are strong but sometimes duplicate concerns without a
   single artifact that explains why each rule applies to a particular story.

## 5. Target Architecture

### 5.1 New `HorrorAffectPlan`

Add `packages/story-localization/src/horror-affect-plan.ts` with strict Zod
schemas and stable hashes. Keep it separate from `StoryIR`.

Minimum top-level fields:

- `schemaVersion` and `strategyVersion`;
- parent StoryIR, canonical-contract, mechanics, and beat hashes;
- target `format`, locale-independent profile ID, and intensity policy;
- `primaryAudiencePromise`;
- `openQuestions`;
- ordered `beatAffects`;
- `continuityTransitions`;
- `responseOptions`;
- `tensionShape`;
- `validation`;
- field-level `sourceRefs`, provenance, and confidence; and
- `planHash`.

Each open question should identify:

- the concrete question;
- opening beat;
- partial-answer beats;
- due beat;
- resolution type: `answered`, `reframed`, or `intentionally-residual`;
- answer or residual uncertainty; and
- supporting canonical facts.

Each beat affect should identify:

- canonical beat ID;
- primary mode: `suspense`, `curiosity`, `surprise`, `dread`, or `release`;
- audience knowledge before and after;
- protagonist knowledge before and after;
- immediate threat and stake;
- action and observable result;
- opened, advanced, and paid-off question IDs;
- viable response IDs before and after;
- continuity state for time, space, protagonist, cause, and goal;
- rule evidence or rule refinement;
- reversal setup references when applicable; and
- intended local intensity band: `low`, `medium`, or `high`.

Intensity bands are editorial categories, not physiological predictions.

### 5.2 Builder Boundary

Add a deterministic builder that consumes:

- `CanonicalStoryContract`;
- `StoryMechanicsContract`;
- canonical story beats;
- output constraints;
- Dark Truth profile policy; and
- explicit source provenance.

The builder may organize and classify existing facts. It may not invent an
escape attempt, motive, threat capability, rule, clue, or ending. When source
support is insufficient it must produce a typed `unknown` or blocking planning
issue. It must not convert fallback prose such as "the result narrows the rule"
into trusted evidence.

For the first version, use beat types and existing source references to create a
conservative plan:

- `HOOK`: open one concrete question and establish the threat;
- `WARNING`/`EVIDENCE`: increase curiosity or dread with partial evidence;
- `RULE_DISCOVERY`: pay a partial answer and open a consequence question;
- `FAILED_RESPONSE`: remove or degrade one source-backed option and reveal
  information;
- `EMOTIONAL_ESCALATION`: connect the threat to the protagonist's attachment;
- `CLIMAX`: use the established rule under the narrowest credible choice set;
- `AFTERMATH`: brief release only when present in the source; and
- `FINAL_REVERSAL`: pay off, reframe, or intentionally preserve one bounded
  uncertainty.

### 5.3 Prompt Compilation

Add one `horror-affect-plan` narration-owned prompt module in
`story-prompt-module-registry.ts`.

The module should:

- emit compact, selected beat directives rather than the entire artifact;
- state the knowledge delta, action, result, question transition, and intensity
  band for each selected beat;
- distinguish suspense, curiosity, and surprise;
- include only source-supported response narrowing;
- preserve current invention boundaries and immutable ending behavior;
- use the same selected-event and prompt-budget mechanisms as other modules; and
- include its strategy and plan fingerprints in prompt and cache identity.

Do not add a separate provider call to create the plan in version 1. Do not
allow affect instructions to enter localization as permission to rewrite the
accepted canonical story. Localization should preserve the accepted plan's
semantic effects while adapting language rhythm.

### 5.4 Full Versus Short

Full stories may carry multiple question/payoff cycles and local releases.
Shorts should project, not regenerate, the accepted full-story plan:

- retain one primary question;
- retain the central rule;
- retain one failed response or proof beat when duration allows;
- preserve the costly climax and canonical final consequence;
- compress secondary questions before removing causal steps; and
- recompute timing and selected-beat hashes.

Extend the existing Short adaptation contract rather than adding a parallel
Short-only horror schema.

### 5.5 Validation

Deterministic validation should check only observable contract properties:

- parent hashes and version compatibility;
- canonical beat coverage and ordering;
- question IDs open before they advance or resolve;
- no unresolved primary question unless marked intentionally residual;
- surprise setup references precede the reversal;
- response options cannot disappear without a source-backed result;
- each failed response produces a specific knowledge update;
- climax response and rule use were established earlier;
- state changes name a cause or an intentional discourse jump;
- full-to-Short plan projection preserves required facts and final consequence;
- no strategy field exceeds invention boundaries; and
- plan and prompt fingerprints invalidate stale cache entries.

Model-assisted or human review should evaluate:

- whether the information gap is interesting rather than merely absent;
- whether response narrowing feels credible;
- whether surprise is earned;
- whether tension and release feel well calibrated;
- whether viewpoint and concrete detail produce presence;
- whether the threat creates meaningful coping and emotional cost; and
- whether the ending produces payoff without explanatory aftermath.

These qualitative judgments must include paragraph/beat evidence. They should
remain advisory during shadow rollout.

## 6. Implementation Sequence

### Phase 0 — Baseline And Calibration Corpus

Files:

- add a small non-generated fixture corpus under the existing
  story-localization test fixture conventions;
- add a research rubric under `docs/development/`; and
- do not edit production prompts.

Tasks:

1. Select accepted full stories and Shorts covering fictional-supernatural,
   fictional-psychological, folklore, and at least one conservative
   evidence-led case.
2. Include deliberately weak fixtures for incoherent rules, vague questions,
   arbitrary option removal, unearned reversals, flat maximum tension, and
   broken causal transitions.
3. Record current prompt fingerprints, deterministic validation, analysis
   scores, word counts, and estimated provider cost.
4. Have reviewers make pairwise judgments using separate dimensions:
   understanding, suspense, curiosity, earned surprise, presence, emotional
   cost, ending payoff, and overall preference.

Exit criteria:

- fixtures have approved source and expected invariants;
- evaluators can apply the rubric consistently enough to diagnose
  disagreements; and
- no live provider call is required by the test suite.

### Phase 1 — Affect Schema, Builder, And Provenance

Files:

- add `packages/story-localization/src/horror-affect-plan.ts`;
- add `packages/story-localization/src/horror-affect-plan.unit.test.ts`;
- update exports;
- adapt `story-production.ts` so legacy `RetentionBeat` reads can coexist while
  new writes use the versioned plan; and
- update contract/cache version inputs.

Tasks:

1. Implement schemas, stable serialization, hashes, typed issues, and builder.
2. Make unknown/source-inferred/model-extracted provenance explicit.
3. Reject fabricated response narrowing and unsupported surprise setup.
4. Add a compatibility adapter from the old four-beat retention plan for reads
   only. Never assign it trusted v1 plan status.

Exit criteria:

- deterministic fixtures produce stable hashes;
- invalid question, response, and continuity transitions fail locally; and
- no story-generation behavior has changed.

### Phase 2 — Shadow Persistence And Inspection

Files:

- update `story-localization.service.ts`;
- update `story-localization-batch-service.ts`;
- update the canonical full artifact/cache lineage;
- add CLI inspection through the existing story inspect/status conventions; and
- add focused service and CLI tests.

Tasks:

1. Build and persist `horror-affect-plan.json` beside existing production
   planning artifacts.
2. Add rollout mode `off | shadow | enforce`, defaulting to `shadow`.
3. Surface invalid, stale, and current state without calling a provider.
4. Include the plan hash in downstream fingerprints only when prompt
   enforcement is enabled; shadow artifacts must not invalidate accepted
   narration.

Exit criteria:

- sync and batch paths create byte-stable equivalent plans;
- resume reports current plans and refreshes stale plans;
- legacy stories remain readable; and
- shadow mode changes no provider request.

### Phase 3 — Prompt Integration

Files:

- update `story-prompt-modules.ts`;
- update `story-prompt-module-registry.ts`;
- update `story-prompt-compiler.ts`;
- update prompt/compiler unit tests; and
- update preflight/cache fingerprint tests.

Tasks:

1. Add the compact affect-plan module and ownership checks.
2. Select only plan entries corresponding to admitted canonical events/beats.
3. Deduplicate current generic opening, experiment, and ending advice where the
   plan supplies a stronger story-specific instruction.
4. Include plan and strategy versions in prompt metrics, cache keys, and debug
   section-size reports.
5. Confirm prompt growth remains inside current budgets without reducing
   expected narration output.

Exit criteria:

- no extra provider request is introduced;
- prompt output is deterministic for a fixed plan;
- contradictory or stale plans block before the provider;
- full and Short schemas remain narration-only; and
- source-fidelity fixtures continue to pass.

### Phase 4 — Analysis V2 And Repair Scope

Files:

- update `story-production-analysis.ts` and its service;
- update analysis response/artifact schemas;
- update focused analysis tests; and
- update repair instructions only after analysis evidence is stable.

Tasks:

1. Add evidence-bearing dimensions for information-gap management, credible
   response narrowing, earned surprise, causal/goal continuity, threat coping,
   tension modulation, and presence.
2. Separate deterministic contract failures from model opinions.
3. Keep current production thresholds unchanged during shadow evaluation.
4. Permit targeted repair only when a finding names modifiable beat IDs and
   protected facts. Escalate to full regeneration for cross-story architecture
   failures.
5. Version every prompt, schema, gate, rubric, and cache dependency.

Exit criteria:

- the same structured response always yields the same deterministic verdict;
- every qualitative finding cites evidence;
- analysis cannot clear a hard source/lineage failure; and
- existing accepted artifacts are not silently reclassified.

### Phase 5 — Controlled Evaluation And Rollout

Tasks:

1. Compare baseline and affect-plan versions blindly on the calibration corpus.
2. Pre-register the primary metric and practical effect threshold before
   examining production results.
3. Run full and Short experiments separately.
4. Stratify by locale, genre policy, duration, and returning/new audience when
   sample size permits.
5. For YouTube, prioritize normalized audience-retention curves, early
   retention, average percentage viewed, and ending retention. Treat CTR as a
   thumbnail/title metric unless those variables are controlled.
6. Inspect drop-off locations against affect beats, but do not infer causality
   from a single episode.
7. Promote `shadow` to `enforce` only when:
   - no immutable-fact, rule, or ending regression appears in the approved
     corpus;
   - no extra generation call is added;
   - prompt/token cost remains within the agreed budget;
   - blind human evaluation improves on the pre-registered primary dimension;
   - production retention is not harmed at a practically meaningful level; and
   - failure and stale-cache behavior are operationally understood.

Rollback is configuration-only: switch to `shadow` or `off`, retain artifacts
for diagnosis, and do not rewrite accepted stories.

## 7. Focused Verification Budget

Inspect the root scripts and Vitest config before execution. The expected
implementation-time commands are:

```text
pnpm test:focused -- packages/story-localization/src/horror-affect-plan.unit.test.ts
pnpm test:focused -- packages/story-localization/src/story-prompt-compiler.unit.test.ts
pnpm test:focused -- packages/story-localization/src/story-production-analysis.unit.test.ts
```

After focused tests pass, run at most one affected-package typecheck:

```text
pnpm --filter @mediaforge/story-localization typecheck
```

CLI behavior should be checked with its exact unit test file rather than by
running the repository-wide CLI suite. No live OpenAI or YouTube call belongs in
verification.

## 8. Risks And Mitigations

| Risk                                             | Mitigation                                                                                        |
| ------------------------------------------------ | ------------------------------------------------------------------------------------------------- |
| Research is overgeneralized into rigid formulae. | Keep research claims, product hypotheses, and calibrated gates visibly separate.                  |
| More structure produces mechanical stories.      | Use affect categories and invariants, not fixed sentence templates or universal numeric curves.   |
| Heuristic source extraction is treated as fact.  | Require provenance/confidence and fail closed for unsupported mechanics.                          |
| Prompt size grows while output space shrinks.    | Emit selected deltas only, record section metrics, and enforce preflight budgets.                 |
| LLM self-scores become circular evidence.        | Use deterministic checks, blind human comparisons, and controlled audience metrics.               |
| Localization changes affect architecture.        | Preserve question, response, rule, climax, and payoff IDs while allowing natural language rhythm. |
| Shorts become incoherent through compression.    | Project one accepted question/payoff chain and validate causal closure after selection.           |
| Existing artifacts become stale unexpectedly.    | Shadow first; fingerprint the plan only when enforcement is active; explain staleness.            |
| Different audiences prefer different intensity.  | Use explicit versioned channel profiles and test segments; never infer individual psychology.     |

## 9. Decisions To Confirm Before Implementation

Repository evidence supports safe defaults, so these questions do not block this
plan. They should be confirmed before Phase 3:

1. Is the primary optimization target full-story completion, first-30-second
   retention, Short completion, or blind editorial quality?
2. Should the default intensity remain restrained/moderate for every Dark Truth
   story, or may an episode override it with approval?
3. Which existing published episodes may be used as the calibration corpus?
4. Is model-assisted analysis cost acceptable in shadow production, or should
   V2 analysis run only on an operator-selected sample?
5. What practical retention change is large enough to justify rollout?

## 10. Definition Of Done

- A versioned, source-grounded `HorrorAffectPlan` exists independently of
  `StoryIR`.
- Full and Short prompt compilers consume only relevant plan fragments.
- Unsupported mechanics and surprises fail closed before provider execution.
- Deterministic and subjective validation are separate.
- Cache, persistence, sync/batch equivalence, resume, and staleness are tested.
- Existing fidelity, final-line, Unicode, word/duration, and lineage gates still
  pass.
- Shadow evaluation has a documented baseline and blind human rubric.
- Production rollout has pre-registered success criteria and a configuration-only
  rollback.
