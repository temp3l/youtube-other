# M2-007 Data and Diagrams — corrected review packet

## Decision

- Internal technical/content decision: `APPROVED_WITH_SCOPE_CORRECTIONS`
- Authorized external curriculum decision: `PENDING`
- Production enabled: `false`
- Replacement target: `class5-data-diagrams-standard.v2`
- Content-set SHA-256: `90c2affee6111483eceadf8a71e408028e4ce14d8cb45839f068bacc1c039e04`
- Canonical target-document SHA-256: `5ce61444d540cab0b98fdfd593b13c428506789f2f031c7d305cbdb024e79860`

> This document is approved for implementation, automated verification, and
> preparation of an external sign-off. It is not a substitute for an
> authorized human curriculum approval and must not independently enable
> production publication.

## Corrected scope

German locale labels are corrected to Fuß, Grün and Bücher. Probability remains outside this target.

## Curriculum evidence

- Primary source: `sh-fa-math-sek-2014` — printed pages 52–54 and 57.
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
| `M5-DZ-001` | Rohdaten in Strichlisten und Häufigkeitstabellen ordnen | root | `Gesamt 12; Maximum Banane 5` | `Gesamt 15; Maximum Bus 6` | `d843374ebaacf6100202ec25fa2bca526792569bdb13284adf2ad6982651896f` |
| `M5-DZ-002` | Säulen- und Balkendiagramme aus Häufigkeitsdaten erstellen und lesen | `M5-DZ-001` | `Säulen 4, 7, 5; Maximum Blau 7` | `Balken 3, 6, 9; Maximum C 9` | `538fc98a78e98a5c32c9017fcfe5d4e7b0c8de226d9f276700ee4f25bf51e605` |

## Bound datasets

- `dataset-obst-v2` — `67f6600737909d7621b6b3b703f71193a3a439d3f87decc46b68b338ca30ff42`
- `dataset-schulweg-v2` — `fbd2ac2a8756bafc07eb87842860f469efe006e70d3b9b8ffe4cddf1c001c2bc`
- `dataset-farben-v2` — `1e5d0394f0929ebbafa755b0c1ebcb59daa0465238c02b0fcb6c81dfad49da33`
- `dataset-buecher-v2` — `5249fc33beee8cd0f939929b9eba1fea19d7b99c6adbe8c09c032022bd357547`

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
`review-records/m2-007-lesson-content-review.v1.json`,
binds the exact hashes in this packet, provides identity and authority,
adds timestamp and evidence, and changes the decision from `PENDING` to
`APPROVED`. Any content, prerequisite, dataset, source, renderer-visible
fact, verifier contract, or ordering change invalidates that approval.
