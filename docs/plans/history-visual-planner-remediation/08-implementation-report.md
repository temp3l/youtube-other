# History visual planner remediation — implementation report

Date: 2026-08-06. Source plan: `docs/plans/history-visual-planner-remediation/04-implementation-plan.md`.

| Napoleon | v2 | v3 |
|---|---:|---:|
| units / beats / shots / intents / variants | 63/63/126/63/126 | 130/69/81/61/162 |
| map masters/states; diagrams | 1/40; 0 | 1/6; 1/4 |
| claims / rejected entities | n/a | 42/0 |
| reviewable / approvable | no/invalid | yes/no |

Implemented P0 approval gating and full coverage; V3 schema/hash/versioning; semantic grouping, multi-shot anchors and reusable intents; validated entities, claims, typed map/diagram states, media reasons and ratio adaptations; compact redacted ZIP export. V1/V2 remain immutable legacy artifacts.

Canonical roots: episodes 02, 03, 04 as named in the manifests; scripts are `languages/script-en.md`; metadata is `source/normalized-metadata.json`.

Checks: History/CLI typecheck passed; focused Vitest 9/9 passed; targeted ESLint and all four ZIP integrity checks passed. Regenerated packs are reviewable but non-approvable: target conflicts (02 +183333ms; 03 +431667ms; 04 +18889ms) and provisional timing warning. No scripts/media changed. ZIPs: `artifacts/chatgpt-review/*-v3.zip`; combined: `artifacts/chatgpt-review/chatgpt-review-history-approval-packs-v3.zip`. Risk: measured, revision-bound audio is absent; source references remain unresolved.
