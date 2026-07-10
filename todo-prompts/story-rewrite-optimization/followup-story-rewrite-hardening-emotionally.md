You are working in the existing MediaForge / YouTube horror-story production codebase.

This is a follow-up task. A previous implementation already attempted to reduce rewrite/localization cost and improve quality. Do not replace that work with a parallel system. First inspect the existing implementation, then extend or correct it.

Goal:
Audit and harden the localization cache, story fact extraction, rewrite prompts, localization prompts, Shorts prompts, validators, and targeted repair behavior so the pipeline no longer produces generic template-shaped stories, abstract localizations, missing story objects, weak supernatural rules, or emotionally flat climaxes.

Important observed failures:

- The localization cache can store the episode title as the setting.
  Bad:
  "setting": "They Found a Hook Hanging From the Car Door"

  Expected:
  Concrete locations such as wooded reservoir, parked car, lovers' lane, petrol station, bedroom door.

- Object-driven stories can have empty keyObjects.
  Bad:
  "keyObjects": []

  Expected for Episode 027:
  hook, car door, radio, door locks, phone, dashcam, evidence bag, bedroom door.

- The antagonist/threat can be extracted as a copied opening sentence.
  Bad:
  "The radio warned that an escaped killer had a metal hook for a hand."

  Expected:
  A concrete supernatural mechanism, e.g. an impossible hook / duplicate-Noah phenomenon that uses the radio warning, locked doors, familiar voices, and hesitation to manipulate who belongs inside or outside the car.

- The primary reveal can be generic scaffold text.
  Bad:
  "The only remaining plan depended on the rule revealed by the earlier evidence."

  Expected:
  A concrete story reveal, e.g. dashcam footage shows Noah outside the car scraping the door while another Noah remains behind the wheel, or the hook proves the threat was trying to keep the wrong Noah from getting out.

- The extracted rules can be template transitions instead of supernatural rules.
  Bad:
  "That explanation lasted only until the next night."
  "The evidence did not explain the event..."
  "The rule was narrow enough to offer hope..."

  Expected:
  One clear, concrete, story-specific supernatural rule.

- German localization can become generic filler:
  "Die Geschichte beginnt..."
  "Die Bedrohung folgt einer Regel..."
  "Später erscheint ein letzter Beweis..."
  "Alle Hinweise stehen im Zusammenhang..."

- Full rewrites can contain repeated scaffold paragraphs and duplicate late-stage repair insertions.

- Shorts can become outlines or summaries instead of narrated horror scenes.

Required implementation:

1. Inspect the current pipeline

Trace:

- canonical English rewrite
- source analysis / fact extraction
- story bible creation
- originality review
- protected elements
- retention plan
- localization
- Shorts generation
- validation
- targeted repairs
- cache read/write
- prompt/debug logging if present

Identify where generic scaffold text enters prompts, caches, validators, or generated outputs.

Do not create a second quality-gate system. Extend the existing one.

2. Harden localization cache identity

Update cache identity so stale or low-quality fact extraction cannot survive prompt/schema/model changes.

Cache identity or metadata must include:

- source narration hash
- prompt template hash
- extractor implementation version
- schema version
- model name
- reasoning effort
- locale
- variant: full or short
- quality-gate version
- protected-elements version where relevant

Old cache entries that lack these fields must be treated as stale or invalid.

Do not crash existing episodes unnecessarily. Invalidate safely and write a clear report entry when stale cache is ignored.

3. Harden story fact extraction

Fact extraction must produce concrete story facts, not prompt scaffold prose.

Required fact fields, if not already present:

- episodeNumber
- primaryTitle
- protagonistNames
- supportingCharacters
- concreteLocations
- keyObjects
- threatMechanism
- threatMotifs
- criticalEvents
- writtenMessages
- supernaturalRule
- protagonistAttachment
- threatTemptation
- emotionalCost
- finalDecision
- primaryReveal
- finalConsequence
- forbiddenInventions
- localizationPreservationRules

Validation rules:

- Fail if setting equals title or source title.
- Fail if concreteLocations is empty.
- Fail if object-driven stories have empty keyObjects.
- Fail if threat, antagonist, or centralThreat is only a copied opening sentence.
- Fail if primaryReveal, requiredFinalReveal, keyRules, or protectedElements contain scaffold/template text.
- Fail if there is no concrete supernatural rule.
- Fail if there is no concrete protagonist emotional attachment before the climax.
- Fail if there is no emotionally costly final decision.
- Fail if forbidden inventions appear in extracted facts or generated output.

For Episode 027, expected facts include:

- protagonist:
  Noah Brooks

- concreteLocations:
  wooded reservoir
  parked car
  lovers' lane
  petrol station
  bedroom door

- keyObjects:
  hook
  car door
  radio
  door locks
  phone
  dashcam
  evidence bag
  bedroom door

- threatMechanism:
  an impossible hook / duplicate-Noah phenomenon that uses the radio warning, locked doors, familiar voices, and hesitation to manipulate who belongs inside or outside the car

- supernaturalRule:
  do not unlock the car or respond to familiar voices outside; the threat uses recognition and hesitation to swap who belongs inside

- primaryReveal:
  dashcam footage shows Noah outside the car scraping the door while another Noah remains behind the wheel

- finalConsequence:
  Noah realizes the warning may not have been about keeping the killer out, but about keeping the wrong person from getting out

- emotionalCost:
  Noah must refuse a familiar or loved voice, or reject a comforting explanation, even though doing so feels cruel, disloyal, or cowardly

4. Add the emotional-cost story contract

Update rewrite prompts, localization prompts, Shorts prompts, validators, and targeted repair prompts with this contract:

The protagonist's final decision must carry a clear emotional cost.

Do not let the protagonist win only by being clever, lucky, observant, or by solving a puzzle. Before the climax, establish something the protagonist cares about: a person, promise, identity, duty, memory, belief, guilt, or source of shame.

In the final decision, survival must require sacrificing, refusing, betraying, destroying, abandoning, or accepting the loss of part of that attachment.

The emotional cost must be concrete and story-specific.

Good examples:

- The protagonist must ignore a familiar voice begging for help because answering is the supernatural trap.
- The protagonist must abandon proof that would clear their name in order to escape alive.
- The protagonist must destroy the only recording that proves what happened.
- The protagonist must leave behind someone or something they promised to protect.
- The protagonist must accept that the person they saved may not be the original person anymore.
- The protagonist must choose the painful rule over the comforting lie.

Bad examples:

- "He was scared but kept going."
- "She made a difficult choice."
- "The decision cost him everything."
- "He realized the truth."
- "She chose survival."

Every climax must answer:

1. What does the protagonist want emotionally?
2. What does the supernatural threat offer or imitate to exploit that desire?
3. What exactly must the protagonist give up, refuse, destroy, abandon, betray, or accept to survive?

If the story does not contain a visible emotional cost before the final reveal, validation must fail or return REPAIRABLE.

5. Add emotional-cost validation

Add deterministic and/or validator-model checks:

Return PASS only if:

- A personal attachment is established before the climax.
- The final choice forces the protagonist to lose, refuse, abandon, destroy, betray, or accept something meaningful.
- The cost is specific to the story object, location, rule, or threat.
- The final consequence leaves emotional damage, not only physical escape.

Return REPAIRABLE if:

- The story has a usable climax, but the attachment or cost is underdeveloped.
- A targeted repair can add the emotional cost without changing the plot.

Return FAIL if:

- The ending is only puzzle-solving.
- The protagonist simply escapes.
- The final reveal is only exposition.
- The cost is vague fear, confusion, stress, or "the truth changed everything."

6. Add concrete escalation validation

Every escalation beat must be specific to the story object, location, threat behavior, supernatural rule, or sensory motif.

Reject generic escalation language such as:

- "The pattern became worse."
- "The danger became personal."
- "The first real warning came..."
- "What followed changed everything."
- "The apparent ending did not survive..."
- "The final piece of evidence arrived later."
- "The story begins..."
- "The threat follows a rule..."
- "All clues are connected to..."
- "Alle Hinweise stehen im Zusammenhang..."
- "Die Geschichte beginnt..."
- "Die Bedrohung folgt einer Regel..."
- "Später erscheint ein letzter Beweis..."

A full story must have:

- a concrete impossible detail in the first 20 seconds
- visual action in the first 20 seconds
- early appearance of the central object/location
- at least 3 story-specific escalation beats
- recurring sensory motifs at major escalation points
- one visible supernatural rule
- an emotionally costly final decision
- a concrete final reveal

7. Add repetition/template detection

Implement deterministic checks for:

- exact duplicate paragraphs
- near-duplicate paragraphs after normalization
- repeated scaffold sentences
- repeated "all clues connect to X" filler
- repeated late-stage repair insertions
- story title used as a generic anchor instead of a natural story element

Normalization should ignore whitespace, casing, Markdown differences, and minor punctuation differences.

If duplicate narrative paragraphs are found:

- reject before localization
- attempt targeted repair once if safe
- otherwise fail the story and do not overwrite a previous good artifact

8. Harden localization

Localization must translate/adapt the approved canonical story, not regenerate a generic story from weak facts.

Localization must preserve:

- protagonist names unless explicit localization config says otherwise
- concrete objects
- concrete locations
- written messages
- supernatural rule
- emotional cost
- final decision
- primary reveal
- final consequence

Localization must reject:

- invalid story-bible/cache input
- generic filler
- missing key objects
- renamed protagonists
- invented devices
- invented mechanics
- fewer concrete anchors than the source
- abstract summary-style narration

German localization must reject:

- "Die Geschichte beginnt an einem scheinbar gewöhnlichen Ort."
- "Licht, Türen und Geräusche wirken normal."
- "Die Bedrohung folgt einer Regel."
- "Später erscheint ein letzter Beweis."
- "Die Warnung der Geschichte gilt deshalb..."
- repeated "Alle Hinweise stehen im Zusammenhang..."

9. Harden Shorts generation

Shorts must be narrated horror scenes, not outlines.

Requirements:

- target 50–70 seconds unless project config says otherwise
- start immediately with a concrete impossible detail
- include protagonist name
- include object
- include location
- include threat behavior
- include one clear supernatural rule
- include compressed emotional cost
- end with a concrete final sting
- preserve canonical names and objects
- do not invent new devices, characters, or mechanics

Reject Shorts that read like:

- "The story begins..."
- "The threat follows a rule..."
- "The final evidence appears..."
- "The warning applies to more than the original protagonist..."

For Episode 027, a good Short should include:

- radio warning
- Noah Brooks
- wooded reservoir or parked car
- metallic scraping on the car door
- self-call or familiar voice warning not to unlock
- dashcam duplicate Noah
- hook disappearing from evidence
- hook hanging from bedroom door, or final implication that the threat was keeping the wrong Noah from getting out
- Noah's emotional cost: refusing the familiar voice / refusing the comforting explanation / choosing not to unlock even though it feels cruel

10. Add targeted repair behavior

Do not solve every quality failure with a full expensive rewrite.

Use targeted repairs for:

- missing emotional cost
- weak protagonist attachment
- generic first 20 seconds
- missing concrete objects
- abstract escalation
- duplicate paragraphs
- scaffold phrase leakage
- localization drift
- Short outline-to-scene conversion

Repair constraints:

- use the cheapest configured repair/validator model where safe
- keep repair max output tokens small
- repair only the broken section where possible
- preserve approved story facts
- rerun validation after repair
- limit repair attempts to avoid cost spirals
- never overwrite a good previous artifact with a worse repaired artifact

11. Add regression fixtures and tests

Use fixtures only. Do not make paid API calls in tests.

Add regression fixtures for Episode 027 bad cache/output cases:

- title-as-setting
- empty keyObjects
- sentence-as-threat
- scaffold primaryReveal
- scaffold keyRules
- generic protectedElements
- missing emotional cost
- German output with repeated "Alle Hinweise stehen im Zusammenhang..."
- English full output with duplicated late paragraphs
- Short that changes Noah Brooks to Adrian or Adrian Cole
- Short that invents Funkgerät
- Short that is an abstract outline instead of a narrated scene

Expected tests:

- invalid cache is rejected
- stale cache is invalidated
- object-driven stories cannot have empty keyObjects
- setting cannot equal title
- threat cannot be copied opening sentence
- primaryReveal cannot be generic scaffold text
- keyRules cannot be scaffold transitions
- emotional cost is required
- duplicate paragraphs are rejected
- generic localization filler is rejected
- Shorts preserve canonical names, objects, rules, and emotional cost
- no paid providers are called during tests

12. Update prompt templates

Update all relevant prompt builders/templates consistently:

- canonical English rewrite prompt
- source-analysis / fact extraction prompt
- story-bible prompt
- protected-elements prompt
- retention-plan prompt
- localization prompt
- Shorts prompt
- validator prompt
- targeted-repair prompt

Do not include generic outline examples that the model may copy into narration.

Replace abstract examples with concrete scene-based examples.

13. Update reports

Write a concise implementation report following the repository's existing reports convention.

Include:

- root cause
- files changed
- invalid cache fields found
- prompt templates updated
- validators added
- targeted repair behavior added
- regression fixtures added
- commands run
- whether paid API calls were avoided during tests
- remaining risks

Acceptance criteria:

- Existing quality-gate system is extended, not duplicated.
- Cache identity includes prompt/schema/model/validator dependencies.
- Invalid old cache entries are rejected or invalidated safely.
- Story fact extraction rejects title-as-setting.
- Object-driven stories cannot have empty keyObjects.
- Scaffold text cannot become protected canonical truth.
- Rewrite prompts require concrete first-20-second hooks.
- Rewrite prompts require story-specific escalation beats.
- Rewrite prompts require one clear supernatural rule.
- Rewrite prompts require an emotionally costly final decision.
- Localization rejects generic filler and preserves canonical facts.
- Shorts are narrated scenes, not outlines.
- Episode 027 bad outputs/caches fail tests.
- Tests run without paid API calls.
- Typecheck/lint/tests pass according to available project commands.
- Implementation report is written.

Recommended Codex workflow:

First inspect the current implementation and produce a minimal patch plan.
Then implement the smallest cohesive change set.
Prefer deterministic validation and fixtures over extra model calls.
Do not broaden the refactor beyond rewrite/localization/Shorts/cache/validation.
Do not change rendering, image, audio, or metadata behavior unless required by tests.
Preserve strict TypeScript typing and production-safe error handling.
