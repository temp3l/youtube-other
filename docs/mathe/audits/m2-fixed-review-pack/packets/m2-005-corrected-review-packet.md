# M2-005 Fractions and Decimals — corrected review packet

## Decision

- Internal technical/content decision: `APPROVED_WITH_SCOPE_CORRECTIONS`
- Authorized external curriculum decision: `PENDING`
- Production enabled: `false`
- Replacement target: `class5-fractions-decimals-standard.v2`
- Content-set SHA-256: `c94fa9343fb2ebc3dceed5c80f297d5a09720d8ad4cf1926494b01c2046ebda0`
- Canonical target-document SHA-256: `774a74af036d5d6d9bcf86ccca2cb422fca7a33e52ab3d7ed3392a96a55397c9`

> This document is approved for implementation, automated verification, and
> preparation of an external sign-off. It is not a substitute for an
> authorized human curriculum approval and must not independently enable
> production publication.

## Corrected scope

The shortening notation is expressed as division of numerator and denominator separately, not division by the fraction 6/6.

## Curriculum evidence

- Primary source: `sh-fa-math-sek-2014` — printed pages 34–36 and 57.
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
| `M5-ZO-017` | Brüche als Anteile gleich großer Teile darstellen | root | `3/8` | `7/10` | `8543f22d2315dd69bf83f105c10200307a194ff6c65f3a8947da6fb0e0cd14d7` |
| `M5-ZO-018` | Zähler, Nenner und Bruchstrich sicher deuten | `M5-ZO-017` | `4/9` | `Zähler 7; Nenner 12` | `2b8c33e469f66188841046d25256c3248453c6fd67e2e1868bf4911be42ff9e5` |
| `M5-ZO-019` | Einfache Brüche am Zahlenstrahl zwischen 0 und 1 eintragen | `M5-ZO-017`, `M5-ZO-018` | `3/4` | `2/5` | `d0848e3e95fa8779b8d40147e65d74b20a3c30c8f051eb2116bf1e8fe4ab9391` |
| `M5-ZO-020` | Gleichwertige Brüche mit Modellen und Zahlen erkennen | `M5-ZO-017`, `M5-ZO-018`, `M5-ZO-019` | `2/3 = 4/6` | `3/5 = 6/10` | `955ffc0ff131005d8b6b5552afbdfb11d5e96ea967eebfec2ade0931de221d0a` |
| `M5-ZO-021` | Brüche durch Multiplikation von Zähler und Nenner erweitern | `M5-ZO-020` | `6/15` | `12/32` | `c1d650207ffc556c623c5f72345a2883529479a76652ee0b20071962c79f5b6b` |
| `M5-ZO-022` | Brüche durch Division von Zähler und Nenner kürzen | `M5-ZO-020`, `M5-ZO-021` | `2/3` | `3/5` | `a4e34a0e359f2d669f03146334116458f82f563d4d5c4b6409156d09c8f6f8ec` |
| `M5-ZO-023` | Dezimalzahlen im Stellenwertsystem lesen und zerlegen | root | `10 + 2 + 0,3 + 0,005` | `400 + 7 + 0,02 + 0,008` | `1455e5d0794aafc5fcef42d1d3a8eb73bb1f78cab0a4e2fefab9f1d029c94f13` |
| `M5-ZO-024` | Dezimalzahlen vergleichen und gleichwertige Schreibweisen erkennen | `M5-ZO-023` | `0,5 = 0,50` | `2,07 < 2,7` | `e7f0c12dfd2871cdad83d79669341fa451bc7dedf1804364cd99bc262b64cf42` |

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
`review-records/m2-005-lesson-content-review.v1.json`,
binds the exact hashes in this packet, provides identity and authority,
adds timestamp and evidence, and changes the decision from `PENDING` to
`APPROVED`. Any content, prerequisite, dataset, source, renderer-visible
fact, verifier contract, or ordering change invalidates that approval.
