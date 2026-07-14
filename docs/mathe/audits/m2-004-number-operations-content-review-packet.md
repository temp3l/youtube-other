# M2-004 number and operations content review packet

Status: `PENDING_EXTERNAL_CONTENT_AND_CURRICULUM_REVIEW`

This packet describes the exact German `standard` content target implemented by
`class5-number-operations-standard.v1`. It is not approval evidence. No
production capability is enabled by this document. Foundation and challenge
remain unsupported for these new specifications; the historical simulation
fixtures are a separate non-production contract.

The ordered target contains `M5-ZO-001..M5-ZO-016`. Its content-set SHA-256 is
`420934c6ea61535827238044af51ee911fdca90b49ba01ecc65322e985854082`.
Every row has two formative checks, an ordered two-step solution for the example
and transfer task, nine German scene purposes, and a duration of 240 seconds.

| Skill       | Objective                                                  | Proposed prerequisites                | Example → solution                | Transfer → solution                | Verifier v3 checks         | Misconception                                         | Content SHA-256                                                    |
| ----------- | ---------------------------------------------------------- | ------------------------------------- | --------------------------------- | ---------------------------------- | -------------------------- | ----------------------------------------------------- | ------------------------------------------------------------------ |
| `M5-ZO-001` | Natürliche Zahlen im Stellenwertsystem lesen und schreiben | root proposed                         | `700000+30000+400+5` → `730405`   | `600000+4000+70` → `604070`        | place value                | Nullen zwischen besetzten Stellen werden ausgelassen. | `525cfaa7aad53bcbe329f83b04e75c89ba2094acb68de61bf15d1b7ce01c665d` |
| `M5-ZO-002` | Natürliche Zahlen vergleichen und ordnen                   | `M5-ZO-001`                           | `478920<479002` → true            | `802110>802101` → true             | comparison                 | Es wird nur die letzte Ziffer verglichen.             | `b11989f85e2062f19f241d8fcdb8366a81833e88e0343a5178e82859d3c499bd` |
| `M5-ZO-003` | Natürliche Zahlen sinnvoll runden                          | `M5-ZO-001`                           | `7462` at `100` → `7500`          | `123449` at `1000` → `123000`      | rounding                   | Es wird am falschen Stellenwert gerundet.             | `bd38b0bbd683e2368970d73654ea1414ae4a80e58879fc3f0f4a096395ea11a3` |
| `M5-ZO-004` | Rechenergebnisse überschlagen und mit einer Probe prüfen   | `M5-ZO-003`                           | `398,604` → `1000`                | `398+604` → `1002`                 | estimation and exact probe | Operanden werden auf unpassende Stellen gerundet.     | `bdd0375ef0559b18d198a53b1ca4a22230d5f4ed0986e3ae086840dd8971d8d0` |
| `M5-ZO-005` | Natürliche Zahlen schriftlich addieren                     | `M5-ZO-001`                           | `45876+27948` → `73824`           | `306709+89596` → `396305`          | integer addition           | Ein Übertrag wird vergessen.                          | `e85d77c838e009e56772b38743e05333278852410f581e14de97d9f1a1d72fa2` |
| `M5-ZO-006` | Natürliche Zahlen schriftlich subtrahieren                 | `M5-ZO-001`, `M5-ZO-002`              | `70003-28675` → `41328`           | `500000-178946` → `321054`         | integer subtraction        | Über mehrere Nullstellen wird nur einmal entliehen.   | `d1c6bb629cec7b68018ae84e73b5f5009f5e86381638c86d9fb0d9cca2c1b7d9` |
| `M5-ZO-007` | Natürliche Zahlen schriftlich multiplizieren               | `M5-ZO-005`                           | `324·57` → `18468`                | `1206·43` → `51858`                | integer multiplication     | Teilprodukte werden nicht stellenrichtig versetzt.    | `9e522bdb65267440124fc251d6ac5baa5e2658e506f600fd6bf1af21c4bc38b2` |
| `M5-ZO-008` | Natürliche Zahlen schriftlich dividieren                   | `M5-ZO-006`, `M5-ZO-007`              | `9876:24` → `411 R 12`            | `15025:32` → `469 R 17`            | quotient and remainder     | Der Rest wird als Quotientenziffer notiert.           | `179513c78f42f3e1052ae61f3661cf3a6d7b370209595b766b45cfc87a66c416` |
| `M5-ZO-009` | Punkt-vor-Strich und Klammern anwenden                     | `M5-ZO-005`, `M5-ZO-007`              | `18+6·4` → `42`                   | `(18+6)·4` → `96`                  | order of operations        | Es wird immer nur von links nach rechts gerechnet.    | `92d330976cce02fdb6bdca85cf556e9f9a88de6ae7a00bdf4938ab84ebe6d5bd` |
| `M5-ZO-010` | Rechengesetze zum vorteilhaften Rechnen nutzen             | `M5-ZO-005`, `M5-ZO-007`, `M5-ZO-009` | distributive equality → `500=500` | commutative equality → `6000=6000` | arithmetic laws            | Eine Umformung ändert unbemerkt den Termwert.         | `fc53cc956c65d41305cdaac6a024f0e4ced3684edf0bca1129444c3b0062800b` |
| `M5-ZO-011` | Rechenterme aus Texten aufstellen                          | `M5-ZO-009`                           | `(12+8)·5` → `100`                | `7·9+11` → `74`                    | unambiguous text mapping   | Sprach- und Rechenreihenfolge werden gleichgesetzt.   | `4525a288817595ccbc6edb476fade5ab9e7dfc056e365f6e7ab8737f490e34dd` |
| `M5-ZO-012` | Einfache Termwerte durch Einsetzen berechnen               | `M5-ZO-011`                           | `3x+7`, `x=12` → `43`             | `5x+4`, `x=20` → `104`             | substitution               | Der Wert ersetzt nur ein Vorkommen.                   | `7859bca4082a37177f411572961ca6fc8891b373de5604ada1a5198156e48922` |
| `M5-ZO-013` | Teiler und Vielfache bestimmen                             | `M5-ZO-007`, `M5-ZO-008`              | `6∣36` → true                     | `8∣42` → false                     | divisibility               | Teiler und Vielfache werden vertauscht.               | `55a50a4bb914a1b9a2960031e337f9ac70e878433de005eef83b36e6c7eba2d4` |
| `M5-ZO-014` | Teilbarkeitsregeln für 2, 5 und 10 anwenden                | `M5-ZO-013`                           | `10∣3470` → true                  | `2∣9135` → false                   | scoped divisibility        | Eine andere statt der letzten Ziffer wird geprüft.    | `1194f17738c7de9d5dd813b354d990f38c5e7e301c2baafb826ec10625f7268b` |
| `M5-ZO-015` | Teilbarkeitsregeln für 3 und 9 anwenden                    | `M5-ZO-013`                           | `9∣729` → true                    | `3∣1246` → false                   | scoped divisibility        | Die Zahl statt ihrer Ziffernsumme wird geprüft.       | `205def743a3cfa084945066536b8384271888059df0e866bd940e9c15cb984f7` |
| `M5-ZO-016` | Potenzen als verkürzte Multiplikation verstehen            | `M5-ZO-007`, `M5-ZO-009`              | `4^3` → `64`                      | `10^5` → `100000`                  | powers                     | Basis und Exponent werden multipliziert.              | `0eee3fbc8c4f75cc808ff23f487ab66dcc602b92fdd16b35a5876dca336730fb` |

Source identity for every row is the draft curriculum release
`de-gems-5-10-v1` / `1.0.0-draft.1` / skills hash
`9afb5e2c0ed7a10628df7f5d1d589739995910900d66b5b479894a3a95360b31`
and source ID `kmk-2022-math`, section `normalized synthesis`. The mapping and
all proposed prerequisite links are explicitly unreviewed. Approval requires an
external `lesson-content-review.v1` record binding the exact ordered skill IDs,
all hashes above, reviewer identity/authority, timestamp, and external evidence.
