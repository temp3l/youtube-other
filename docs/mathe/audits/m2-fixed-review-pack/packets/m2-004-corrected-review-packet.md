# M2-004 Number and Operations — corrected review packet

## Decision

- Internal technical/content decision: `APPROVED_WITH_SCOPE_CORRECTIONS`
- Authorized external curriculum decision: `PENDING`
- Production enabled: `false`
- Replacement target: `class5-number-operations-standard.v2`
- Content-set SHA-256: `dad3fb7bcf6249770a7d3e650d50160c7997325199e3799084a0803e8cef5b8c`
- Canonical target-document SHA-256: `71c79b42a78dbbd7e1a5252b7d70ead94be7251dae2dc737aee3b0e2158a264f`

> This document is approved for implementation, automated verification, and
> preparation of an external sign-off. It is not a substitute for an
> authorized human curriculum approval and must not independently enable
> production publication.

## Corrected scope

The active class-5/6 target excludes variable substitution and powers. Written division is limited to one-digit divisors.

## Curriculum evidence

- Primary source: `sh-fa-math-sek-2014` — printed pages 34–36, 57–58.
- Primary source SHA-256: `d9b9e3c0e683a5a2e5e4e53167b9458598ad956d52f5bd1c50aa9ac71ed01ac0`.
- Secondary completion-standard source: `kmk-2022-math-esa-msa`.
- Secondary source SHA-256: `578f0cbcf9d461e45ba7f5ae69b10eb78100b0c8443654ed6e1e161695aaa57a`.
- Evidence-set SHA-256: `b5b1aea3f6cea56fe8eaddd5214c568715cf5392ee21fd4d08636e01c12c9b1d`.
- The Schleswig-Holstein source supplies the year-band mapping. The KMK
  standards are secondary evidence only and are not treated as a class-5
  scope-and-sequence document.

## Ordered active target

| Skill | Objective | Prerequisites | Example result | Transfer result | Review-spec SHA-256 |
| --- | --- | --- | --- | --- | --- |
| `M5-ZO-001` | Natürliche Zahlen im Stellenwertsystem lesen und schreiben | root | `730405` | `604070` | `0fc0d565b4b25d61dfbea211b1e698a1f8b90781c9f681edea4d00ae9a5e213e` |
| `M5-ZO-002` | Natürliche Zahlen vergleichen und ordnen | `M5-ZO-001` | `478920 < 479002` | `802110 > 802101` | `a4227ab7e3901697a4b89bee6174d8c31c9fba89443c1b56165b09bf039ee25d` |
| `M5-ZO-003` | Natürliche Zahlen sinnvoll runden | `M5-ZO-001` | `7500` | `123000` | `c873e1918948cd009846ffa27dcb94178e79e3b837d1a7ea80398455d5a52a06` |
| `M5-ZO-004` | Rechenergebnisse überschlagen und mit einer Umkehroperation prüfen | `M5-ZO-003` | `Überschlag 1000; exakt 1002` | `Probe korrekt` | `dc7ea369b0f57d0861e3f98d1d5fced9ab0d8d3f50ba3479ee12a30ae53ae4b1` |
| `M5-ZO-005` | Natürliche Zahlen schriftlich addieren | `M5-ZO-001` | `73824` | `396305` | `4d0cef184c3fdffd1d4db042b29fbc43424f6640299ae03e8ab7e666a68139f5` |
| `M5-ZO-006` | Natürliche Zahlen schriftlich subtrahieren | `M5-ZO-001`, `M5-ZO-002` | `41328` | `321054` | `604f4cbf2b174e1718a7b30d32c31b30596ae9ee17361676ae05f5af9a573b47` |
| `M5-ZO-007` | Natürliche Zahlen schriftlich multiplizieren | `M5-ZO-005` | `18468` | `51858` | `b1f379521be1f7d7a3ecf167e3e07a679692e71ce48315c583a5ec2e14c8d014` |
| `M5-ZO-008` | Natürliche Zahlen schriftlich durch einstellige Divisoren dividieren | `M5-ZO-006`, `M5-ZO-007` | `1646 Rest 1` | `3005 Rest 2` | `2f86da481a4680a8cffa58594172057a25d782bcf41b4e80733c8b43d74ba9f6` |
| `M5-ZO-009` | Vorrangregeln und Klammern bei Rechenausdrücken ohne Variablen anwenden | `M5-ZO-005`, `M5-ZO-007` | `42` | `96` | `fb8a33a3540c0798659ceac3b5ca348b7c2d33246c7cc133fbbc57304f87b12f` |
| `M5-ZO-010` | Rechengesetze zum vorteilhaften Rechnen mit natürlichen Zahlen nutzen | `M5-ZO-005`, `M5-ZO-007`, `M5-ZO-009` | `400` | `600` | `0b60f82aaf7a54b4455bc9068efce370ab2eba8845f75b389e3098a2ae157c93` |
| `M5-ZO-011` | Rechenausdrücke ohne Variablen aus eindeutigen Sachtexten aufstellen | `M5-ZO-009` | `5 · (12 + 8) = 100` | `7 · 9 + 11 = 74` | `04cdd7a98baa61311b184b08f4ef76132b2b44e857d9103356efe4b3a98210c7` |
| `M5-ZO-013` | Teiler und Vielfache verständnisorientiert bestimmen | `M5-ZO-007`, `M5-ZO-008` | `wahr` | `falsch` | `7f5d743a5afdbaa6df626d1c21b9e688ffda3e26787e1f2fa5e83ff10967da0d` |
| `M5-ZO-014` | Teilbarkeitsregeln für 2, 5 und 10 anwenden | `M5-ZO-013` | `wahr` | `falsch` | `1f5998b755b292ea7c6f1a512cb6fd51b5472a27c88a85758f2b92f2edf430f4` |
| `M5-ZO-015` | Teilbarkeitsregeln für 3 und 9 anwenden | `M5-ZO-013` | `wahr` | `falsch` | `ca1824a724fc07b99d8891c040bcdd0e0b6d3d229f28245d0faac478b0871ff9` |

## Deferred from the class-5/6 target

- `M5-ZO-012` — Einfache Termwerte durch Einsetzen berechnen: `DEFER_TO_YEAR_BAND_7_9`. The primary source assigns variables and terms to years 7–9.
- `M5-ZO-016` — Potenzen als verkürzte Multiplikation verstehen: `DEFER_TO_YEAR_BAND_7_9`. The primary source assigns powers to years 7–9.

## Completeness contract

The canonical JSON contains, for every active skill:

- objective and reviewed prerequisites;
- an exact example and transfer task;
- exactly two ordered solution steps for each task;
- exactly two formative checks with answers;
- exactly nine German scene purposes;
- verifier requirements and a named misconception;
- a duration of 240 seconds;
- exact curriculum evidence and a reproducible review-spec hash.

## Hash canonicalization

Hashes use UTF-8 JSON with object keys sorted lexicographically, compact
separators, Unicode characters preserved, arrays kept in declared order,
and exactly one trailing LF. Null and omitted fields are distinct; omitted
optional fields are not serialized.

## Approval boundary

A production approval is valid only after an authorized reviewer completes
`review-records/m2-004-lesson-content-review.v1.json`,
binds the exact hashes in this packet, provides identity and authority,
adds timestamp and evidence, and changes the decision from `PENDING` to
`APPROVED`. Any content, prerequisite, dataset, source, renderer-visible
fact, verifier contract, or ordering change invalidates that approval.
