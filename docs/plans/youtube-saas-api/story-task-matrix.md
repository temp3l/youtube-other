# Story-to-task matrix

| Story | Existing status | Planned task(s) | Fully covered? |
| --- | --- | --- | --- |
| US-001 | PARTIAL | 005, 017 | Yes |
| US-002 | PARTIAL | 007, 017 | Yes |
| US-003 | PARTIAL | 002, 010, 018 | Yes |
| US-004 | PARTIAL | 002, 018 | Yes |
| US-005 | PARTIAL | 023 | Yes |
| US-006 | PARTIAL | 001, 017 | Yes |
| US-007 | PARTIAL | 005, 017 | Yes |
| US-008 | PARTIAL | 006, 017 | Yes |
| US-009 | MISSING | 006, 017 | Yes |
| US-010 | PARTIAL | 006, 017 | Yes |
| US-011 | PARTIAL | 001, 006, 017 | Yes |
| US-012 | PARTIAL | 008, 018 | Yes |
| US-013 | PARTIAL | 002, 018 | Yes |
| US-014 | MISSING | 008, 018 | Yes |
| US-015 | MISSING | 008, 009, 019 | Yes |
| US-016 | PARTIAL | 002, 018 | Yes |
| US-017 | PARTIAL | 001, 002, 018 | Yes |
| US-018 | PARTIAL | 002, 018 | Yes |
| US-019 | PARTIAL | 002, 010, 018 | Yes |
| US-020 | PARTIAL | 009, 019 | Yes |
| US-021 | PARTIAL | 009, 010, 019 | Yes |
| US-022 | PARTIAL | 010, 019 | Yes |
| US-023 | PARTIAL | 003, 010, 019 | Yes |
| US-024 | PARTIAL | 002, 010, 018 | Yes |
| US-025 | PARTIAL | 005, 017 | Yes |
| US-026 | PARTIAL | 007, 017 | Yes |
| US-027 | EXISTS | 007, 017 (regression/integration) | Already satisfied |
| US-028 | PARTIAL | 001, 006, 007, 017 | Yes |
| US-029 | PARTIAL | 007, 017 | Yes |
| US-030 | MISSING | 013, 021 | Yes |
| US-031 | PARTIAL | 013, 021 | Yes |
| US-032 | PARTIAL | 001, 006, 013, 021 | Yes |
| US-033 | PARTIAL | 014, 021, 024 | Yes, flag-gated |
| US-034 | PARTIAL | 013, 014, 021 | Yes, flag-gated |
| US-035 | PARTIAL | 013, 014, 021 | Yes, flag-gated |
| US-036 | PARTIAL | 013, 014, 021 | Yes |
| US-037 | PARTIAL | 013, 014, 021 | Yes, flag-gated |
| US-038 | PARTIAL | 003, 022 | Yes |
| US-039 | PARTIAL | 003, 022 | Yes |
| US-040 | PARTIAL | 003, 010–016, 022 | Yes |
| US-041 | PARTIAL | 003, 011, 020 | Yes |
| US-042 | PARTIAL | 004, 011, 020, 023 | Yes |
| US-043 | PARTIAL | 003, 011 | Yes |
| US-044 | PARTIAL | 012, 020 | Yes |
| US-045 | PARTIAL | 003, 012, 020 | Yes |
| US-046 | PARTIAL | 012, 020 | Yes |
| US-047 | PARTIAL | 004, 011, 020 | Yes |
| US-048 | MISSING | 015, 022 | Yes |
| US-049 | PARTIAL | 015, 022 | Yes |
| US-050 | PARTIAL | 006, 015, 022 | Yes |
| US-051 | MISSING | 016, 022 | Yes |
| US-052 | MISSING | 016, 022 | Yes |
| US-053 | MISSING | 016, 022 | Yes |
| US-054 | MISSING | 016, 024 | Yes |
| US-055 | PARTIAL | 022, 023 | Yes |
| US-056 | PARTIAL | 002, 010, 018, 022 | Yes |
| US-057 | MISSING | 003, 013, 021, 024 | Yes |
| US-058 | PARTIAL | 022, 023 | Yes |
| US-059 | PARTIAL | 004, 017, 022 | Yes |
| US-060 | MISSING | 022 | Yes |
| US-061 | PARTIAL | 003, 006, 013–022 | Yes |
| US-062 | PARTIAL | 001, 003, 004, 007, 011–022 | Yes |

## End-to-end journey coverage

| Journey | Planned tasks | Terminal gate |
| --- | --- | --- |
| JNY-001 | 002, 007, 013, 017, 018, 022, 023 | Provider-free publish-ready evidence |
| JNY-002 | 001, 005–007, 013, 014, 017, 021, 024 | Published after flag acceptance |
| JNY-003 | 005, 006, 017 | Continued, abandoned, or safely blocked |
| JNY-004 | 001, 006, 007, 017 | Regenerated, validated, review current |
| JNY-005 | 002, 006–008, 013, 018, 021 | Localized publish-ready/published revision |
| JNY-006 | 005–010, 017–019 | Per-item terminal results |
| JNY-007 | 006, 007, 017 | Immutable decision and audit |
| JNY-008 | 003, 011, 012, 020, 023 | Approved result retrieved |
| JNY-009 | 013, 014, 021, 024 | One published video or reconciliation state |
| JNY-010 | 002–007, 011, 012, 017, 020, 022, 023 | Deterministic approved evidence and audit |

Live publishing portions of JNY-002 and JNY-009 require YSAAS-024 before the
platform feature flag may be enabled.
