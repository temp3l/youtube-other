# Shared Abstraction Simplification

| Abstraction | Current reason | Target action | Notes |
|---|---|---|---|
| `@mediaforge/pipeline` stage model | old end-to-end workflow | DELETE | after CLI/API no longer import it |
| `narrationPipelineMode=legacy|shadow|new` | rollout bridge | COLLAPSE | keep `new` behavior after migration; remove legacy mode after release window |
| root `script.md` compatibility rendering | old consumers | DELETE | no duplicate scripts |
| `legacyGeneratedImage*` helpers | state image fallback | DELETE_AFTER_MIGRATION | after shared image hydration complete |
| `legacy mixed` story response schemas | batch compatibility | DELETE_AFTER_MIGRATION | after batch imports prove narration-only format |
| `story-workflow-legacy.ts` | legacy delegation | DELETE | after story pipeline no longer delegates |
| `dark-truth` direct orchestration | active duplicate path | SPLIT/MOVE | preserve domain logic, move orchestration into app use cases |
| heuristic metadata provider | fallback contract | INVESTIGATE | keep only if documented active fallback |
| raw OpenAI image CLI | direct provider shortcut | INVESTIGATE | remove or mark advanced non-production |
| manual localized audio path helpers | legacy layout | REPLACE | use `EpisodePathResolver` and script resolver |
| duplicate episode id/locale types | packages define variants | SIMPLIFY | centralize around shared/domain branded types |

Implementation should prefer fewer Dark Truth-focused abstractions over empty compatibility interfaces.
