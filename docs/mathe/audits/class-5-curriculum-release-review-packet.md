# Class 5 curriculum release review packet

Status: `PENDING_EXTERNAL_EDITORIAL_REVIEW`  
Task outcome until a complete decision record exists: `HUMAN_OR_EXTERNAL_BLOCKER`

Private-policy addendum: the external-review status above remains unchanged.
Repository administrator Stephan separately approved the exact hash-bound scope
for private, provider-free, no-claim use under
`private-owner-attestation-policy.md`. That exception cannot authorize public
publishing or create official placement/provenance claims.

This packet proposes a 37-skill Class 5 private-production scope. It is not an
approval, migration, jurisdiction statement, or production release. The tracked
release remains `draft`; grades 6–10 remain unapproved.

## Review target

The approval target is SHA-256
`ffeb0991c18e602c724e2d3829c16a123766919444b806df5308e76b827bc46a` of
the UTF-8 result of `JSON.stringify(JSON.parse(block))` for this JSON block:

```json
{
  "packetVersion": "m2-003.class5-review.v1",
  "releaseId": "de-gems-5-10-v1",
  "curriculumVersion": "1.0.0-draft.1",
  "skillsReleaseHash": "9afb5e2c0ed7a10628df7f5d1d589739995910900d66b5b479894a3a95360b31",
  "orderedSkillRange": "M5-ZO-001..M5-DZ-002",
  "skillCount": 37,
  "variants": ["foundation", "standard", "challenge"],
  "grades": [5],
  "jurisdictionClaims": [],
  "stateClaims": [],
  "schoolTypeClaims": [],
  "rawSha256": {
    "release": "4f2161e70949c806d25ec2d7c287034df63e059bbdb0da5236c44c83eb6967e2",
    "skills": "27a74c4e6e48f863e9f8665442a05b17b7972eea08440b3f6bda4e58f0199e69",
    "sourceRegistry": "6e47f1dbf409433dbc4f08a4d0d9708f37c252d774b6415d89ec0dafa01f58df",
    "stateOverrides": "49e34689857331e38aa665821f1315afd0e72e300515fb3aff16562cafd9d4fc",
    "prerequisites": "1b52664212630a17eb391811ff944d430e67b2ef6e29a4cf95ce02a201caa4f8",
    "migrations": "2b0af284bcb21ce6cd63b16fe42d34b4805d2447de1f47fd7372a5211d669fa7",
    "grade05": "3e326efdfd90a04c817ef502525b60268966d4e8364d4ab8f467f31b12bb6c8d",
    "seed": "1acbc995a7fed583139d606a8cc31d5d1b713364ce566a0bf8f3343b0ded3720",
    "officialSourceRegister": "f8a586059b738720ca2724bfffe2349b105abd5aaaf8fce9d2cf589167188f93"
  }
}
```

Approval of this target means only the ordered Grade 5 records below and all
three listed variants. It conveys no jurisdiction, state, school-type, cohort,
or grades 6–10 placement claim.

## Repository evidence lock

Hashes below are raw-file SHA-256 values. The release also stores canonical
input hashes at `release.json:8-13`; raw and canonical hashes are intentionally
distinguished.

| File                                                              | Exact reviewed section                                             | Raw SHA-256                                                        | Finding                                                                             |
| ----------------------------------------------------------------- | ------------------------------------------------------------------ | ------------------------------------------------------------------ | ----------------------------------------------------------------------------------- |
| `packages/math-education/data/curriculum/v1/release.json`         | lines 2–15                                                         | `4f2161e70949c806d25ec2d7c287034df63e059bbdb0da5236c44c83eb6967e2` | `1.0.0-draft.1`; incomplete; not production-ready                                   |
| `packages/math-education/data/curriculum/v1/skills.json`          | lines 6–819 (37 Class 5 records)                                   | `27a74c4e6e48f863e9f8665442a05b17b7972eea08440b3f6bda4e58f0199e69` | exact match to seed and Grade 5 table; every mapping pending and every record draft |
| `docs/mathe/curriculum/03-machine-readable-seed.md`               | JSON entries lines 21–722                                          | `1acbc995a7fed583139d606a8cc31d5d1b713364ce566a0bf8f3343b0ded3720` | normalized editorial draft, not official-source provenance                          |
| `docs/mathe/curriculum/grade-05.md`                               | status lines 3–5; records lines 9–45; ordering warning lines 52–55 | `3e326efdfd90a04c817ef502525b60268966d4e8364d4ab8f467f31b12bb6c8d` | all 37 identities, order, wording, grade placement confidence, and variants match   |
| `packages/math-education/data/curriculum/v1/source-registry.json` | KMK entry lines 4–17                                               | `6e47f1dbf409433dbc4f08a4d0d9708f37c252d774b6415d89ec0dafa01f58df` | registry metadata only; `contentHash` absent                                        |
| `docs/mathe/sources/official-source-register.md`                  | normalization warning lines 3–6; KMK entry lines 8–16              | `f8a586059b738720ca2724bfffe2349b105abd5aaaf8fce9d2cf589167188f93` | names the cross-state framework; contains no skill-level section mapping            |
| `packages/math-education/data/curriculum/v1/prerequisites.json`   | incomplete policy lines 3–7; Class 5 edges lines 10–73             | `1b52664212630a17eb391811ff944d430e67b2ef6e29a4cf95ce02a201caa4f8` | eight reviewed edges; 24 Class 5 nodes unresolved                                   |
| `packages/math-education/data/curriculum/v1/state-overrides.json` | lines 3–5                                                          | `49e34689857331e38aa665821f1315afd0e72e300515fb3aff16562cafd9d4fc` | explicitly incomplete; zero overrides                                               |
| `packages/math-education/data/curriculum/v1/migrations.json`      | lines 3–5                                                          | `2b0af284bcb21ce6cd63b16fe42d34b4805d2447de1f47fd7372a5211d669fa7` | append-only policy; no migration                                                    |

The historical `a003-m5-zo-001-review-packet.md` has raw SHA-256
`dd428da3cbbef12b1dff33e140bb533bb93fc07f21de0b7d8eecd798abb3237a`.
Its reviewer fields are empty, so it is context, not approval evidence.

## Proposed release scope and current verification

- Ordered records: exactly the 37 rows below, in `seedOrder` 0–36.
- Variants: `foundation`, `standard`, and `challenge` for each record (111
  lesson identities); identical mathematical objective across variants.
- Grade: repository-normalized Class 5 candidate only.
- Jurisdiction claims: none.
- State claims and overrides: none.
- School-type and cohort claims: none.
- Grades 6–10: explicitly outside this review and unapproved.
- Promotion method after approval: a new append-only, hash-bound Class 5 scope;
  never rewrite a published skill ID or mark the 206-skill draft globally reviewed.

Common fields on every row are: `canonicalGrade=5`, `processCompetencies=[REP]`,
`durationSeconds=240`, `allowedVariants=[foundation,standard,challenge]`,
`editorialStatus=draft`, `prerequisiteIds=[]`, and source mapping
`kmk-2022-math / normalized synthesis / synthesized / pending`. The generic
mapping is not exact provenance and must not be promoted as reviewed.

|   # | Skill ID    | Domain             | Topic             | Learning objective                                           | Confidence |
| --: | ----------- | ------------------ | ----------------- | ------------------------------------------------------------ | ---------- |
|   1 | `M5-ZO-001` | Zahl und Operation | Natürliche Zahlen | Natürliche Zahlen im Stellenwertsystem lesen und schreiben   | high       |
|   2 | `M5-ZO-002` | Zahl und Operation | Natürliche Zahlen | Natürliche Zahlen vergleichen und ordnen                     | high       |
|   3 | `M5-ZO-003` | Zahl und Operation | Natürliche Zahlen | Natürliche Zahlen sinnvoll runden                            | high       |
|   4 | `M5-ZO-004` | Zahl und Operation | Grundrechenarten  | Rechenergebnisse überschlagen und mit einer Probe prüfen     | high       |
|   5 | `M5-ZO-005` | Zahl und Operation | Grundrechenarten  | Natürliche Zahlen schriftlich addieren                       | high       |
|   6 | `M5-ZO-006` | Zahl und Operation | Grundrechenarten  | Natürliche Zahlen schriftlich subtrahieren                   | high       |
|   7 | `M5-ZO-007` | Zahl und Operation | Grundrechenarten  | Natürliche Zahlen schriftlich multiplizieren                 | high       |
|   8 | `M5-ZO-008` | Zahl und Operation | Grundrechenarten  | Natürliche Zahlen schriftlich dividieren                     | high       |
|   9 | `M5-ZO-009` | Zahl und Operation | Rechengesetze     | Punkt-vor-Strich und Klammern anwenden                       | high       |
|  10 | `M5-ZO-010` | Zahl und Operation | Rechengesetze     | Rechengesetze zum vorteilhaften Rechnen nutzen               | high       |
|  11 | `M5-ZO-011` | Zahl und Operation | Terme             | Rechenterme aus Texten aufstellen                            | high       |
|  12 | `M5-ZO-012` | Zahl und Operation | Terme             | Einfache Termwerte durch Einsetzen berechnen                 | medium     |
|  13 | `M5-ZO-013` | Zahl und Operation | Teilbarkeit       | Teiler und Vielfache bestimmen                               | high       |
|  14 | `M5-ZO-014` | Zahl und Operation | Teilbarkeit       | Teilbarkeitsregeln für 2, 5 und 10 anwenden                  | high       |
|  15 | `M5-ZO-015` | Zahl und Operation | Teilbarkeit       | Teilbarkeitsregeln für 3 und 9 anwenden                      | medium     |
|  16 | `M5-ZO-016` | Zahl und Operation | Potenzen          | Potenzen als verkürzte Multiplikation verstehen              | medium     |
|  17 | `M5-ZO-017` | Zahl und Operation | Brüche            | Brüche als Anteil eines Ganzen verstehen                     | high       |
|  18 | `M5-ZO-018` | Zahl und Operation | Brüche            | Zähler, Nenner und Bruchstrich sicher verwenden              | high       |
|  19 | `M5-ZO-019` | Zahl und Operation | Brüche            | Brüche auf dem Zahlenstrahl darstellen                       | high       |
|  20 | `M5-ZO-020` | Zahl und Operation | Brüche            | Gleichwertige Brüche erkennen                                | high       |
|  21 | `M5-ZO-021` | Zahl und Operation | Brüche            | Brüche erweitern                                             | high       |
|  22 | `M5-ZO-022` | Zahl und Operation | Brüche            | Brüche kürzen                                                | high       |
|  23 | `M5-ZO-023` | Zahl und Operation | Dezimalzahlen     | Dezimalzahlen lesen und im Stellenwertsystem darstellen      | high       |
|  24 | `M5-ZO-024` | Zahl und Operation | Dezimalzahlen     | Dezimalzahlen vergleichen und ordnen                         | high       |
|  25 | `M5-GM-001` | Größen und Messen  | Größen            | Längen-, Massen-, Zeit- und Geldeinheiten umrechnen          | high       |
|  26 | `M5-GM-002` | Größen und Messen  | Flächen           | Umfang von Rechteck und Quadrat berechnen                    | high       |
|  27 | `M5-GM-003` | Größen und Messen  | Flächen           | Flächeninhalt von Rechteck und Quadrat berechnen             | high       |
|  28 | `M5-RF-001` | Raum und Form      | Grundbegriffe     | Punkt, Strecke, Gerade, parallel und senkrecht unterscheiden | high       |
|  29 | `M5-RF-002` | Raum und Form      | Winkel            | Winkelarten erkennen und benennen                            | high       |
|  30 | `M5-RF-003` | Raum und Form      | Winkel            | Winkel messen und zeichnen                                   | high       |
|  31 | `M5-RF-004` | Raum und Form      | Figuren           | Dreiecke und Vierecke klassifizieren                         | high       |
|  32 | `M5-RF-005` | Raum und Form      | Symmetrie         | Achsensymmetrische Figuren erkennen und ergänzen             | high       |
|  33 | `M5-RF-006` | Raum und Form      | Körper            | Würfel- und Quadernetze erkennen                             | high       |
|  34 | `M5-GM-004` | Größen und Messen  | Volumen           | Volumen mit Einheitswürfeln bestimmen                        | high       |
|  35 | `M5-GM-005` | Größen und Messen  | Volumen           | Volumen eines Quaders berechnen                              | high       |
|  36 | `M5-DZ-001` | Daten und Zufall   | Daten             | Daten in Ur- und Strichlisten erfassen                       | high       |
|  37 | `M5-DZ-002` | Daten und Zufall   | Diagramme         | Säulen- und Balkendiagramme lesen und erstellen              | high       |

## Prerequisite DAG

The current Class 5 edge subset is acyclic and retains seed order as its stable
topological order. These eight edges require explicit approval for this target;
their existing provenance text does not identify a reviewer.

| From        | To          | Kind     | Rationale                                                                            | Current provenance                                     |
| ----------- | ----------- | -------- | ------------------------------------------------------------------------------------ | ------------------------------------------------------ |
| `M5-ZO-017` | `M5-ZO-018` | required | Naming numerator and denominator presupposes the part-whole meaning of a fraction.   | conservative mathematical dependency review 2026-07-12 |
| `M5-ZO-018` | `M5-ZO-020` | required | Recognizing equivalent fractions requires the fraction notation components.          | conservative mathematical dependency review 2026-07-12 |
| `M5-ZO-020` | `M5-ZO-021` | required | Expanding fractions operationalizes equivalence.                                     | conservative mathematical dependency review 2026-07-12 |
| `M5-ZO-020` | `M5-ZO-022` | required | Reducing fractions operationalizes equivalence.                                      | conservative mathematical dependency review 2026-07-12 |
| `M5-ZO-023` | `M5-ZO-024` | required | Comparing decimals requires reading their place-value representation.                | conservative mathematical dependency review 2026-07-12 |
| `M5-RF-002` | `M5-RF-003` | required | Measuring and drawing angles requires recognizing angle types and the angle object.  | conservative mathematical dependency review 2026-07-12 |
| `M5-GM-004` | `M5-GM-005` | required | The cuboid volume formula builds on volume as a count of unit cubes.                 | conservative mathematical dependency review 2026-07-12 |
| `M5-DZ-001` | `M5-DZ-002` | required | Constructing diagrams requires first collecting and organizing the represented data. | conservative mathematical dependency review 2026-07-12 |

The following 24 nodes are disconnected. Their current decision is
`UNRESOLVED / NOT PRODUCTION-APPROVED`; omission is not evidence of no
prerequisite. For every ID, the reviewer must supply exactly one decision:
`ROOT` with rationale, `EDGES` with reviewed edges, or `REJECT` from scope.

| Skill ID    | Reviewer decision | Rationale or attached edge IDs |
| ----------- | ----------------- | ------------------------------ |
| `M5-ZO-001` |                   |                                |
| `M5-ZO-002` |                   |                                |
| `M5-ZO-003` |                   |                                |
| `M5-ZO-004` |                   |                                |
| `M5-ZO-005` |                   |                                |
| `M5-ZO-006` |                   |                                |
| `M5-ZO-007` |                   |                                |
| `M5-ZO-008` |                   |                                |
| `M5-ZO-009` |                   |                                |
| `M5-ZO-010` |                   |                                |
| `M5-ZO-011` |                   |                                |
| `M5-ZO-012` |                   |                                |
| `M5-ZO-013` |                   |                                |
| `M5-ZO-014` |                   |                                |
| `M5-ZO-015` |                   |                                |
| `M5-ZO-016` |                   |                                |
| `M5-ZO-019` |                   |                                |
| `M5-GM-001` |                   |                                |
| `M5-GM-002` |                   |                                |
| `M5-GM-003` |                   |                                |
| `M5-RF-001` |                   |                                |
| `M5-RF-004` |                   |                                |
| `M5-RF-005` |                   |                                |
| `M5-RF-006` |                   |                                |

Any new edge must reject dangling, self, duplicate/parallel, cyclic, and
unapproved future-grade prerequisites. No Grade 6–10 node may enter this scope
without a separate exact approval.

## Provenance and placement decisions required

For each of the 37 skill IDs, attach a mapping record containing the official
source artifact identifier and SHA-256, exact document version, exact page and
section, coverage (`direct`, `synthesized`, or `supporting`), mapping rationale,
and `approve` or `reject`. A URL, registry row, generic “normalized synthesis,”
or partial mapping is insufficient.

Current proposed placement is deliberately empty:

- jurisdiction decision: `NO CLAIM`;
- state/region decision: `NO CLAIM` and no override;
- school-type decision: `NO CLAIM`;
- cohort/effective-period decision: `NO CLAIM`.

The `DE` / `Sekundarstufe I` registry metadata describes the KMK source; it does
not establish these 37 objectives as exact Class 5 placement for every state or
school type. Any non-empty placement scope requires its own reviewed source
mapping and must change the review target hash.

## Reviewer decision record

Do not edit a repository status to simulate approval. Supply an attributable,
immutable decision record with every field below and attach both complete
annexes. A fixture, placeholder, author self-assertion, caller boolean, commit
message, or partially completed record is not approval.

- Review target SHA-256 (must equal the hash above):
- Decision: `APPROVE_EXACT_TARGET` / `REJECT`
- Reviewer stable identity:
- Reviewer name:
- Reviewer role and curriculum authority:
- Reviewer organization:
- Decision timestamp with UTC offset:
- Decision rationale:
- 37-record provenance annex path and SHA-256:
- DAG annex path and SHA-256 (eight edge decisions plus all 24 node decisions):
- Placement decision: `NO CLAIM` / reviewed claim annex path and SHA-256:
- Explicit confirmation that grades 6–10 are not approved:
- Signature or external evidence identifier:

Approve only when identities, order, wording, grade, variants, exact provenance,
all DAG decisions, and the empty placement scope are accepted as one target.
Reject if any item is wrong or incomplete; describe corrections without editing
published IDs. After a real approval, implementation must create an append-only
scope migration, recompute canonical hashes, bind the reviewer identity/time/
decision and annex hashes, and make readiness resolve only that authoritative
hash-bound Class 5 scope. Until then, production remains blocked.

## Adversarial promotion checklist

Promotion must fail for an altered input hash or missing section; duplicate,
unknown, or reordered skills; dangling, self, duplicate, or cyclic edges; a
future-grade prerequisite without separate approval; forged or partial reviewer
or provenance data; any unapproved state/school/jurisdiction claim; mutation of
a published ID; or a lesson profile bound to a different release/scope hash.
