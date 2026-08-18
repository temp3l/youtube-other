# ChatGPT review request: 01A S02-B01 deterministic diagram

Act as a strict source-grounded YouTube Shorts visual editor and admission reviewer. Review the actual pixels in `images/01-prototype.png`; do not infer a PASS from filenames, manifests, prior approvals, or local checks.

## Decision requested

Return exactly one verdict:

- `APPROVE_PROTOTYPE`
- `APPROVE_WITH_REQUIRED_EDITS`
- `REJECT_MODALITY`

The decision concerns the exact prototype PNG hash `5e11f15cee0b397ad8bbcd2b8d897ae8ca91764f65e728deb218a0dc7cde5bbe` as a potential S02-B01 modality canary. It does not authorize provider calls, rendering, or publication.

## Required pixel-level review

Assess whether a muted viewer can understand within 1–2 seconds that:

1. exactly one sale/value block enters from the left;
2. the same continuous value path becomes smaller through separated cost-removal gates;
3. each gate removes a visible fragment rather than creating extra value;
4. exactly one final remnant exits and is unmistakably smaller than the input;
5. causal direction and economic polarity are correct;
6. no narration, labels, arrows, currency symbols, or hidden context are required to decode it.

Also assess source fidelity, visual thesis, composition hierarchy, 9:16 readability, subtitle-safe space, text/logo/UI leakage, accidental person or Veronica likeness, occupational drift, decorative abstraction, and visual quality.

Compare against `images/02-adjacent-s01-b02.png`: the prototype must be materially distinct while remaining compatible with the approved warm-paper/coral/ink/glass/unfinished-wood visual language. Use `images/03-latest-failed-provider-s02.png` only to understand the ambiguity the prototype is intended to solve.

## Strict rules

- Inspect pixels before reading manifest conclusions.
- Do not treat mathematical conservation in metadata as proof that viewers perceive conservation.
- Do not relax must-show coverage because numeric scores are high.
- Do not require an on-image legend or readable text.
- Do not rewrite narration.
- Do not propose another photorealistic retry unless the diagram modality is fundamentally unsuitable.

## Response format

Return one JSON object matching `REVIEW_RESPONSE_SCHEMA.json`, followed by at most 150 words explaining the verdict. For every failed criterion, give one concrete pixel-level reason and the smallest deterministic edit. If no edit is required, `requiredEdits` must be empty.
