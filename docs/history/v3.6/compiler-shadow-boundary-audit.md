# V3.6 compiler shadow boundary audit

Phase 2.24 audits the accepted V3.5 compiler boundary and adds only an adjacent typed V3.6 shadow-intent contract. Production planning and rendering remain V3.5.

## Current boundaries

| Boundary | Entrypoint | Input | Output | Semantic inference today |
| --- | --- | --- | --- | --- |
| Map planning | `buildHistoryVisualPlanV35` → `proposeMapIntentsV35` → `compileMapStateV35` | narration clusters, claims, entities, geographic/temporal qualifiers | `HistoryMapStateV34` and map master | Map purpose/type, evidence window, geography, actor, route, and fallback are derived from claims and narration. |
| Diagram planning | `buildHistoryVisualPlanV35` → `compileDiagramForBeat` / `compileDiagram` | narration text/window, claim IDs, entities | `HistoryDiagramStateV34` and diagram master | Text patterns and thematic labels choose nodes, topology, edges, and diagram type. |
| Production adapter | `compileHistoryRenderDerivativeV35` / `syncHistoryProductionArtifactsV35` | approved `HistoryVisualPlanV35` | scene-plan derivative and production artifacts | Reads the accepted V3.5 plan; it has no V3.6 input. |

The V3.5 map state supports locator, sequence, movement, territory, and battle-disposition semantics. Its compiler may downgrade after claim/geography inference. The V3.5 diagram state supports causal/process/institutional/comparison/evidence-set families and typed edge relationships, but its compiler discovers those semantics from text. Those behaviors are frozen production compatibility paths and are not reusable as V3.6 semantic authorities.

## Safe V3.6 attachment

`compiler-shadow-contract-v36.ts` attaches after `ExplanatoryRelationV36` validation and before any V3.5 state/render adapter. It stores one typed `MAP`, `DIAGRAM`, or `NO_SAFE_COMPILATION` disposition per relation, retains relation/evidence/proof lineage, and gives the compiler output an identity distinct from the semantic relation ID.

The adapter is deliberately not connected to `buildHistoryVisualPlanV35`, approvals, production synchronization, camera/image prompts, or renderers. Later renderer-shadow work may lower these typed intents into isolated V3.5-compatible shadow states only when it can retain modality and direction without rereading narration or claims.

## Relation capability audit

| Relation kind | Shadow family | Existing visual capability used | Required preservation |
| --- | --- | --- | --- |
| movement | MAP | journey/route | exact from, via order, to; no actor invention |
| spatial-comparison | MAP | comparison | unordered compared places; never a route |
| spatial-area | MAP | area | exact accepted area place |
| event-location | MAP | locator family | event→location and assertion status; never movement |
| causal | DIAGRAM | causal-chain | cause→effect and causal modality |
| dependency | DIAGRAM | institutional/dependency edge | dependency→dependent; never causal |
| process | DIAGRAM | process/sequence edge | ordered steps without causal meaning |
| temporal-sequence | DIAGRAM | sequence edge | chronology without causal meaning |
| policy-response | DIAGRAM | institutional family | condition→response and both premise modalities |
| evidence-set | DIAGRAM | edge-free evidence-set | canonical serialization only; no semantic order or false edges |

There is one safe mapping for each accepted kind at the typed-intent boundary. The existing edge-free `evidence-set` state capability resolves the only plausible ordering ambiguity. Renderer lowering is intentionally out of scope; inability to lower an individual intent safely must become `NO_SAFE_COMPILATION`, not inference.
