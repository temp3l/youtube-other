# Codex Follow-up Prompt — Add Missing Story Quality Gates After Rewrite Cost Fix

You are working in the MediaForge / YouTube story pipeline codebase.

Context:
A previous Codex task already implemented the rewrite cost/quality foundation: cheaper routing, canonical facts, Shorts validation, targeted repairs, metadata idempotency, and basic quality reports. Do not redo that work. Treat the current repository state as the source of truth and extend it safely.

Goal:
Add the missing story-quality controls that make rewritten horror scripts less generic, more specific, more cinematic, and more reliable for YouTube retention, without increasing paid OpenAI usage.

Primary priorities:
1. Remove repeated template paragraphs.
2. Make every escalation specific to the story object, location, motif, rule, or threat.
3. Strengthen the first 20 seconds of full stories and Shorts.
4. Reduce abstract explanation.
5. Add concrete sensory beats.
6. Make the protagonist’s final decision emotionally costly.
7. Preserve one clear supernatural rule per story.

Hard constraints:
- Do not make paid OpenAI/API/network calls during tests or verification.
- Extend the existing implementation from the previous task; do not replace the whole rewrite pipeline.
- Preserve existing CLI behavior unless tests prove a safer replacement.
- Prefer deterministic validation and deterministic cleanup before model-based repair.
- Use targeted repair only for failing segments, not full regeneration.
- Keep all new types explicit, readonly where appropriate, and aligned with existing project conventions.
- Add tests first or alongside implementation for every new gate.
- Write an implementation report under the existing docs/reports convention.

## Step 1 — Inspect the current implementation

Review the current code added by the previous rewrite cost/quality task. Identify the existing locations for:
- canonical story facts extraction;
- story quality findings / quality gate result types;
- Shorts generation prompts;
- full rewrite prompts;
- localization prompts;
- targeted repair orchestration;
- generation reports;
- story/episode fixtures and tests.

Do not create duplicate parallel systems if equivalent types or modules already exist. Extend the existing modules.

## Step 2 — Extend quality finding codes

Add or extend quality finding codes for:

- `REPEATED_TEMPLATE_PARAGRAPH`
- `GENERIC_ESCALATION`
- `WEAK_FIRST_20_SECONDS`
- `EXCESSIVE_ABSTRACTION`
- `LOW_SENSORY_DENSITY`
- `LOW_DECISION_COST`
- `MULTIPLE_OR_UNCLEAR_SUPERNATURAL_RULES`

Use the existing enum/union/registry style. Ensure findings include:
- severity;
- code;
- message;
- evidence snippet;
- paragraph index or section identifier where available;
- repairability classification if the project already models this.

## Step 3 — Detect repeated template paragraphs

Implement deterministic detection for reusable generated scaffolding.

Flag newly generated artifacts when multiple paragraphs rely on generic structure such as:
- “At first, the report sounded like...”
- “By the next night, the pattern...”
- “The first real warning came...”
- “Those tricks did not explain...”
- “The calls became more immediate...”
- “The final piece arrived...”
- “Nothing in the final record explained...”
- German equivalents such as “Zuerst klang der Bericht...”, “In der nächsten Nacht sah das Muster...”, “Die erste klare Warnung...”, “Das letzte Puzzlestück...”

Also add normalized paragraph-shape detection:
- lowercase text;
- strip protagonist names, locations, numbers, dates, and obvious story-specific nouns from canonical facts;
- reduce remaining text to structural tokens;
- compare against known template patterns;
- flag if two or more paragraphs in one artifact are template-like.

Do not fail legacy accepted fixtures just because they contain one known phrase. Fail or mark repairable when the output has repeated scaffold behavior.

## Step 4 — Require story-specific escalation

For each escalation paragraph or beat, require at least one anchor from `CanonicalStoryFacts`:
- protagonist name;
- location anchor;
- object anchor;
- threat motif;
- supernatural rule;
- final reveal or final sting dependency.

Flag escalation paragraphs that could be pasted into another horror story with only the name changed.

For Episode 025-style fixtures, valid anchors include:
- Arin Caldor;
- condemned office floor;
- shopping-center service corridor;
- yellow rooms;
- fluorescent buzzing;
- wet carpet;
- internal office phone;
- red door;
- rooms copying expectation;
- new underground level labelled Arin Caldor.

## Step 5 — Add a first-20-seconds quality gate

Add a gate for both full stories and Shorts.

Approximate the first 20 seconds as:
- full English/German narration: first 55–70 words;
- Shorts: first 35–55 words.

The opening window must contain:
- the protagonist or immediate viewpoint;
- the impossible detail;
- the exact story location/object;
- at least one sensory image;
- no generic setup sentence before the hook.

Reject or mark repairable when the opening starts with background explanation, abstract framing, or reusable documentary setup before the impossible detail.

For Episode 025, a strong opening should quickly include the impossible office floor/backrooms, the maintenance door or shopping center, and a sensory anchor such as wet carpet, yellow rooms, fluorescent buzzing, or ringing phones.

## Step 6 — Add abstraction-density checks

Create a deterministic abstraction-density check.

Track abstract labels such as:
- pattern;
- evidence;
- rule;
- danger;
- situation;
- attempt;
- event;
- phenomenon;
- explanation;
- decision;
- meaning;
- warning;
- German equivalents: Muster, Beweise, Regel, Gefahr, Situation, Versuch, Ereignis, Erklärung, Entscheidung, Bedeutung, Warnung.

Do not ban these words globally. Penalize paragraphs where multiple abstract labels appear without concrete nearby anchors from facts or sensory terms.

Repair guidance should ask the model to convert abstract explanation into scene-level action.

Example bad:
“The pattern became dangerous because every decision gave the place more to work with.”

Example better:
“When Arin pictured the exit, three green signs lit up at once, all pointing toward the same red door.”

## Step 7 — Add sensory-density checks

For full stories, require concrete sensory beats across major sections. Track at least:
- sound;
- smell;
- touch or temperature;
- visual texture or light;
- movement or spatial distortion.

For Shorts, require at least three concrete sensory or physical details in the narration body.

Episode 025-valid sensory beats include:
- fluorescent buzzing;
- wet carpet under boots;
- damp smell;
- yellow rooms;
- ringing internal phone;
- breathing through the receiver;
- furniture scraping or shifting;
- lights cutting out.

Flag outputs that summarize events without physical texture.

## Step 8 — Add final-decision emotional-cost checks

The climax must show what the protagonist risks or sacrifices by making the final choice. Acceptable costs include:
- abandoning a trusted voice;
- giving up the visible rescue path;
- losing proof;
- risking identity, memory, safety, or another person;
- knowingly choosing the less emotionally comforting option.

For Episode 025, Arin’s final decision is emotionally costly if opening/refusing the red door may abandon a future version of himself, ignore a voice begging for help, or give up the safest-looking route because it may be the trap.

Flag endings where the protagonist simply executes a plan without an emotional tradeoff.

## Step 9 — Preserve exactly one clear supernatural rule

The generated story should expose one central supernatural rule clearly enough that the viewer can repeat it.

For Episode 025, the rule should resolve to one shared mechanic, for example:
- the rooms copy expectation;
- the place changes when Arin lets it choose his destination;
- chasing the offered exit, phone, or figure gives the place control.

Do not allow disconnected mechanics to accumulate as independent rules. Maps, doors, lights, reflections, names, phones, or radios may appear only if they serve the same central mechanic.

Flag outputs with multiple unrelated rules or unclear rule drift.

## Step 10 — Update generation and repair prompts

Update full rewrite, localization, and Shorts prompts to include concise quality instructions:

```text
Write a narratable horror script, not a summary.
Remove reusable template paragraphs.
Each escalation must be specific to this story’s object, location, sensory motif, and supernatural rule.
The first 20 seconds must contain the impossible detail, the location/object, and a sensory hook.
Prefer concrete sensory action over abstract explanation.
Do not explain that a pattern is dangerous; show one specific way it becomes dangerous.
The protagonist’s final decision must cost something emotionally.
Preserve exactly one central supernatural rule and make it legible to the viewer.
Do not invent mechanics that are not in the canonical facts.
```

For Shorts prompts, also add:

```text
The Short must feel like a complete horror scene with a hook, escalation, choice, consequence, and final sting.
Do not use story-structure labels such as “the first warning,” “the final evidence,” or “what followed.”
```

Keep prompts compact. Do not add huge instruction blocks that increase token cost unnecessarily.

## Step 11 — Targeted repair behavior

Extend targeted repair planning so each new quality finding maps to the smallest safe repair scope:

- `WEAK_FIRST_20_SECONDS`: first one or two paragraphs only.
- `REPEATED_TEMPLATE_PARAGRAPH`: flagged paragraphs only.
- `GENERIC_ESCALATION`: flagged escalation paragraph only.
- `EXCESSIVE_ABSTRACTION`: affected paragraph or section only.
- `LOW_SENSORY_DENSITY`: affected section only.
- `LOW_DECISION_COST`: climax and final sting only.
- `MULTIPLE_OR_UNCLEAR_SUPERNATURAL_RULES`: rule-reveal section plus any competing mechanic sentence.

Repair prompts must include:
- canonical facts;
- failing quality codes;
- paragraph indexes;
- short evidence snippets;
- strict instruction to preserve protagonist names, word-count range, title, metadata, central rule, and final reveal.

## Step 12 — Tests and fixtures

Add fixtures and tests for:
- repeated template paragraph detection;
- generic escalation paragraph detection;
- weak first-20-seconds opening;
- excessive abstraction;
- low sensory density;
- emotionally flat final decision;
- multiple unclear supernatural rules;
- repair-plan construction for each finding;
- no real provider/network calls during tests.

Use Episode 025-style fixtures, but do not hard-code only Episode 025. The heuristics should work across object/location-based horror stories and urban legends.

## Step 13 — Reporting

Extend generation reports with a `storyQuality` section, or extend the existing report shape if already present:

```json
{
  "storyQuality": {
    "first20Seconds": "PASS | REPAIRABLE | FAIL",
    "templateParagraphs": 0,
    "genericEscalationFindings": 0,
    "abstractionDensity": 0.0,
    "sensoryBeatCount": 0,
    "finalDecisionCost": "PASS | REPAIRABLE | FAIL",
    "supernaturalRuleClarity": "PASS | REPAIRABLE | FAIL"
  }
}
```

Include precise evidence snippets for every finding.

## Verification

Run relevant existing checks. Prefer repository scripts. At minimum, run:
- typecheck;
- unit tests for story quality gates;
- unit tests for targeted repair planning;
- lint if available;
- any existing dry-run story CLI tests that do not call paid providers.

Do not make paid OpenAI calls. Mock provider responses.

## Deliverables

- Extended quality-gate implementation.
- Updated full rewrite/localization/Shorts prompts.
- Targeted repair mappings for new findings.
- Tests and fixtures.
- Updated docs for story-quality gates and cost-safe generation.
- Implementation report listing changed files, checks run, deterministic gates added, repair scopes added, and remaining risks.

## Final response format

When finished, report:
1. Changed files.
2. New quality gates added.
3. New tests/fixtures added.
4. Verification commands run and results.
5. Any remaining risks or follow-up recommendations.
