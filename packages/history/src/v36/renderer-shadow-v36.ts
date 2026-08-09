import type { CompilerIntentV36 } from "./compiler-shadow-contract-v36.js";
import { adaptDiagramIntentToRenderSpecV36 } from "./renderer-shadow-diagram-v36.js";
import { adaptMapIntentToRenderSpecV36 } from "./renderer-shadow-map-v36.js";
import {
  HISTORY_RENDERER_SHADOW_SCHEMA_V36,
  HISTORY_RENDERER_SHADOW_VERSION_V36,
  type RendererShadowResultV36,
  type ResolvedGeographyV36,
} from "./renderer-shadow-contract-v36.js";

/** Exactly one typed rendering result per accepted compiler intent. */
export function adaptCompilerIntentToRenderSpecV36(input: {
  readonly intent: CompilerIntentV36;
  readonly geography?: readonly ResolvedGeographyV36[];
}): RendererShadowResultV36 {
  if (input.intent.disposition === "MAP")
    return adaptMapIntentToRenderSpecV36({
      intent: input.intent,
      geography: input.geography ?? [],
    });
  if (input.intent.disposition === "DIAGRAM")
    return adaptDiagramIntentToRenderSpecV36(input.intent);
  return {
    schemaVersion: HISTORY_RENDERER_SHADOW_SCHEMA_V36,
    rendererVersion: HISTORY_RENDERER_SHADOW_VERSION_V36,
    disposition: "NO_SAFE_RENDERING",
    compilerIntentId: input.intent.compilerIntentId,
    relationId: input.intent.relationId,
    relationKind: input.intent.relationKind,
    episodeId: input.intent.episodeId,
    shadowOnly: true,
    provenance: input.intent.provenance,
    diagnosticCode: "UNSUPPORTED_RENDERER_CONTRACT",
    reason: `Compiler abstained: ${input.intent.diagnosticCode}.`,
  };
}
