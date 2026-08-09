# V3.6 shadow relation extraction

Summary: Added a proof-bearing, shadow-only extractor that projects explicit claim propositions, merges semantic duplicates by evidence, validates candidates, and reports rejected or foreign claims.

Changed paths: `packages/history/src/v36/explanatory-relation-shadow-extractor-v36.{ts,unit.test.ts}`; `packages/history/src/index.ts`; `docs/history/v3.6/{explanatory-relation-ir,migration-plan}.md`.

Tests/checks: focused extractor Vitest 5/5; hardened V3.6 IR Vitest 59/59; `@mediaforge/history` typecheck; targeted ESLint — all pass.

Commit hash: `0b6604ee9439ac09ddec14f86517d6736ece803c`.

Unresolved risks: extraction accepts only explicit structured propositions; no free-text rules, LLM extraction, V3.5 wiring, maps, or diagrams were added.
