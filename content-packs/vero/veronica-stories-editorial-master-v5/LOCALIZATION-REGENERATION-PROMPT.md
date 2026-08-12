> **v5 status:** Localization has been regenerated and QA-checked. This prompt is retained as the reproducible regeneration policy for future canonical English changes.

# Codex prompt — regenerate Veronica localized stories from editorial master v4

Take the role of a Senior Multilingual YouTube Editorial Localization Engineer, Spoken-Language Script Editor, and Production QA Lead.

## Goal

Regenerate the DE, FR, IT, and PT Veronica story scripts from the approved English editorial master v4 in this pack.

The English files in:

- `long/en/`
- `shorts/en/`

are the canonical semantic source of truth.

Do not use the previous DE/FR/IT/PT scripts as the translation source. They are stale and previously showed semantic compression and timing drift.

## Non-negotiable semantic requirements

For every localized script:

1. Preserve the complete thesis, causal chain, examples, warnings, practical diagnostics, and final payoff of the English master.
2. Do not summarize or compress the English master merely to make the translation concise.
3. Do not add new factual claims, research, statistics, named authorities, or unsupported examples.
4. Localize naturally for spoken YouTube narration; do not perform rigid sentence-by-sentence literal translation.
5. Preserve the editorial identity of each episode so the six stories do not collapse into generic variations of “be consistent and repeat your positioning.”
6. Preserve strong hooks, rhetorical contrast, escalation, and closing payoff.
7. Keep narration TTS-friendly: no section headings, markdown headings, tables, stage directions, citations, or production notes inside narration files.
8. Maintain natural paragraph breaks for narration editing.
9. Avoid translationese, unnatural Anglicisms, excessive nominalization, and sentence structures that sound written rather than spoken.
10. Preserve examples when they are semantically important. Adapt only wording that is linguistically unnatural; do not replace the scenario with a materially different one.

## WPM planning policy

Use these WPM values only as pre-audio planning estimates:

- DE long: 145 WPM
- EN/FR/IT/PT long: 150 WPM
- DE Shorts: 150 WPM
- EN/FR/IT/PT Shorts: 155 WPM

Long-form target runtime:

- 09:30–10:30

Short-form target runtime:

- **01:30 target**
- preferred pre-TTS planning band: **01:27–01:33**
- do not treat 01:00 as an acceptable target merely because it is technically a YouTube Short

Approximate planning bands:

- DE long: 1,378–1,523 words
- FR/IT/PT long: 1,425–1,575 words
- DE Shorts: target ~225 words; preferred 218–233 words
- FR/IT/PT Shorts: target ~233 words; preferred 225–240 words

Do not pad scripts with redundant restatement just to hit a word count. Add or preserve meaningful explanatory beats, examples, consequences, diagnostics, or payoff language. Natural spoken quality and semantic completeness are hard requirements.

Once selected TTS audio exists, selected-audio duration becomes canonical and overrides WPM estimates. If a natural translation falls outside the preferred word band but selected audio is close to 01:30, prefer the audio result.

## Locale-specific quality requirements

### German

- Use contemporary spoken standard German.
- Prefer direct verbal constructions over bureaucratic nominalizations.
- Preserve punchy sentence fragments where they improve pacing.
- Target about 225 spoken words without padding.

### French

- Use natural contemporary spoken French suitable for a professional YouTube audience.
- Avoid overly formal written constructions.
- Do not compress examples or causal explanations merely to keep sentences elegant.
- Target about 233 words as a planning estimate.

### Italian

- Previous Italian versions were especially over-compressed. Treat semantic completeness and ~90-second duration as hard QA concerns.
- Use natural spoken Italian with clear rhythm and short-to-medium sentence length.
- Do not reduce multi-step reasoning into a single sentence.
- Target about 233 words as a planning estimate.

### Portuguese

- Use natural contemporary Portuguese consistently with the locale conventions already configured by the repository.
- Preserve causal connectors and practical examples; do not summarize them away.
- Target about 233 words as a planning estimate.

## Required QA

For each localized file, record:

- source English path;
- target path;
- locale;
- source word count;
- target word count;
- configured WPM;
- estimated duration;
- distance from the 01:30 target for Shorts;
- timing PASS/FAIL;
- semantic parity PASS/FAIL;
- hook preserved PASS/FAIL;
- key example coverage PASS/FAIL;
- actionable takeaway preserved PASS/FAIL.

Semantic parity must be checked by beats, not by raw word-count ratio.

A localized script fails if any important causal step, example, counterargument, diagnostic, or payoff from the canonical English version disappears.

For Shorts, timing PASS should normally require an estimated 01:27–01:33 before audio. A documented exception is allowed only when a natural, semantically complete translation would be harmed by forcing the word count.

## Cross-locale invariants

For the same story ID, every locale must communicate the same:

- central problem;
- thesis;
- mechanism;
- main example(s);
- counterargument or warning where present;
- recommended action;
- final conceptual payoff.

Word choice and sentence order may differ naturally.

## Output

Write regenerated scripts to the normal repository locale paths for:

- `long/de`, `long/fr`, `long/it`, `long/pt`
- `shorts/de`, `shorts/fr`, `shorts/it`, `shorts/pt`

Do not modify the approved English v4 master except for an objectively necessary typo fix. If such a fix is necessary, report it explicitly rather than silently changing the source.

Also generate:

- a machine-readable localization QA report;
- a concise human-readable summary listing every timing or semantic failure;
- before/after word-count and estimated-duration comparisons against the stale localized pack if it is available.

## Acceptance gate

The regeneration is accepted only when:

- all 24 scripts exist in each target locale;
- all localized scripts pass semantic-parity QA;
- all long scripts pass the 09:30–10:30 planning window, or an explicit documented exception exists;
- all Shorts actively target approximately 01:30 and normally fall inside 01:27–01:33 before audio;
- there are no obvious translation artifacts or language-mixing defects;
- the English v4 master remains unchanged;
- the resulting files are ready for TTS generation and selected-audio timing validation.

Do not run image generation, TTS generation, video rendering, upload, or unrelated repository-wide tests as part of this task.
