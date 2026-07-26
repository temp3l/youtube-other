# M2-006 Geometry and Measurement — corrected review packet

## Decision

- Internal technical/content decision: `APPROVED_WITH_SCOPE_CORRECTIONS`
- Authorized external curriculum decision: `PENDING`
- Production enabled: `false`
- Replacement target: `class5-geometry-measurement-standard.v2`
- Content-set SHA-256: `5e2226b794609c1d04e02768f21f9e0beae17ea8df9634e3c438f3dbfc39384d`
- Canonical target-document SHA-256: `e549555a6f2944f797cd76bffde1efab5b77658012256b2810dc9f903f46c6e8`

> This document is approved for implementation, automated verification, and
> preparation of an external sign-off. It is not a substitute for an
> authorized human curriculum approval and must not independently enable
> production publication.

## Corrected scope

Coordinates may be used internally by verifiers, but vectors and the Pythagorean theorem are not learner-facing class-5 content.

## Curriculum evidence

- Primary source: `sh-fa-math-sek-2014` — printed pages 39–46 and 57.
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
| `M5-GM-001` | Gebräuchliche Einheiten innerhalb eines Größenbereichs umwandeln | root | `200 cm; 3000 g; 120 min; 350 ct` | `420 cm; 1500 g; 1 h 30 min; 705 ct` | `f22b121aea57fbd5317ae823788068ac6e8c1ea1fd03fd1b5fdd51ee0b9e41f2` |
| `M5-GM-002` | Den Umfang von Rechteck und Quadrat berechnen | root | `26 cm` | `24 cm` | `e8a1170eb00f111249e9b2c96e4ea7ce4c9f83a8bba168fa2a1336a4c022ac79` |
| `M5-GM-003` | Den Flächeninhalt von Rechteck und Quadrat bestimmen | root | `40 cm²` | `49 cm²` | `b7aa374a1b6adb017c5fc8977f44fad2065e854c14d500d3af4ceb15eee03a0a` |
| `M5-GM-004` | Würfel in Schichten zählen und Rauminhalte vorbereiten | root | `24 Würfel` | `30 Würfel` | `650e0c5a4bdf65490bf338fb68f5c99b595781259e1bcd1885e8cd419215e6fe` |
| `M5-GM-005` | Das Volumen eines Quaders mit Einheitswürfeln und der Produktformel bestimmen | `M5-GM-004` | `120 cm³` | `48 cm³` | `eed004a9581ebc9875f1b31cf06a2efd9a0f442912077f07d7a2290bda70b444` |
| `M5-RF-001` | Punkte, Strecken, Geraden sowie parallele und senkrechte Beziehungen unterscheiden | root | `parallel; senkrecht` | `korrekte Rollen` | `2a0e9bee0cfb2b1c295614d5a4314455f676e0eee44946e46079e93db56b6dcf` |
| `M5-RF-002` | Spitze, rechte und stumpfe Winkel unterscheiden | root | `45° spitz; 135° stumpf` | `90° recht; 170° stumpf` | `eb06f94a889b97393fcaa19e4f3ec348408202a223857759b38849a10485bc28` |
| `M5-RF-003` | Winkel mit dem Geodreieck messen und zeichnen | `M5-RF-002` | `90°; 45°` | `120°` | `d710fccc39e32d4d22331020e7f8a92b5d812bee7593b8df532fddd59a6df23b` |
| `M5-RF-004` | Einfache Dreiecke und Vierecke anhand ihrer Eigenschaften beschreiben | root | `Rechteck` | `rechtwinkliges Dreieck` | `43c5054815a84abef0a64f4a1b1f45389e707d183531d65fd7d66b0916d4664e` |
| `M5-RF-005` | Figuren an einer Achse spiegeln | root | `A' achsensymmetrisch` | `gespiegeltes Dreieck` | `18813185f7063d861819d3356fc90e930da2ea6b5903b99c69cce50f6a10fa01` |
| `M5-RF-006` | Netze von Würfel und Quader erkennen und zuordnen | root | `gültig oder ungültig` | `korrekte Flächenzuordnung` | `d08962d64d4f02ee883a15f49e3daede58da9ee9651447beb203a427566d7b89` |

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
`review-records/m2-006-lesson-content-review.v1.json`,
binds the exact hashes in this packet, provides identity and authority,
adds timestamp and evidence, and changes the decision from `PENDING` to
`APPROVED`. Any content, prerequisite, dataset, source, renderer-visible
fact, verifier contract, or ordering change invalidates that approval.
