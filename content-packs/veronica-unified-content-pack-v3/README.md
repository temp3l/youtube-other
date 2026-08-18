# Veronica Unified Content Pack v2

A deduplicated, publication-reviewed Veronica series pack.

## Canonical production corpus

- **18 unique long-form stories**
- **36 unique Shorts**
- **54 unique story IDs**
- **18 release episodes**, each with **1 Long + 2 Shorts**
- Canonical editorial language: **English**

## v2 publication gate

- Canonical English editorial score: **54/54 strictly > 9.5/10**
- Minimum canonical English score: **9.6/10**
- Canonical English pre-TTS timing: **54/54 PASS**
- Shorts target: ~01:30 at configured WPM
- Longs target: ~10:00 at configured WPM
- Final timing authority after TTS: selected decoded audio

## What changed from v1

Twelve stories that previously scored <=9.5 were surgically remediated. The changes focus on stronger cold opens, concrete failure/success contrasts, visible diagnostics, and clearer payoff mechanics. The other 42 English masters were preserved.

See:

- `publication-review-v2/REMEDIATION-REPORT-V2.md`
- `publication-review-v2/VERONICA-PUBLICATION-RATINGS-V2.md`
- `publication-review-v2/SERIES-ARCHITECTURE-V2.md`
- `publication-review-v2/CROSS-PLATFORM-PUBLISHING-PLAYBOOK.md`

## Multilingual status

The archive still contains DE/ES/FR/IT/PT narration inherited from v1, but **multilingual publication is not yet synchronized with the v2 canonical English masters**.

A strict timing revalidation also found **22 French legacy files outside the configured planning bands**. The 12 revised English stories must be propagated to their localized versions, and six `tx-*` additions are still English-only.

See `publication-review-v2/MULTILINGUAL-READINESS.md` before treating non-English output as v2-certified.

## Directory layout

```text
content/long/{locale}/
content/shorts/{locale}/
metadata/
publication-review-v2/       # authoritative v2 review + series architecture
support/legacy/              # superseded v1 review artifacts
source-backlog/
manifest.json
```
