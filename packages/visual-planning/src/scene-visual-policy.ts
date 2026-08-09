import { createHash } from "node:crypto";

export type SourceDisplayPolicy = "display-allowed" | "context-only" | "forbidden-display";

export interface SceneVisualPolicyScene {
  readonly sceneId: string;
  readonly narrationLineId: string;
}

export interface SceneVisualPolicyCandidate {
  readonly candidateId: string;
  readonly provenanceId: string;
}

export interface SceneVisualPolicySource {
  readonly sourceAssetId: string;
  readonly checksum: string;
  readonly displayPolicy?: SourceDisplayPolicy;
  readonly candidates: readonly SceneVisualPolicyCandidate[];
}

export interface SceneVisualPolicyInput {
  readonly contentProfileId: "veronicabenini";
  readonly narrationRevisionId: string;
  readonly effectiveConfigurationHash: string;
  readonly dependencyIdentity: Readonly<Record<string, string>>;
  readonly scenes: readonly SceneVisualPolicyScene[];
  readonly sources: readonly SceneVisualPolicySource[];
}

export interface SceneVisualSelection {
  readonly sceneId: string;
  readonly narrationLineId: string;
  readonly sourceAssetId?: string;
  readonly candidateId?: string;
  readonly provenanceId?: string;
  readonly rationale: "display-allowed-source" | "no-display-allowed-source";
}

export interface SceneVisualPolicyResult {
  readonly schemaVersion: "scene-visual-policy.v1";
  readonly contentProfileId: "veronicabenini";
  readonly narrationRevisionId: string;
  readonly effectiveConfigurationHash: string;
  readonly dependencyIdentity: Readonly<Record<string, string>>;
  readonly selections: readonly SceneVisualSelection[];
  readonly review: {
    readonly allowed: boolean;
    readonly reasonCodes: readonly string[];
  };
}

function compareText(a: string, b: string): number {
  return a.localeCompare(b, "en");
}

/**
 * Selects only explicitly displayable source media. The ordering is canonical,
 * so source-file enumeration and localization cannot perturb visual semantics.
 */
export function selectSceneVisualMedia(input: SceneVisualPolicyInput): SceneVisualPolicyResult {
  const sources = input.sources
    .filter((source) => source.displayPolicy === "display-allowed")
    .flatMap((source) => source.candidates.map((candidate) => ({ source, candidate })))
    .sort((a, b) =>
      compareText(a.source.sourceAssetId, b.source.sourceAssetId) ||
      compareText(a.candidate.candidateId, b.candidate.candidateId),
    );
  const selections = input.scenes.map((scene, index): SceneVisualSelection => {
    const selected = sources[index % Math.max(sources.length, 1)];
    if (!selected) {
      return {
        sceneId: scene.sceneId,
        narrationLineId: scene.narrationLineId,
        rationale: "no-display-allowed-source",
      };
    }
    return {
      sceneId: scene.sceneId,
      narrationLineId: scene.narrationLineId,
      sourceAssetId: selected.source.sourceAssetId,
      candidateId: selected.candidate.candidateId,
      provenanceId: selected.candidate.provenanceId,
      rationale: "display-allowed-source",
    };
  });
  const hasUnavailableScene = selections.some((selection) => !selection.sourceAssetId);
  return {
    schemaVersion: "scene-visual-policy.v1",
    contentProfileId: input.contentProfileId,
    narrationRevisionId: input.narrationRevisionId,
    effectiveConfigurationHash: input.effectiveConfigurationHash,
    dependencyIdentity: Object.fromEntries(
      Object.entries(input.dependencyIdentity).sort(([a], [b]) => compareText(a, b)),
    ),
    selections,
    review: {
      allowed: !hasUnavailableScene,
      reasonCodes: hasUnavailableScene ? ["NO_DISPLAY_ALLOWED_SOURCE"] : [],
    },
  };
}

export function sceneVisualPolicyConfigurationHash(input: {
  readonly narrationRevisionId: string;
  readonly sources: readonly Pick<SceneVisualPolicySource, "sourceAssetId" | "checksum" | "displayPolicy">[];
}): string {
  return createHash("sha256")
    .update(JSON.stringify({
      narrationRevisionId: input.narrationRevisionId,
      sources: [...input.sources].sort((a, b) => compareText(a.sourceAssetId, b.sourceAssetId)),
    }))
    .digest("hex");
}
