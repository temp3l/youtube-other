# V3.6 diagnostic catalog

| Code | Meaning |
| --- | --- |
| `RELATION_SUPPORT_CLAIM_MISSING` | A listed support claim is unavailable. |
| `RELATION_EPISODE_MISMATCH` | Relation or support crosses an episode boundary. |
| `RELATION_PARTICIPANT_UNRESOLVED` | A typed entity reference cannot be resolved canonically. |
| `RELATION_CARDINALITY_INVALID` | The relation violates its kind's minimum/distinct participant rules. |
| `RELATION_PROPOSITION_UNSUPPORTED` | No exact proposition supports the relation. |
| `RELATION_TYPE_MISMATCH` | Support grounds the same participants under another relation kind. |
| `RELATION_DIRECTION_UNSUPPORTED` | Support establishes the reversed directional relation. |
| `RELATION_PROPER_NAME_FRAGMENTATION` | An atomic multi-token proper name was decomposed. |
| `RELATION_DUPLICATE_SEMANTIC_IDENTITY` | A batch repeats deterministic relation semantics. |
| `RELATION_SEMANTIC_IDENTITY_MISMATCH` | Stored ID does not match deterministic semantics. |
| `RELATION_EVIDENCE_FINGERPRINT_MISMATCH` | Stored evidence fingerprint does not match canonical support provenance. |
| `SHADOW_RELATION_PARTICIPANT_UNRESOLVED` | A bounded extraction form lacks a resolved participant. |
| `SHADOW_RELATION_PROPOSITION_AMBIGUOUS` | Structured claim data does not establish a safe V3.6 proposition. |
| `SHADOW_RELATION_TAXONOMY_UNSUPPORTED` | The explicit proposition needs a relation kind outside the frozen taxonomy. |
| `SHADOW_RELATION_INSUFFICIENT_CARDINALITY` | A bounded proposal has too few required participants. |
