# Multilingual Readiness — v2

## Status

**Canonical English: READY for production planning. Multilingual pack: NOT YET SYNCHRONIZED.**

### Why multilingual publication is not yet at the same gate

1. The 12 v2 editorial remediations were applied to the canonical English masters. Their existing DE/ES/FR/IT/PT files still contain the previous v1 wording.
2. The six transcript-derived additions (`tx-*`) are English-only.
3. A strict revalidation using the configured WPM found **22 French timing overruns** in legacy localized scripts. No other locale failed the deterministic timing check.

### French timing failures

| Story | Format | Words | Estimated | Path |
|---|---|---:|---:|---|
| `osc-l03` | long | 1597 | 638.8s | `content/long/fr/osc-03-people-dont-buy-your-product-they-buy-the-promise.md` |
| `osc-l07` | long | 1592 | 636.8s | `content/long/fr/osc-07-why-selling-feels-difficult.md` |
| `osc-l08` | long | 1610 | 644.0s | `content/long/fr/osc-08-sales-without-chasing-everyone.md` |
| `pos-l02` | long | 1577 | 630.8s | `content/long/fr/pos-02-how-to-find-your-niche-without-making-yourself-too-small.md` |
| `pos-l05` | long | 1596 | 638.4s | `content/long/fr/pos-05-why-writing-a-book-can-make-you-the-expert.md` |
| `pos-l06` | long | 1615 | 646.0s | `content/long/fr/pos-06-how-to-reposition-yourself-when-your-business-changes.md` |
| `osc-s01a` | short | 241 | 93.3s | `content/shorts/fr/osc-01a-revenue-is-not-a-good-business.md` |
| `osc-s02b` | short | 245 | 94.8s | `content/shorts/fr/osc-02b-stop-posting-where-your-customers-arent.md` |
| `osc-s03b` | short | 241 | 93.3s | `content/shorts/fr/osc-03b-the-promise-formula.md` |
| `osc-s04b` | short | 247 | 95.6s | `content/shorts/fr/osc-04b-make-your-offer-easier-to-buy.md` |
| `pos-l01-s01` | short | 245 | 94.8s | `content/shorts/fr/pos-l01-s01-being-good-isnt-enough.md` |
| `pos-l01-s02` | short | 245 | 94.8s | `content/shorts/fr/pos-l01-s02-expertise-vs-perception.md` |
| `pos-l02-s01` | short | 247 | 95.6s | `content/shorts/fr/pos-l02-s01-selling-to-everyone-is-the-problem.md` |
| `pos-l02-s03` | short | 247 | 95.6s | `content/shorts/fr/pos-l02-s03-market-problem-solution-test.md` |
| `pos-l03-s01` | short | 251 | 97.2s | `content/shorts/fr/pos-l03-s01-you-cant-just-call-yourself-an-expert.md` |
| `pos-l03-s03` | short | 250 | 96.8s | `content/shorts/fr/pos-l03-s03-your-website-has-five-seconds.md` |
| `pos-l04-s01` | short | 243 | 94.1s | `content/shorts/fr/pos-l04-s01-stop-posting-random-content.md` |
| `pos-l04-s02` | short | 249 | 96.4s | `content/shorts/fr/pos-l04-s02-the-goal-is-recognition-not-views.md` |
| `pos-l04-s03` | short | 248 | 96.0s | `content/shorts/fr/pos-l04-s03-make-other-people-talk-about-your-expertise.md` |
| `pos-l05-s02` | short | 251 | 97.2s | `content/shorts/fr/pos-l05-s02-dont-write-a-book-about-everything-you-know.md` |
| `pos-l06-s02` | short | 241 | 93.3s | `content/shorts/fr/pos-l06-s02-changing-your-bio-isnt-repositioning.md` |
| `pos-l06-s03` | short | 245 | 94.8s | `content/shorts/fr/pos-l06-s03-change-what-people-know-you-for.md` |

## Required multilingual remediation

- Propagate the 12 canonical v2 editorial changes into every existing locale.
- Localize the six English-only transcript-derived additions where those locales are required.
- Tighten the 22 French scripts to the configured timing bands without removing core examples/payoffs.
- Re-run native-language editorial review and selected-audio timing after TTS.
- Do not treat v1 localized ratings as certification of the revised v2 wording.
